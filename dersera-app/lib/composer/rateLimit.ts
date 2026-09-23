import { redisFromEnv, type RedisCommand } from "@/lib/redis";

// Sunucuda öğretmen oturumu olmadığından ücretli uç nokta IP ve günlük toplam sınırla korunur.
export const LIMITS = {
  ipPerHour: 10,
  globalPerDay: 200,
} as const;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface Limiter {
  hit(key: string, windowMs: number): Promise<number>;
}

export function createMemoryLimiter(now: () => number = Date.now): Limiter {
  const buckets = new Map<string, { count: number; until: number }>();
  return {
    async hit(key, windowMs) {
      const t = now();
      const b = buckets.get(key);
      if (!b || b.until <= t) {
        buckets.set(key, { count: 1, until: t + windowMs });
        return 1;
      }
      b.count += 1;
      return b.count;
    },
  };
}

export function createRedisLimiter(command: RedisCommand): Limiter {
  return {
    async hit(key, windowMs) {
      const count = Number(await command(["INCR", key]));
      if (count === 1) await command(["PEXPIRE", key, windowMs]);
      return count;
    },
  };
}

export class LimiterUnavailableError extends Error {}

let limiter: Limiter | null = null;
// Üretimde bellek içi sayaç her sunucu örneğinde ayrı tutulur ve sınırı delinir; bu yüzden Redis zorunludur.
function getLimiter(): Limiter {
  if (!limiter) {
    const command = redisFromEnv();
    if (!command && process.env.NODE_ENV === "production") {
      throw new LimiterUnavailableError("Oran sınırı için Redis gerekli");
    }
    limiter = command ? createRedisLimiter(command) : createMemoryLimiter();
  }
  return limiter;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || "bilinmiyor";
}

export async function checkComposeLimit(ip: string, l: Limiter = getLimiter()): Promise<boolean> {
  const hour = Math.floor(Date.now() / HOUR_MS);
  const day = Math.floor(Date.now() / DAY_MS);
  const [perIp, global] = await Promise.all([
    l.hit(`dersera:compose:ip:${ip}:${hour}`, HOUR_MS),
    l.hit(`dersera:compose:gun:${day}`, DAY_MS),
  ]);
  return perIp <= LIMITS.ipPerHour && global <= LIMITS.globalPerDay;
}

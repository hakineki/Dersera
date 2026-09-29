export type RedisCommand = (args: (string | number)[]) => Promise<unknown>;

// Upstash Redis REST API: gövde bir komut dizisidir, yanıt { result } ya da { error }.
export function createRedisCommand(
  url: string,
  token: string,
  fetchImpl: typeof fetch = fetch
): RedisCommand {
  return async (args) => {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args.map(String)),
      cache: "no-store",
    });
    const body = (await res.json()) as { result?: unknown; error?: string };
    if (!res.ok || body.error) {
      throw new Error(`Redis ${args[0]} başarısız: ${body.error ?? res.status}`);
    }
    return body.result;
  };
}

// Ortam değişkenlerinden Redis komutu; tanımlı değilse null (çağıran ne yapacağına kendisi karar verir).
export function redisFromEnv(): RedisCommand | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return createRedisCommand(url, token);
  return null;
}

export class RedisGerekliError extends Error {}

// Kalıcı depolar için: canlıda Redis yoksa belleğe DÜŞMEZ, hata verir (sunucu başına ayrı ve yeniden başlayınca
// silinen bellek, hesaplar ve oyunlar arasında sessiz tutarsızlık demektir). Uç noktalar bunu 503'e çevirir.
// Geliştirme ve testte null döner: depo bellek sürümünü kullanır.
export function depoKomutu(depo: string): RedisCommand | null {
  const command = redisFromEnv();
  if (!command && process.env.NODE_ENV === "production") {
    console.error(`[redis] Ortam değişkenleri yok; ${depo} deposu açılmadı.`);
    throw new RedisGerekliError(`${depo} için Redis gerekli`);
  }
  return command;
}

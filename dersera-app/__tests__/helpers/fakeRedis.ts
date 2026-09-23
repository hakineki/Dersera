import type { RedisCommand } from "@/lib/redis";

export function recordingCommand(respond: (args: string[]) => unknown = () => "OK") {
  const calls: string[][] = [];
  const command: RedisCommand = async (args) => {
    const strArgs = args.map(String);
    calls.push(strArgs);
    return respond(strArgs);
  };
  return { command, calls };
}

export const REDIS_ENV_KEYS = ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];

export function clearRedisEnv() {
  REDIS_ENV_KEYS.forEach((k) => delete process.env[k]);
}

import {
  mergeLeaderboardEntry,
  nicknameKey,
  sortLeaderboard,
  type LeaderboardEntry,
} from "@/lib/gameState";

export const RESULTS_REDIS_KEY = "dersera:results";

export interface ResultsStore {
  persistent: boolean;
  save(entry: LeaderboardEntry): Promise<void>;
  list(): Promise<LeaderboardEntry[]>;
}

export function createMemoryStore(): ResultsStore {
  let entries: LeaderboardEntry[] = [];
  return {
    persistent: false,
    async save(entry) {
      entries = mergeLeaderboardEntry(entries, entry);
    },
    async list() {
      return [...entries];
    },
  };
}

// Upstash Redis REST API: gövde bir komut dizisidir, yanıt { result } ya da { error }.
export function createRedisStore(
  url: string,
  token: string,
  fetchImpl: typeof fetch = fetch
): ResultsStore {
  async function command(args: string[]): Promise<unknown> {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    const body = (await res.json()) as { result?: unknown; error?: string };
    if (!res.ok || body.error) {
      throw new Error(`Redis ${args[0]} başarısız: ${body.error ?? res.status}`);
    }
    return body.result;
  }

  return {
    persistent: true,
    async save(entry) {
      await command(["HSET", RESULTS_REDIS_KEY, nicknameKey(entry.nickname), JSON.stringify(entry)]);
    },
    async list() {
      const raw = (await command(["HVALS", RESULTS_REDIS_KEY])) as string[];
      return sortLeaderboard(raw.map((r) => JSON.parse(r) as LeaderboardEntry));
    },
  };
}

let store: ResultsStore | null = null;

export function getResultsStore(): ResultsStore {
  if (store) return store;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    store = createRedisStore(url, token);
  } else {
    if (process.env.NODE_ENV === "production") {
      console.warn("[results] Redis ortam değişkenleri yok; sonuçlar bellekte tutuluyor ve kaybolabilir.");
    }
    store = createMemoryStore();
  }
  return store;
}

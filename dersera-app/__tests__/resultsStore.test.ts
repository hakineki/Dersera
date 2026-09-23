import { createMemoryStore, createRedisStore, RESULTS_REDIS_KEY } from "@/lib/resultsStore";
import type { LeaderboardEntry } from "@/lib/gameState";

const entry = (nickname: string, net: number): LeaderboardEntry => ({
  nickname, netSeconds: net, penaltySeconds: 0, hintsUsed: 0, completedAt: 1,
});

function fakeFetch(respond: (args: string[]) => { status?: number; body: unknown }) {
  const calls: { url: string; init: RequestInit; args: string[] }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    const args = JSON.parse(init.body as string) as string[];
    calls.push({ url, init, args });
    const { status = 200, body } = respond(args);
    return { ok: status < 400, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("createMemoryStore", () => {
  it("kalıcı değildir, kaydedip sıralı listeler", async () => {
    const store = createMemoryStore();
    expect(store.persistent).toBe(false);
    await store.save(entry("yavas", 300));
    await store.save(entry("hizli", 100));
    expect((await store.list()).map((e) => e.nickname)).toEqual(["hizli", "yavas"]);
  });

  it("aynı takma adın son kaydını tutar", async () => {
    const store = createMemoryStore();
    await store.save(entry("Kartal", 100));
    await store.save(entry("kartal", 200));
    expect(await store.list()).toEqual([entry("kartal", 200)]);
  });
});

describe("createRedisStore", () => {
  it("HSET komutunu küçük harfli takma ad alanıyla ve Bearer token ile gönderir", async () => {
    const { impl, calls } = fakeFetch(() => ({ body: { result: 1 } }));
    const store = createRedisStore("https://redis.test", "tok", impl);
    expect(store.persistent).toBe(true);

    await store.save(entry("Kartal", 100));

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://redis.test");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(calls[0].args).toEqual(["HSET", RESULTS_REDIS_KEY, "kartal", JSON.stringify(entry("Kartal", 100))]);
  });

  it("HVALS sonucunu çözümleyip sıralar", async () => {
    const { impl, calls } = fakeFetch(() => ({
      body: { result: [JSON.stringify(entry("yavas", 300)), JSON.stringify(entry("hizli", 100))] },
    }));
    const store = createRedisStore("https://redis.test", "tok", impl);

    const list = await store.list();

    expect(calls[0].args).toEqual(["HVALS", RESULTS_REDIS_KEY]);
    expect(list.map((e) => e.nickname)).toEqual(["hizli", "yavas"]);
  });

  it("Redis hata döndürürse fırlatır", async () => {
    const { impl } = fakeFetch(() => ({ body: { error: "WRONGPASS" } }));
    await expect(createRedisStore("https://redis.test", "bad", impl).list()).rejects.toThrow("WRONGPASS");
  });

  it("HTTP hata durumunda fırlatır", async () => {
    const { impl } = fakeFetch(() => ({ status: 500, body: {} }));
    await expect(createRedisStore("https://redis.test", "tok", impl).save(entry("a1", 1))).rejects.toThrow("500");
  });
});

describe("getResultsStore ortam seçimi", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  async function load() {
    let mod!: typeof import("@/lib/resultsStore");
    await jest.isolateModulesAsync(async () => {
      mod = await import("@/lib/resultsStore");
    });
    return mod.getResultsStore();
  }

  it("KV_REST_API_* varsa Redis kullanır", async () => {
    process.env.KV_REST_API_URL = "https://redis.test";
    process.env.KV_REST_API_TOKEN = "tok";
    expect((await load()).persistent).toBe(true);
  });

  it("UPSTASH_REDIS_REST_* değişken adlarını da tanır", async () => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
    expect((await load()).persistent).toBe(true);
  });

  it("değişken yoksa belleğe düşer", async () => {
    for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
      delete process.env[k];
    }
    expect((await load()).persistent).toBe(false);
  });
});

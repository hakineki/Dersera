import { createMemoryStore, createRedisStore, resultsKey, RESULTS_RETENTION_MS } from "@/lib/resultsStore";
import { createRedisCommand } from "@/lib/redis";
import type { LeaderboardEntry } from "@/lib/gameState";
import { clearRedisEnv, recordingCommand } from "./helpers/fakeRedis";

const entry = (nickname: string, net: number): LeaderboardEntry => ({
  nickname, netSeconds: net, penaltySeconds: 0, hintsUsed: 0, completedAt: 1,
});

describe("createMemoryStore", () => {
  it("kalıcı değildir, oyun başına sıralı listeler", async () => {
    const store = createMemoryStore();
    expect(store.persistent).toBe(false);
    await store.save("ABC-123", entry("yavas", 300));
    await store.save("ABC-123", entry("hizli", 100));
    expect((await store.list("ABC-123")).map((e) => e.nickname)).toEqual(["hizli", "yavas"]);
  });

  it("farklı oyunların sonuçları karışmaz", async () => {
    const store = createMemoryStore();
    await store.save("ABC-123", entry("okul1", 100));
    await store.save("XYZ-999", entry("okul2", 100));
    expect((await store.list("ABC-123")).map((e) => e.nickname)).toEqual(["okul1"]);
    expect((await store.list("XYZ-999")).map((e) => e.nickname)).toEqual(["okul2"]);
    expect(await store.list("YOK-000")).toEqual([]);
  });

  it("aynı takma adın son kaydını tutar", async () => {
    const store = createMemoryStore();
    await store.save("ABC-123", entry("Kartal", 100));
    await store.save("ABC-123", entry("kartal", 200));
    expect(await store.list("ABC-123")).toEqual([entry("kartal", 200)]);
  });
});

describe("createRedisStore", () => {
  it("oyuna özel hash'e HSET yazar ve süre sınırı koyar", async () => {
    const { command, calls } = recordingCommand(() => 1);
    await createRedisStore(command).save("ABC-123", entry("Kartal", 100));
    expect(calls).toEqual([
      ["HSET", "dersera:results:ABC-123", "kartal", JSON.stringify(entry("Kartal", 100))],
      ["PEXPIRE", "dersera:results:ABC-123", String(RESULTS_RETENTION_MS)],
    ]);
  });

  it("HVALS sonucunu çözümleyip sıralar", async () => {
    const { command, calls } = recordingCommand(() => [
      JSON.stringify(entry("yavas", 300)),
      JSON.stringify(entry("hizli", 100)),
    ]);
    const list = await createRedisStore(command).list("ABC-123");
    expect(calls[0]).toEqual(["HVALS", resultsKey("ABC-123")]);
    expect(list.map((e) => e.nickname)).toEqual(["hizli", "yavas"]);
  });

  it("has: tabloyu okumadan tek HEXISTS ile, takma ad normalize edilerek", async () => {
    const { command, calls } = recordingCommand((a) => (a[2] === "kartal" ? 1 : 0));
    const store = createRedisStore(command);
    expect(await store.has("ABC-123", " Kartal ")).toBe(true);
    expect(await store.has("ABC-123", "Şahin")).toBe(false);
    expect(calls[0]).toEqual(["HEXISTS", resultsKey("ABC-123"), "kartal"]);
  });
});

describe("createMemoryStore has", () => {
  it("kayıtlı takma adı büyük/küçük harf duyarsız bulur", async () => {
    const store = createMemoryStore();
    await store.save("ABC-123", entry("Kartal", 100));
    expect(await store.has("ABC-123", "kartal")).toBe(true);
    expect(await store.has("ABC-123", "Şahin")).toBe(false);
    expect(await store.has("XYZ-999", "Kartal")).toBe(false);
  });
});

describe("createRedisCommand", () => {
  function fakeFetch(status: number, body: unknown) {
    const calls: { url: string; init: RequestInit }[] = [];
    const impl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { ok: status < 400, status, json: async () => body } as Response;
    }) as unknown as typeof fetch;
    return { impl, calls };
  }

  it("komutu Bearer token ile ve argümanları metin olarak gönderir", async () => {
    const { impl, calls } = fakeFetch(200, { result: "OK" });
    const command = createRedisCommand("https://redis.test", "tok", impl);
    expect(await command(["SET", "k", "v", "PX", 5000])).toBe("OK");
    expect(calls[0].url).toBe("https://redis.test");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(calls[0].init.body as string)).toEqual(["SET", "k", "v", "PX", "5000"]);
  });

  it("Redis hata döndürürse fırlatır", async () => {
    const { impl } = fakeFetch(200, { error: "WRONGPASS" });
    await expect(createRedisCommand("https://redis.test", "bad", impl)(["GET", "k"])).rejects.toThrow("WRONGPASS");
  });

  it("HTTP hata durumunda fırlatır", async () => {
    const { impl } = fakeFetch(500, {});
    await expect(createRedisCommand("https://redis.test", "tok", impl)(["GET", "k"])).rejects.toThrow("500");
  });
});

describe("ortam seçimi", () => {
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
    clearRedisEnv();
    process.env.KV_REST_API_URL = "https://redis.test";
    process.env.KV_REST_API_TOKEN = "tok";
    expect((await load()).persistent).toBe(true);
  });

  it("UPSTASH_REDIS_REST_* değişken adlarını da tanır", async () => {
    clearRedisEnv();
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
    expect((await load()).persistent).toBe(true);
  });

  it("değişken yoksa belleğe düşer", async () => {
    clearRedisEnv();
    expect((await load()).persistent).toBe(false);
  });
});

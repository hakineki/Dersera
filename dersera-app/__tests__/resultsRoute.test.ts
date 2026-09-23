import { clearRedisEnv } from "./helpers/fakeRedis";
import { buildApi, jsonRequest, samplePublish } from "./helpers/api";

const result = {
  nickname: "Kartal",
  netSeconds: 540,
  penaltySeconds: 15,
  hintsUsed: 1,
  completedAt: 1_790_000_000_000,
  stopDetails: { "qr-1": { hintsUsed: 1, completedAt: 1_789_999_000_000 } },
};

describe("/api/results", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  let code: string;

  beforeEach(async () => {
    clearRedisEnv();
    api = await buildApi();
    const res = await api.games.POST(jsonRequest("/api/games", samplePublish()));
    code = (await res.json()).game.code;
  });

  const post = (body: unknown) => api.results.POST(jsonRequest("/api/results", body));
  const get = (c: string) => api.results.GET(new Request(`http://localhost/api/results?code=${encodeURIComponent(c)}`));

  it("GET başlangıçta boş liste ve persistent=false döndürür", async () => {
    const res = await get(code);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [], persistent: false });
  });

  it("oyun kodu olmadan GET 400 döner", async () => {
    expect((await api.results.GET(new Request("http://localhost/api/results"))).status).toBe(400);
  });

  it("geçerli POST 201 döner ve yalnızca o oyunun listesinde görünür", async () => {
    const res = await post({ gameCode: code, result });
    expect(res.status).toBe(201);
    expect((await (await get(code)).json()).results).toEqual([result]);

    const other = (await (await api.games.POST(jsonRequest("/api/games", samplePublish()))).json()).game.code;
    expect((await (await get(other)).json()).results).toEqual([]);
  });

  it("küçük harfli ve tiresiz oyun kodunu da kabul eder", async () => {
    const loose = code.replace("-", "").toLowerCase();
    expect((await post({ gameCode: loose, result })).status).toBe(201);
    expect((await (await get(code)).json()).results).toHaveLength(1);
  });

  it("aynı öğrencinin tekrar gönderimi çift kayıt oluşturmaz", async () => {
    await post({ gameCode: code, result });
    await post({ gameCode: code, result });
    expect((await (await get(code)).json()).results).toHaveLength(1);
  });

  it("birden çok öğrenciyi toplam süreye göre sıralar", async () => {
    await post({ gameCode: code, result: { ...result, nickname: "Yavas", netSeconds: 900 } });
    await post({ gameCode: code, result: { ...result, nickname: "Hizli", netSeconds: 300 } });
    const list = (await (await get(code)).json()).results;
    expect(list.map((e: { nickname: string }) => e.nickname)).toEqual(["Hizli", "Yavas"]);
  });

  it("bilinmeyen oyun koduna 404 döner", async () => {
    expect((await post({ gameCode: "ZZZ-000", result })).status).toBe(404);
  });

  it("süresi bitmiş oyunun sonucunu yine kabul eder (çevrimdışı bitiren öğrenci)", async () => {
    const token = (await (await api.games.POST(jsonRequest("/api/games", samplePublish()))).json()) as {
      game: { code: string };
      adminToken: string;
    };
    await api.end.POST(jsonRequest("/end", { adminToken: token.adminToken }), api.params(token.game.code));
    expect((await post({ gameCode: token.game.code, result })).status).toBe(201);
  });

  it("bozuk JSON'a 400 döner", async () => {
    const res = await api.results.POST(
      new Request("http://localhost/api/results", { method: "POST", body: "{bozuk" })
    );
    expect(res.status).toBe(400);
  });

  it.each([
    ["şemaya uymayan sonuç", () => ({ gameCode: code, result: { ...result, netSeconds: -5 } })],
    ["geçersiz oyun kodu", () => ({ gameCode: "12-ABC", result })],
    ["eksik oyun kodu", () => ({ result })],
  ])("422 döner ve kaydetmez: %s", async (_label, body) => {
    expect((await post(body())).status).toBe(422);
    expect((await (await get(code)).json()).results).toEqual([]);
  });

  it("depolama hatasında 503 döner", async () => {
    process.env.KV_REST_API_URL = "https://redis.test";
    process.env.KV_REST_API_TOKEN = "tok";
    const realFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error("ağ yok")) as unknown as typeof fetch;
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const failing = await buildApi();
      expect((await failing.results.POST(jsonRequest("/api/results", { gameCode: code, result }))).status).toBe(503);
      expect((await failing.results.GET(new Request(`http://localhost/api/results?code=${code}`))).status).toBe(503);
    } finally {
      global.fetch = realFetch;
      spy.mockRestore();
    }
  });
});

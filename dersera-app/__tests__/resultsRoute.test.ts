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
  let anahtar: string;

  async function publish() {
    const res = await api.games.POST(jsonRequest("/api/games", samplePublish()));
    return (await res.json()) as { game: { code: string }; adminToken: string };
  }

  async function join(gameCode: string, nickname: string): Promise<string> {
    const res = await api.join.POST(jsonRequest("/join", { nickname }), api.params(gameCode));
    return (await res.json()).playerToken;
  }

  beforeEach(async () => {
    clearRedisEnv();
    api = await buildApi();
    ({ game: { code }, adminToken: anahtar } = await publish());
  });

  const post = (body: unknown) => api.results.POST(jsonRequest("/api/results", body));
  const get = (c: string, a: string | null = anahtar) =>
    api.results.GET(new Request(`http://localhost/api/results?code=${encodeURIComponent(c)}`, { headers: a === null ? {} : { Authorization: `Bearer ${a}` } }));
  const list = async (c: string, a: string = anahtar) => (await (await get(c, a)).json()).results as { nickname: string }[];

  it("GET başlangıçta boş liste ve persistent=false döndürür", async () => {
    const res = await get(code);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [], persistent: false });
  });

  it("oyun kodu olmadan GET 400 döner", async () => {
    expect((await api.results.GET(new Request("http://localhost/api/results"))).status).toBe(400);
  });

  it("katılan öğrencinin sonucu 201 ile kaydedilir ve yalnızca o oyunda görünür", async () => {
    const playerToken = await join(code, "Kartal");
    expect((await post({ gameCode: code, playerToken, result })).status).toBe(201);
    expect(await list(code)).toEqual([result]);

    const other = await publish();
    expect(await list(other.game.code, other.adminToken)).toEqual([]);
  });

  it("küçük harfli ve tiresiz oyun kodunu da kabul eder", async () => {
    const playerToken = await join(code, "Kartal");
    const loose = code.replace("-", "").toLowerCase();
    expect((await post({ gameCode: loose, playerToken, result })).status).toBe(201);
    expect(await list(code)).toHaveLength(1);
  });

  it("aynı öğrencinin tekrar gönderimi çift kayıt oluşturmaz", async () => {
    const playerToken = await join(code, "Kartal");
    await post({ gameCode: code, playerToken, result });
    await post({ gameCode: code, playerToken, result });
    expect(await list(code)).toHaveLength(1);
  });

  it("birden çok öğrenciyi toplam süreye göre sıralar", async () => {
    const yavas = await join(code, "Yavas");
    const hizli = await join(code, "Hizli");
    await post({ gameCode: code, playerToken: yavas, result: { ...result, nickname: "Yavas", netSeconds: 900 } });
    await post({ gameCode: code, playerToken: hizli, result: { ...result, nickname: "Hizli", netSeconds: 300 } });
    expect((await list(code)).map((e) => e.nickname)).toEqual(["Hizli", "Yavas"]);
  });

  describe("sonuç bütünlüğü", () => {
    it("başka bir öğrenci kendi anahtarıyla bir arkadaşının sonucunu ezemez (403)", async () => {
      const kartal = await join(code, "Kartal");
      const kotu = await join(code, "Kotu");
      await post({ gameCode: code, playerToken: kartal, result });

      const res = await post({ gameCode: code, playerToken: kotu, result: { ...result, netSeconds: 9999 } });
      expect(res.status).toBe(403);
      expect(await list(code)).toEqual([result]);
    });

    it("katılmamış takma adla gönderim reddedilir (403)", async () => {
      const kotu = await join(code, "Kotu");
      expect((await post({ gameCode: code, playerToken: kotu, result: { ...result, nickname: "Hayalet" } })).status).toBe(403);
    });

    it.each([
      ["anahtar yok", undefined],
      ["boş anahtar", ""],
      ["uydurma anahtar", "tahmin-edilen-anahtar"],
      ["metin olmayan anahtar", 42],
      ["çok uzun anahtar", "a".repeat(101)],
    ])("reddeder: %s", async (_label, playerToken) => {
      await join(code, "Kartal");
      expect((await post({ gameCode: code, playerToken, result })).status).toBe(403);
      expect(await list(code)).toEqual([]);
    });

    it("bir oyunun anahtarı başka oyunda geçmez", async () => {
      const other = (await publish()).game.code;
      const tokenInOther = await join(other, "Kartal");
      await join(code, "Kartal");
      expect((await post({ gameCode: code, playerToken: tokenInOther, result })).status).toBe(403);
    });
  });

  it("bilinmeyen oyun koduna 404 döner", async () => {
    expect((await post({ gameCode: "ZZZ-000", playerToken: "x", result })).status).toBe(404);
  });

  it("oyun başında çevrimdışı olup bittikten sonra katılan öğrencinin sonucu kabul edilir", async () => {
    const pub = await publish();
    await api.end.POST(jsonRequest("/end", { adminToken: pub.adminToken }), api.params(pub.game.code));
    const playerToken = await join(pub.game.code, "Cevrimdisi");
    const res = await post({ gameCode: pub.game.code, playerToken, result: { ...result, nickname: "Cevrimdisi" } });
    expect(res.status).toBe(201);
  });

  it("oyun bittikten sonra da katılmış öğrencinin sonucu kabul edilir (çevrimdışı bitiren)", async () => {
    const pub = await publish();
    const playerToken = await join(pub.game.code, "Kartal");
    await api.end.POST(jsonRequest("/end", { adminToken: pub.adminToken }), api.params(pub.game.code));
    expect((await post({ gameCode: pub.game.code, playerToken, result })).status).toBe(201);
  });

  it("bozuk JSON'a 400 döner", async () => {
    const res = await api.results.POST(new Request("http://localhost/api/results", { method: "POST", body: "{bozuk" }));
    expect(res.status).toBe(400);
  });

  it.each([
    ["şemaya uymayan sonuç", () => ({ gameCode: code, playerToken: "x", result: { ...result, netSeconds: -5 } })],
    ["geçersiz oyun kodu", () => ({ gameCode: "12-ABC", playerToken: "x", result })],
    ["eksik oyun kodu", () => ({ playerToken: "x", result })],
  ])("422 döner ve kaydetmez: %s", async (_label, body) => {
    expect((await post(body())).status).toBe(422);
    expect(await list(code)).toEqual([]);
  });

  it("sonuç listesi yalnız yayınlayanın anahtarıyla okunur: anahtarsız ve yanlış anahtarla 403, başka oyunun anahtarı geçmez", async () => {
    const playerToken = await join(code, "Kartal");
    await post({ gameCode: code, playerToken, result });
    expect((await get(code, null)).status).toBe(403);
    expect((await get(code, "yanlis-anahtar")).status).toBe(403);
    expect((await get(code, playerToken)).status).toBe(403);
    const other = await publish();
    expect((await get(code, other.adminToken)).status).toBe(403);
    const r = await api.results.GET(new Request(`http://localhost/api/results?code=${code}`, { headers: { Authorization: `Basic ${anahtar}` } }));
    expect(r.status).toBe(403);
    expect(await list(code)).toEqual([result]);
  });

  it("bilinmeyen oyun kodunda 404 döner", async () => {
    expect((await get("ZZZ-999")).status).toBe(404);
  });

  it("oyun kaydı silindikten sonra da (sonuçlar 7 gün) yayınlayan sonuçları okur", async () => {
    const playerToken = await join(code, "Kartal");
    await post({ gameCode: code, playerToken, result });
    const games = api.gamesStore.getGamesStore() as unknown as { get: (c: string) => Promise<unknown> };
    const eski = games.get;
    games.get = async () => null;
    try {
      expect(await list(code)).toEqual([result]);
      expect((await get(code, "yanlis-anahtar")).status).toBe(403);
    } finally {
      games.get = eski;
    }
  });

  it("yetki özeti olmayan (önceden yayınlanmış) oyunda oyun kaydındaki anahtar geçerlidir", async () => {
    const { createAdminToken, hashToken } = await import("@/lib/gamesService");
    const eskiAnahtar = createAdminToken();
    const now = Date.now();
    await api.gamesStore.getGamesStore().create({ code: "ESK-123", stops: [], aylar: [], createdAt: now, expiresAt: now + 3_600_000, endedAt: null, adminTokenHash: await hashToken(eskiAnahtar) }, now);
    expect((await get("ESK-123", eskiAnahtar)).status).toBe(200);
    expect((await get("ESK-123", anahtar)).status).toBe(403);
  });

  it("depolama hatasında 503 döner", async () => {
    process.env.KV_REST_API_URL = "https://redis.test";
    process.env.KV_REST_API_TOKEN = "tok";
    const realFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error("ağ yok")) as unknown as typeof fetch;
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const failing = await buildApi();
      expect(
        (await failing.results.POST(jsonRequest("/api/results", { gameCode: code, playerToken: "x", result }))).status
      ).toBe(503);
      expect((await failing.results.GET(new Request(`http://localhost/api/results?code=${code}`, { headers: { Authorization: `Bearer ${anahtar}` } }))).status).toBe(503);
    } finally {
      global.fetch = realFetch;
      spy.mockRestore();
    }
  });
});

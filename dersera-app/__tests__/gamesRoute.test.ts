import { clearRedisEnv } from "./helpers/fakeRedis";
import { buildApi, jsonRequest, samplePublish } from "./helpers/api";

describe("/api/games", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;

  beforeEach(async () => {
    clearRedisEnv();
    api = await buildApi();
  });

  async function publish(body: unknown = samplePublish()) {
    const res = await api.games.POST(jsonRequest("/api/games", body));
    return { res, data: await res.json() };
  }

  const getGame = (code: string) => api.game.GET(new Request("http://localhost"), api.params(code));
  const join = (code: string, nickname: unknown) =>
    api.join.POST(jsonRequest("/join", { nickname }), api.params(code));
  const end = (code: string, adminToken: unknown) =>
    api.end.POST(jsonRequest("/end", { adminToken }), api.params(code));

  it("yayınlama 201, kod ve yönetici anahtarı döndürür", async () => {
    const { res, data } = await publish();
    expect(res.status).toBe(201);
    expect(data.game.code).toMatch(/^[A-Z]{3}-\d{3}$/);
    expect(typeof data.adminToken).toBe("string");
    expect(data.persistent).toBe(false);
  });

  it("geçersiz ayarlarla yayınlama 422, bozuk JSON 400 döner", async () => {
    expect((await publish({ durationMinutes: 60 })).res.status).toBe(422);
    const bad = await api.games.POST(new Request("http://localhost/api/games", { method: "POST", body: "{" }));
    expect(bad.status).toBe(400);
  });

  it("GET oyunu döndürür ama yönetici anahtarını ya da özetini asla göstermez", async () => {
    const { data } = await publish();
    const res = await getGame(data.game.code);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.active).toBe(true);
    expect(body.players).toBe(0);
    expect(body.game.code).toBe(data.game.code);
    expect(JSON.stringify(body)).not.toContain(data.adminToken);
    expect(body.game).not.toHaveProperty("adminTokenHash");
  });

  it("GET küçük harfli kodu kabul eder, bilinmeyen/bozuk kodda 404 döner", async () => {
    const { data } = await publish();
    expect((await getGame(data.game.code.toLowerCase())).status).toBe(200);
    expect((await getGame("ZZZ-000")).status).toBe(404);
    expect((await getGame("bozuk")).status).toBe(404);
  });

  it("katılım öğrenci sayısını artırır, aynı takma ad bir kez sayılır", async () => {
    const { data } = await publish();
    expect((await join(data.game.code, "Kartal")).status).toBe(201);
    await join(data.game.code, "kartal");
    await join(data.game.code, "Martı");
    expect((await (await getGame(data.game.code)).json()).players).toBe(2);
  });

  it("geçersiz takma adla katılım 422 döner", async () => {
    const { data } = await publish();
    expect((await join(data.game.code, "a")).status).toBe(422);
    expect((await join(data.game.code, 5)).status).toBe(422);
  });

  it("yanlış anahtarla bitirme 403 döner ve oyun aktif kalır", async () => {
    const { data } = await publish();
    expect((await end(data.game.code, "tahmin")).status).toBe(403);
    expect((await end(data.game.code, "")).status).toBe(403);
    expect((await end(data.game.code, 123)).status).toBe(403);
    expect((await (await getGame(data.game.code)).json()).active).toBe(true);
  });

  it("doğru anahtarla bitirilen oyuna yeni katılım yapılamaz (410)", async () => {
    const { data } = await publish();
    expect((await end(data.game.code, data.adminToken)).status).toBe(200);
    const body = await (await getGame(data.game.code)).json();
    expect(body.active).toBe(false);
    expect(body.game.endedAt).toEqual(expect.any(Number));
    expect((await join(data.game.code, "Gec")).status).toBe(410);
  });

  it("süre dolunca oyun kapanır ve yeni katılım 410 döner", async () => {
    jest.useFakeTimers({ now: 1_000_000, doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    try {
      const { data } = await publish(samplePublish({ durationMinutes: 30 }));
      jest.setSystemTime(1_000_000 + 30 * 60 * 1000 - 1);
      expect((await (await getGame(data.game.code)).json()).active).toBe(true);
      jest.setSystemTime(1_000_000 + 30 * 60 * 1000);
      expect((await (await getGame(data.game.code)).json()).active).toBe(false);
      expect((await join(data.game.code, "Gec")).status).toBe(410);
    } finally {
      jest.useRealTimers();
    }
  });

  it("bilinmeyen oyunu bitirme ve katılma 404 döner", async () => {
    expect((await end("ZZZ-000", "x")).status).toBe(404);
    expect((await join("ZZZ-000", "Kartal")).status).toBe(404);
  });

  it("10 okul aynı anda yayınlar; kodlar ve oyuncular birbirine karışmaz", async () => {
    const games = await Promise.all(Array.from({ length: 10 }, () => publish()));
    const codes = games.map((g) => g.data.game.code);
    expect(new Set(codes).size).toBe(10);
    await join(codes[0], "Kartal");
    expect((await (await getGame(codes[0])).json()).players).toBe(1);
    expect((await (await getGame(codes[1])).json()).players).toBe(0);
    expect((await end(codes[1], games[0].data.adminToken)).status).toBe(403);
  });
});

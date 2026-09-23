import { clearRedisEnv, recordingCommand } from "./helpers/fakeRedis";
import { buildApi, jsonRequest } from "./helpers/api";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";
import { getUniteler } from "@/data/mufredat/programlar";
import { KUTUPHANE_HEADER, KUTUPHANE_LIMIT, kayitOlustur } from "@/lib/library";
import { createRedisLibraryStore } from "@/lib/libraryStore";
import type { GameDefinition } from "@/lib/composer/definition";

const input = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const definition = makeDefinition(input, 7);
const dersler = [{ ders: "fizik", konuId: getUniteler(10, "fizik")[0].id }];
const A = "a".repeat(43);
const B = "b".repeat(43);

describe("oyun kütüphanesi", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  const fetchSpy = jest.fn(() => Promise.reject(new Error("dış ağ çağrısı yapılmamalı")));

  beforeEach(async () => {
    clearRedisEnv();
    delete process.env.ANTHROPIC_API_KEY;
    global.fetch = fetchSpy as unknown as typeof fetch;
    fetchSpy.mockClear();
    api = await buildApi();
  });

  const withKey = (req: Request, key: string | null) => {
    if (key) req.headers.set(KUTUPHANE_HEADER, key);
    return req;
  };
  const get = (path: string, key: string | null) => withKey(new Request(`http://localhost${path}`), key);

  async function composerYayinla(key: string | null = A, def: GameDefinition = definition) {
    const res = await api.games.POST(jsonRequest("/api/games", { composer: { definition: def, dersler }, kutuphane: key }));
    return { res, data: await res.json() };
  }
  async function liste(key: string | null) {
    const res = await api.library.GET(get("/api/library", key));
    return { res, data: await res.json() };
  }
  async function yenidenYayinla(id: string, key: string | null = A, body: unknown = {}) {
    const res = await api.libraryPublish.POST(withKey(jsonRequest(`/api/library/${id}/publish`, body), key), api.idParams(id));
    return { res, data: await res.json() };
  }

  it("composer yayını kütüphaneye düşer; liste özet alanlarını verir, tam tanımı vermez", async () => {
    const { res, data } = await composerYayinla();
    expect(res.status).toBe(201);
    expect(data.kutuphaneId).toMatch(/^[a-z0-9]{8,32}$/);
    const { data: l } = await liste(A);
    expect(l.oyunlar).toHaveLength(1);
    expect(l.oyunlar[0]).toMatchObject({
      id: data.kutuphaneId,
      baslik: definition.meta.baslik,
      ders: definition.meta.ders,
      konu: definition.meta.konu,
      sinif: 10,
      sure_dk: 40,
      deneyim: "dengeli",
      durakSayisi: 7,
      sonKod: data.game.code,
    });
    expect(typeof l.oyunlar[0].createdAt).toBe("number");
    expect(l.oyunlar[0]).not.toHaveProperty("definition");
  });

  it("anahtarsız ya da bozuk anahtarla 401; başka anahtar başkasının oyunlarını görmez", async () => {
    await composerYayinla();
    expect((await liste(null)).res.status).toBe(401);
    expect((await liste("kisa")).res.status).toBe(401);
    expect((await liste(B)).data.oyunlar).toEqual([]);
  });

  it("anahtar göndermeyen yayın ve klasik yayın kütüphaneye düşmez", async () => {
    expect((await composerYayinla(null)).data.kutuphaneId).toBeNull();
    const klasik = await api.games.POST(
      jsonRequest("/api/games", { durationMinutes: 60, aylar: ["eylul"], stops: [{ qr: 1, name: "A", emoji: "x", dersKey: "matematik", hikaye: "h" }], kutuphane: A })
    );
    expect(klasik.status).toBe(201);
    expect((await klasik.json()).kutuphaneId).toBeNull();
    expect((await liste(A)).data.oyunlar).toEqual([]);
  });

  it("tekrar yayın yeni kod üretir, dış API çağrısı yapmaz, son kodu günceller", async () => {
    const { data } = await composerYayinla();
    const r = await yenidenYayinla(data.kutuphaneId);
    expect(r.res.status).toBe(201);
    expect(r.data.game.code).toMatch(/^[A-Z]{3}-\d{3}$/);
    expect(r.data.game.code).not.toBe(data.game.code);
    expect(r.data.game.definition).toEqual(definition);
    expect(typeof r.data.adminToken).toBe("string");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((await liste(A)).data.oyunlar[0].sonKod).toBe(r.data.game.code);
    const oyun = await api.game.GET(new Request("http://localhost"), api.params(r.data.game.code));
    expect(oyun.status).toBe(200);
  });

  it("tekrar yayında süre ayarlanır; geçersiz süre 422", async () => {
    const { data } = await composerYayinla();
    const r = await yenidenYayinla(data.kutuphaneId, A, { durationMinutes: 30 });
    expect(r.data.game.expiresAt - r.data.game.createdAt).toBe(30 * 60 * 1000);
    expect((await yenidenYayinla(data.kutuphaneId, A, { durationMinutes: 2 })).res.status).toBe(422);
    expect((await yenidenYayinla(data.kutuphaneId, A, { durationMinutes: "60" })).res.status).toBe(422);
  });

  it("başkasının oyununu yayınlayamaz, göremez, silemez", async () => {
    const { data } = await composerYayinla();
    const id = data.kutuphaneId;
    expect((await yenidenYayinla(id, B)).res.status).toBe(404);
    expect((await api.libraryItem.GET(get(`/api/library/${id}`, B), api.idParams(id))).status).toBe(404);
    const sil = await api.libraryItem.DELETE(withKey(new Request(`http://localhost/api/library/${id}`, { method: "DELETE" }), B), api.idParams(id));
    expect(sil.status).toBe(404);
    expect((await liste(A)).data.oyunlar).toHaveLength(1);
  });

  it("önizleme tam tanımı döndürür; silinen oyun listeden kalkar ve tekrar yayınlanamaz", async () => {
    const { data } = await composerYayinla();
    const id = data.kutuphaneId;
    const tam = await api.libraryItem.GET(get(`/api/library/${id}`, A), api.idParams(id));
    expect((await tam.json()).oyun.definition).toEqual(definition);
    const sil = () => api.libraryItem.DELETE(withKey(new Request(`http://localhost/api/library/${id}`, { method: "DELETE" }), A), api.idParams(id));
    expect((await sil()).status).toBe(200);
    expect((await sil()).status).toBe(404);
    expect((await liste(A)).data.oyunlar).toEqual([]);
    expect((await yenidenYayinla(id)).res.status).toBe(404);
  });

  it("bozuk kimlikte 404 döner", async () => {
    expect((await yenidenYayinla("../x")).res.status).toBe(404);
    expect((await api.libraryItem.GET(get("/api/library/ABC", A), api.idParams("ABC"))).status).toBe(404);
  });

  it(`kütüphane ${KUTUPHANE_LIMIT} oyunla dolunca yayın yine olur ama kütüphaneye eklenmez`, async () => {
    for (let i = 0; i < KUTUPHANE_LIMIT; i++) expect((await composerYayinla()).data.kutuphaneId).not.toBeNull();
    const { res, data } = await composerYayinla();
    expect(res.status).toBe(201);
    expect(data.kutuphaneId).toBeNull();
    expect((await liste(A)).data.oyunlar).toHaveLength(KUTUPHANE_LIMIT);
  });

  it("liste en yeni oyunu önce verir", async () => {
    jest.spyOn(Date, "now").mockReturnValueOnce(1000);
    const eski = (await composerYayinla()).data.kutuphaneId;
    const yeni = (await composerYayinla()).data.kutuphaneId;
    jest.restoreAllMocks();
    expect((await liste(A)).data.oyunlar.map((o: { id: string }) => o.id)).toEqual([yeni, eski]);
  });
});

describe("Redis kütüphane deposu", () => {
  it("öğretmen başına tek hash anahtarı kullanır ve süre koymaz", async () => {
    const kayit = kayitOlustur("abcdefgh12", definition, dersler as never, "ABC-123", 1);
    const store = new Map<string, string>();
    const { command, calls } = recordingCommand((a) => {
      if (a[0] === "HSET") return store.set(a[2], a[3]) && 1;
      if (a[0] === "HVALS") return [...store.values()];
      if (a[0] === "HGET") return store.get(a[2]) ?? null;
      if (a[0] === "HDEL") return store.delete(a[2]) ? 1 : 0;
      if (a[0] === "HLEN") return store.size;
    });
    const s = createRedisLibraryStore(command);
    await s.put("sahip", kayit);
    expect(await s.get("sahip", kayit.id)).toEqual(kayit);
    expect(await s.list("sahip")).toEqual([kayit]);
    expect(await s.count("sahip")).toBe(1);
    expect(await s.remove("sahip", kayit.id)).toBe(true);
    expect(calls.every((c) => c[1] === "dersera:kutuphane:sahip")).toBe(true);
    expect(calls.some((c) => /EXPIRE/.test(c[0]))).toBe(false);
  });
});

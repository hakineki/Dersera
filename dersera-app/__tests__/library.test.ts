import { clearRedisEnv, recordingCommand } from "./helpers/fakeRedis";
import { buildApi, jsonRequest } from "./helpers/api";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";
import { getUniteler } from "@/data/mufredat/programlar";
import { KUTUPHANE_HEADER, KUTUPHANE_LIMIT, kayitOlustur } from "@/lib/library";
import { createRedisLibraryStore } from "@/lib/libraryStore";

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

  async function kaydet(key: string | null = A, def: unknown = definition) {
    const res = await api.library.POST(withKey(jsonRequest("/api/library", { definition: def, dersler }), key));
    return { res, data: await res.json() };
  }
  async function guncelle(id: string, def: unknown, key: string | null = A) {
    const req = withKey(new Request(`http://localhost/api/library/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ definition: def }) }), key);
    const res = await api.libraryItem.PUT(req, api.idParams(id));
    return { res, data: await res.json() };
  }
  async function detay(id: string, key: string | null = A) {
    const res = await api.libraryItem.GET(get(`/api/library/${id}`, key), api.idParams(id));
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

  it("Kütüphaneye kaydet oyunu ekler; liste özet alanlarını verir, tam tanımı vermez", async () => {
    const { res, data } = await kaydet();
    expect(res.status).toBe(201);
    expect(data.id).toMatch(/^[a-z0-9]{8,32}$/);
    expect(data.validation.gecerli).toBe(true);
    const { data: l } = await liste(A);
    expect(l.oyunlar).toHaveLength(1);
    expect(l.oyunlar[0]).toMatchObject({
      id: data.id,
      baslik: definition.meta.baslik,
      ders: definition.meta.ders,
      konu: definition.meta.konu,
      sinif: 10,
      sure_dk: 40,
      deneyim: "dengeli",
      durakSayisi: 7,
      sonKod: null,
      sonYayin: null,
    });
    expect(typeof l.oyunlar[0].createdAt).toBe("number");
    expect(l.oyunlar[0]).not.toHaveProperty("definition");
  });

  it("anahtarsız ya da bozuk anahtarla 401; başka anahtar başkasının oyunlarını görmez", async () => {
    await kaydet();
    expect((await liste(null)).res.status).toBe(401);
    expect((await liste("kisa")).res.status).toBe(401);
    expect((await liste(B)).data.oyunlar).toEqual([]);
  });

  it("yayınlamak kütüphaneye yazmaz; kaydetmek anahtar ister", async () => {
    const yayin = await api.games.POST(jsonRequest("/api/games", { composer: { definition, dersler }, kutuphane: A }));
    expect(yayin.status).toBe(201);
    expect(await yayin.json()).not.toHaveProperty("kutuphaneId");
    expect((await liste(A)).data.oyunlar).toEqual([]);
    expect((await kaydet(null)).res.status).toBe(401);
  });

  it("doğrulamadan geçmeyen oyun da kaydedilir (sonra düzeltilir); şemaya uymayan ya da konusu tutmayan reddedilir", async () => {
    const yarim = JSON.parse(JSON.stringify(definition));
    yarim.duraklar[0].gorev.soru = "";
    const { res, data } = await kaydet(A, yarim);
    expect(res.status).toBe(201);
    expect(data.validation.gecerli).toBe(false);
    expect((await kaydet(A, { meta: {} })).res.status).toBe(422);
    const baskaKonu = JSON.parse(JSON.stringify(definition));
    baskaKonu.meta.konu = "Uydurma";
    expect((await kaydet(A, baskaKonu)).res.status).toBe(422);
  });

  it("detay düzenleyici için hedefleri, ders hedeflerini ve doğrulamayı verir", async () => {
    const { data } = await kaydet();
    const d = await detay(data.id);
    expect(d.res.status).toBe(200);
    expect(d.data.oyun.definition).toEqual(definition);
    expect(d.data.hedefler.map((h: { kod: string }) => h.kod)).toEqual(input.ogrenmeCiktilari.map((o) => o.kod));
    expect(Object.keys(d.data.hedefDersleri)).toEqual(["Fizik"]);
    expect(d.data.validation.gecerli).toBe(true);
  });

  it("düzenleme aynı kayda yazılır; oluşturulma tarihi ve son kod korunur", async () => {
    const { data } = await kaydet();
    const yayin = await yenidenYayinla(data.id);
    const duzenli = JSON.parse(JSON.stringify(definition));
    duzenli.duraklar[0].gorev.soru = "Yeni soru?";
    duzenli.meta.baslik = "Yeni Başlık";
    const u = await guncelle(data.id, duzenli);
    expect(u.res.status).toBe(200);
    expect(u.data.validation.gecerli).toBe(true);
    const d = await detay(data.id);
    expect(d.data.oyun.definition.duraklar[0].gorev.soru).toBe("Yeni soru?");
    expect(d.data.oyun.baslik).toBe("Yeni Başlık");
    expect(d.data.oyun.sonKod).toBe(yayin.data.game.code);
    const l = (await liste(A)).data.oyunlar;
    expect(l).toHaveLength(1);
    expect(l[0].createdAt).toBe(d.data.oyun.createdAt);
    // Tekrar yayın düzenlenmiş hâli kullanır.
    expect((await yenidenYayinla(data.id)).data.game.definition.duraklar[0].gorev.soru).toBe("Yeni soru?");
  });

  it("düzenleme, bu arada silinen kaydı geri getirmez; çok büyük tanım 413", async () => {
    const { data } = await kaydet();
    const store = api.libraryStore.getLibraryStore();
    const sahip = await api.libraryService.sahipOf(A);
    const get = jest.spyOn(store, "get");
    // PUT kaydı okuduktan hemen sonra silinmiş gibi.
    get.mockImplementationOnce(async (o, i) => {
      const k = await store.list(o).then((l) => l.find((x) => x.id === i) ?? null);
      await store.remove(o, i);
      return k;
    });
    expect((await guncelle(data.id, definition)).res.status).toBe(404);
    get.mockRestore();
    expect(await store.list(sahip)).toEqual([]);
    const buyuk = JSON.parse(JSON.stringify(definition));
    buyuk.hikaye_giris = "x".repeat(70 * 1024);
    const yeni = await kaydet();
    expect((await guncelle(yeni.data.id, buyuk)).res.status).toBe(413);
  });

  it("düzenleme ders/konu değiştiremez, başkasının kaydına yazamaz, bozuk tanımı reddeder", async () => {
    const { data } = await kaydet();
    const baskaDers = JSON.parse(JSON.stringify(definition));
    baskaDers.meta.ders = "Kimya";
    expect((await guncelle(data.id, baskaDers)).res.status).toBe(422);
    expect((await guncelle(data.id, definition, B)).res.status).toBe(404);
    expect((await guncelle(data.id, { duraklar: "x" })).res.status).toBe(422);
    expect((await guncelle("olmayanid1", definition)).res.status).toBe(404);
    expect((await detay(data.id)).data.oyun.definition).toEqual(definition);
  });

  it("tekrar yayın yeni kod üretir, dış API çağrısı yapmaz, son kodu günceller", async () => {
    const { data } = await kaydet();
    const r = await yenidenYayinla(data.id);
    expect(r.res.status).toBe(201);
    expect(r.data.game.code).toMatch(/^[A-Z]{3}-\d{3}$/);
    expect(r.data.game.definition).toEqual(definition);
    expect(typeof r.data.adminToken).toBe("string");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((await liste(A)).data.oyunlar[0].sonKod).toBe(r.data.game.code);
    const oyun = await api.game.GET(new Request("http://localhost"), api.params(r.data.game.code));
    expect(oyun.status).toBe(200);
  });

  it("tekrar yayında süre ayarlanır; geçersiz süre 422", async () => {
    const { data } = await kaydet();
    const r = await yenidenYayinla(data.id, A, { durationMinutes: 30 });
    expect(r.data.game.expiresAt - r.data.game.createdAt).toBe(30 * 60 * 1000);
    expect((await yenidenYayinla(data.id, A, { durationMinutes: 2 })).res.status).toBe(422);
    expect((await yenidenYayinla(data.id, A, { durationMinutes: "60" })).res.status).toBe(422);
  });

  it("başkasının oyununu yayınlayamaz, göremez, silemez", async () => {
    const { data } = await kaydet();
    const id = data.id;
    expect((await yenidenYayinla(id, B)).res.status).toBe(404);
    expect((await api.libraryItem.GET(get(`/api/library/${id}`, B), api.idParams(id))).status).toBe(404);
    const sil = await api.libraryItem.DELETE(withKey(new Request(`http://localhost/api/library/${id}`, { method: "DELETE" }), B), api.idParams(id));
    expect(sil.status).toBe(404);
    expect((await liste(A)).data.oyunlar).toHaveLength(1);
  });

  it("önizleme tam tanımı döndürür; silinen oyun listeden kalkar ve tekrar yayınlanamaz", async () => {
    const { data } = await kaydet();
    const id = data.id;
    const tam = await api.libraryItem.GET(get(`/api/library/${id}`, A), api.idParams(id));
    expect((await tam.json()).oyun.definition).toEqual(definition);
    const sil = () => api.libraryItem.DELETE(withKey(new Request(`http://localhost/api/library/${id}`, { method: "DELETE" }), A), api.idParams(id));
    expect((await sil()).status).toBe(200);
    expect((await sil()).status).toBe(404);
    expect((await liste(A)).data.oyunlar).toEqual([]);
    expect((await yenidenYayinla(id)).res.status).toBe(404);
  });

  it("tekrar yayın, bu arada silinen kaydı geri getirmez", async () => {
    const { data } = await kaydet();
    // Kayıt yayın sırasında silinmiş gibi: replace yazmamalı.
    const store = api.libraryStore.getLibraryStore();
    const sahip = await api.libraryService.sahipOf(A);
    const kayit = (await store.list(sahip))[0];
    await store.remove(sahip, kayit.id);
    expect(await store.replace(sahip, kayit)).toBe(false);
    expect(await store.list(sahip)).toEqual([]);
    expect((await yenidenYayinla(data.id)).res.status).toBe(404);
  });

  it("kütüphane deposu hata verirse kaydet 503 döner", async () => {
    const spy = jest.spyOn(api.libraryStore, "getLibraryStore").mockImplementation(() => {
      throw new Error("redis kapalı");
    });
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    const { res } = await kaydet();
    spy.mockRestore();
    err.mockRestore();
    expect(res.status).toBe(503);
  });

  it("kayıtlı tanım doğrulamadan geçmiyorsa tekrar yayın 422 döner", async () => {
    const { data } = await kaydet();
    const store = api.libraryStore.getLibraryStore();
    const sahip = await api.libraryService.sahipOf(A);
    const kayit = await store.get(sahip, data.id);
    kayit!.definition.duraklar[0].gorev.soru = "";
    await store.put(sahip, kayit!);
    const r = await yenidenYayinla(data.id);
    expect(r.res.status).toBe(422);
    expect(r.data.validation.hatalar.map((h: { kod: string }) => h.kod)).toContain("soru-bos");
  });

  it("bozuk kimlikte 404 döner", async () => {
    expect((await yenidenYayinla("../x")).res.status).toBe(404);
    expect((await api.libraryItem.GET(get("/api/library/ABC", A), api.idParams("ABC"))).status).toBe(404);
  });

  it(`kütüphane ${KUTUPHANE_LIMIT} oyunla dolunca yeni kayıt 409 döner`, async () => {
    for (let i = 0; i < KUTUPHANE_LIMIT; i++) expect((await kaydet()).res.status).toBe(201);
    const { res, data } = await kaydet();
    expect(res.status).toBe(409);
    expect(data.error).toContain("dolu");
    expect((await liste(A)).data.oyunlar).toHaveLength(KUTUPHANE_LIMIT);
  });

  it("liste en yeni oyunu önce verir", async () => {
    jest.spyOn(Date, "now").mockReturnValueOnce(1000);
    const eski = (await kaydet()).data.id;
    const yeni = (await kaydet()).data.id;
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

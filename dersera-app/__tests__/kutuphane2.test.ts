import { getUniteler } from "@/data/mufredat/programlar";
import type { GameDefinition } from "@/lib/composer/definition";
import { KOLEKSIYON, koleksiyonAdi } from "@/lib/koleksiyon";
import { createMemoryKoleksiyonStore, createRedisKoleksiyonStore } from "@/lib/koleksiyonStore";
import { benzerlikPuani, siralamaKarsilastir, type ToplulukOzeti } from "@/lib/topluluk";
import { listeSorgusu } from "@/lib/toplulukService";
import { buildApi, cerezli, hesapAc, jsonRequest, toplulugaKoy, toplulukListesi } from "./helpers/api";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";
import { clearRedisEnv, recordingCommand } from "./helpers/fakeRedis";

const [u0, u1] = getUniteler(10, "fizik");
// tekHedef: bütün duraklar tek öğrenme çıktısına bağlanır (benzerlikte az ortak çıktı).
const fizik = (uniteIndex: number, baslik: string, tekHedef = false): GameDefinition => {
  const d = makeDefinition(resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif", uniteIndex }), 8);
  d.meta.baslik = baslik;
  if (tekHedef) for (const x of d.duraklar) x.gorev.ogrenme_hedefi = d.duraklar[0].gorev.ogrenme_hedefi;
  return d;
};
const matematik = (baslik: string): GameDefinition => {
  const d = makeDefinition(resolvedInput({ sinif: 11, ders: "matematik", sure: 40, deneyim: "dengeli", alan: "sinif" }), 8);
  d.meta.baslik = baslik;
  return d;
};
const ozet = (o: Partial<ToplulukOzeti>): ToplulukOzeti => ({
  oyun_id: "x",
  baslik: "b",
  ders: "Fizik",
  konu: "k",
  sinif: 10,
  sure_dk: 40,
  alan: "sinif",
  deneyim: "dengeli",
  yayin_tarihi: 1,
  oynanma_sayisi: 0,
  puan_ortalama: null,
  puan_sayisi: 0,
  ogretmen_puan_ortalama: null,
  ogretmen_puan_sayisi: 0,
  aktif: true,
  ...o,
});

describe("topluluk kütüphanesi 2.0 kuralları", () => {
  it("benzerlik: aynı sınıf ve ortak ünite şart; ortak öğrenme çıktısı öne geçirir; kendisi ve eski özet sayılmaz", () => {
    const a = ozet({ oyun_id: "a", konular: ["fizik:1"], hedefler: ["K1", "K2", "K3"] });
    expect(benzerlikPuani(a, ozet({ oyun_id: "b", konular: ["fizik:1"], hedefler: ["K1", "K2"] }))).toBe(21);
    expect(benzerlikPuani(a, ozet({ oyun_id: "c", konular: ["fizik:1", "kimya:9"], hedefler: [] }))).toBe(1);
    expect(benzerlikPuani(a, ozet({ oyun_id: "d", konular: ["fizik:2"], hedefler: ["K1"] }))).toBeNull();
    expect(benzerlikPuani(a, ozet({ oyun_id: "e", sinif: 11, konular: ["fizik:1"] }))).toBeNull();
    expect(benzerlikPuani(a, a)).toBeNull();
    expect(benzerlikPuani(a, ozet({ oyun_id: "eski" }))).toBeNull();
  });

  it("sıralama: büyükten küçüğe, puanı görünmeyen sona, eşitlikte yeni önce", () => {
    const list = [ozet({ oyun_id: "a", puan_ortalama: 4, yayin_tarihi: 1 }), ozet({ oyun_id: "b", puan_ortalama: null, yayin_tarihi: 3 }), ozet({ oyun_id: "c", puan_ortalama: 4, yayin_tarihi: 2 })];
    expect(list.sort(siralamaKarsilastir("ogrenci")).map((o) => o.oyun_id)).toEqual(["c", "a", "b"]);
  });

  it("sorgu: ünite ders ve sınıfla birlikte ve programda olmalı; sıralama ve imleç biçimi", () => {
    const q = (s: string) => listeSorgusu(new URLSearchParams(s));
    expect(q(`ders=fizik&sinif=10&konu=${u0.id}`)).toMatchObject({ ok: true, filtre: { konu: `fizik:${u0.id}` }, siralama: "yeni" });
    expect(q(`konu=${u0.id}`)).toEqual({ ok: false, error: "Geçersiz ünite" });
    expect(q(`ders=fizik&sinif=11&konu=${u0.id}`)).toEqual({ ok: false, error: "Geçersiz ünite" });
    expect(q("sirala=oynanan&cursor=o20")).toMatchObject({ ok: true, siralama: "oynanan", imlec: 20 });
    expect(q("sirala=oynanan&cursor=123.4")).toEqual({ ok: false, error: "Geçersiz imleç" });
    expect(q("cursor=o20")).toEqual({ ok: false, error: "Geçersiz imleç" });
    expect(q("sirala=rastgele")).toEqual({ ok: false, error: "Geçersiz sıralama" });
  });

  it("koleksiyon adı: boşluk sadeleşir, görünmez karakter atılır, sınır dışı reddedilir", () => {
    expect(koleksiyonAdi("  3.  ünite\u200b tekrarı ")).toBe("3. ünite tekrarı");
    expect(koleksiyonAdi("   ")).toBeNull();
    expect(koleksiyonAdi("x".repeat(KOLEKSIYON.adEnCok + 1))).toBeNull();
    expect(koleksiyonAdi(5)).toBeNull();
  });
});

describe("koleksiyon deposu", () => {
  it("bellek: sınırlar, tekrar ekleme, silinmiş koleksiyon, hesap yalıtımı, en son eklenen önce", async () => {
    const s = createMemoryKoleksiyonStore();
    for (let i = 0; i < KOLEKSIYON.enCok; i++) expect(await s.olustur("h1", { id: `k${i}`, ad: `K${i}`, olusturma: i })).toBe(true);
    expect(await s.olustur("h1", { id: "fazla", ad: "F", olusturma: 99 })).toBe(false);
    expect(await s.oyunEkle("h1", "k0", "o1", 1)).toBe("ok");
    expect(await s.oyunEkle("h1", "k0", "o2", 2)).toBe("ok");
    expect(await s.oyunEkle("h1", "k0", "o1", 3)).toBe("zaten");
    expect(await s.oyunEkle("h2", "k0", "o1", 3)).toBe("yok");
    expect((await s.listele("h1")).at(0)).toMatchObject({ id: "k0", oyunlar: ["o2", "o1"] });
    expect(await s.adDegistir("h1", "k0", "Favoriler")).toBe(true);
    expect(await s.oyunCikar("h1", "k0", "o2")).toBe(true);
    expect(await s.sil("h1", "k0")).toBe(true);
    expect(await s.oyunEkle("h1", "k0", "o3", 4)).toBe("yok");
    expect(await s.sil("h1", "k0")).toBe(false);
    expect(await s.listele("h2")).toEqual([]);
  });

  it("Redis: anahtarlar KEYS ile, sınırlar Lua içinde", async () => {
    const { command, calls } = recordingCommand((a) => (a[0] === "HGETALL" ? ["k1", JSON.stringify({ id: "k1", ad: "A", olusturma: 1 })] : a[0] === "ZREVRANGE" ? ["o2", "o1"] : a[0] === "EVAL" && a[1].includes("ZADD") ? "ok" : 1));
    const s = createRedisKoleksiyonStore(command);
    expect(await s.olustur("h1", { id: "k1", ad: "A", olusturma: 1 })).toBe(true);
    expect(calls[0].slice(2)).toEqual(["1", "dersera:koleksiyon:h1", "k1", JSON.stringify({ id: "k1", ad: "A", olusturma: 1 }), String(KOLEKSIYON.enCok)]);
    expect(await s.oyunEkle("h1", "k1", "o1", 5)).toBe("ok");
    expect(calls[1].slice(2)).toEqual(["2", "dersera:koleksiyon:h1", "dersera:koleksiyon:h1:k1", "k1", "o1", "5", String(KOLEKSIYON.oyunEnCok)]);
    expect(await s.sil("h1", "k1")).toBe(true);
    expect(calls[2].slice(2, 5)).toEqual(["2", "dersera:koleksiyon:h1", "dersera:koleksiyon:h1:k1"]);
    expect(await s.listele("h1")).toEqual([{ id: "k1", ad: "A", olusturma: 1, oyunlar: ["o2", "o1"] }]);
  });
});

describe("topluluk kütüphanesi 2.0 uçları", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  let ogretmen: string;
  let a: string, b: string, c: string, d: string, e: string;
  beforeEach(async () => {
    clearRedisEnv();
    api = await buildApi();
    ogretmen = await hesapAc(api, "ogretmen1");
    const f0 = [{ ders: "fizik", konuId: u0.id }];
    a = await toplulugaKoy(api, fizik(0, "A"), f0, { yayinTarihi: 1_000 });
    b = await toplulugaKoy(api, fizik(0, "B"), f0, { yayinTarihi: 2_000 });
    e = await toplulugaKoy(api, fizik(0, "E", true), f0, { yayinTarihi: 3_000 });
    c = await toplulugaKoy(api, fizik(1, "C"), [{ ders: "fizik", konuId: u1.id }], { yayinTarihi: 4_000 });
    d = await toplulugaKoy(api, matematik("D"), [{ ders: "matematik", konuId: getUniteler(11, "matematik")[0].id }], { yayinTarihi: 5_000 });
  });

  const liste = async (qs: string) => (await (await toplulukListesi(api, qs)).json()) as { oyunlar: ToplulukOzeti[]; sonraki: string | null };
  const basliklar = async (qs: string) => (await liste(qs)).oyunlar.map((o) => o.baslik);

  it("ünite araması yalnız o ünitenin oyunlarını getirir; kartta öğrenme çıktısı kodları var", async () => {
    expect(await basliklar(`ders=fizik&sinif=10&konu=${u0.id}`)).toEqual(["E", "B", "A"]);
    expect(await basliklar(`ders=fizik&sinif=10&konu=${u1.id}`)).toEqual(["C"]);
    const [ilk] = (await liste(`ders=fizik&sinif=10&konu=${u1.id}`)).oyunlar;
    expect(ilk.konular).toEqual([`fizik:${u1.id}`]);
    expect(ilk.hedefler?.length).toBeGreaterThan(0);
    expect(u1.ogrenmeCiktilari.map((o) => o.kod)).toEqual(expect.arrayContaining(ilk.hedefler!));
    expect((await toplulukListesi(api, `konu=${u0.id}`)).status).toBe(422);
  });

  it("sıralama: en çok oynanan, öğrenci ve öğretmen puanı; sayfalama imleçle", async () => {
    const st = api.toplulukStore.getToplulukStore();
    for (let i = 0; i < 3; i++) await st.oynanmaArtir(c);
    await st.oynanmaArtir(a);
    expect(await basliklar("sirala=oynanan")).toEqual(["C", "A", "D", "E", "B"]);
    const s1 = await liste("sirala=oynanan&limit=2");
    expect([s1.oyunlar.map((o) => o.baslik), s1.sonraki]).toEqual([["C", "A"], "o2"]);
    const s2 = await liste(`sirala=oynanan&limit=2&cursor=${s1.sonraki}`);
    expect(s2.oyunlar.map((o) => o.baslik)).toEqual(["D", "E"]);
    for (const p of [5, 5, 5, 4, 5]) await st.puanEkle(b, p);
    expect((await basliklar("sirala=ogrenci")).at(0)).toBe("B");
    for (const h of ["t1", "t2", "t3"]) await st.ogretmenPuanla(e, h, 5);
    expect((await basliklar("sirala=ogretmen")).at(0)).toBe("E");
    expect((await basliklar("sirala=oynanan&ders=fizik&sinif=10")).at(0)).toBe("C");
  });

  it("benzer oyunlar: aynı sınıf ve ünite, ortak çıktısı çok olan önce; başka ünite ve sınıf yok; oturum ve oyun denetimi", async () => {
    const benzer = (id: string, c: string | null = ogretmen) => api.toplulukBenzer.GET(cerezli(new Request(`http://localhost/api/topluluk/${id}/benzer`), c), api.idParams(id));
    const r = await benzer(a);
    expect(r.status).toBe(200);
    expect(((await r.json()).oyunlar as ToplulukOzeti[]).map((o) => o.baslik)).toEqual(["B", "E"]);
    expect(((await (await benzer(d)).json()).oyunlar as unknown[]).length).toBe(0);
    expect((await benzer(a, null)).status).toBe(401);
    expect((await benzer("00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await benzer("bozuk")).status).toBe(404);
  });

  describe("koleksiyonlar", () => {
    const olustur = (ad: unknown, cz = ogretmen) => api.koleksiyon.POST(cerezli(jsonRequest("/api/koleksiyon", { ad }), cz));
    const listem = async (cz = ogretmen) => (await (await api.koleksiyon.GET(cerezli(new Request("http://localhost/api/koleksiyon"), cz))).json()).koleksiyonlar as { id: string; ad: string; oyunlar: string[] }[];
    const ekle = (id: string, oyunId: string, cz = ogretmen) => api.koleksiyonOyunlar.POST(cerezli(jsonRequest(`/api/koleksiyon/${id}/oyunlar`, { oyunId }), cz), api.idParams(id));
    const cikar = (id: string, oyunId: string) =>
      api.koleksiyonOyun.DELETE(cerezli(new Request(`http://localhost/api/koleksiyon/${id}/oyunlar/${oyunId}`, { method: "DELETE" }), ogretmen), { params: Promise.resolve({ id, oyunId }) });
    const detay = async (id: string, cz = ogretmen) => api.koleksiyonOge.GET(cerezli(new Request(`http://localhost/api/koleksiyon/${id}`), cz), api.idParams(id));

    it("oluştur, ekle, çıkar, yeniden adlandır, sil; oyunlar toplulukta kalır", async () => {
      const r = await olustur(" Favoriler ");
      expect(r.status).toBe(201);
      const { koleksiyon } = await r.json();
      expect(koleksiyon).toMatchObject({ ad: "Favoriler", oyunlar: [] });
      expect((await ekle(koleksiyon.id, a)).status).toBe(201);
      expect((await ekle(koleksiyon.id, c)).status).toBe(201);
      expect((await ekle(koleksiyon.id, a)).status).toBe(201);
      // Aynı milisaniyede eklenenlerin sırası belirsiz; "en son eklenen önce" depo testinde.
      expect([...(await listem())[0].oyunlar].sort()).toEqual([a, c].sort());
      const dt = await (await detay(koleksiyon.id)).json();
      expect(dt.oyunlar.map((o: ToplulukOzeti) => o.baslik).sort()).toEqual(["A", "C"]);
      expect((await cikar(koleksiyon.id, c)).status).toBe(200);
      const put = await api.koleksiyonOge.PUT(cerezli(new Request(`http://localhost/api/koleksiyon/${koleksiyon.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ad: "Ünite 1" }) }), ogretmen), api.idParams(koleksiyon.id));
      expect(put.status).toBe(200);
      expect((await listem())[0]).toMatchObject({ ad: "Ünite 1", oyunlar: [a] });
      const sil = await api.koleksiyonOge.DELETE(cerezli(new Request(`http://localhost/api/koleksiyon/${koleksiyon.id}`, { method: "DELETE" }), ogretmen), api.idParams(koleksiyon.id));
      expect(sil.status).toBe(200);
      expect(await listem()).toEqual([]);
      expect((await basliklar("")).length).toBe(5);
    });

    it("topluluktan kalkan oyun kaldırıldı olarak görünür; yayında olmayan oyun eklenmez; sınırlar ve doğrulama", async () => {
      const { koleksiyon } = await (await olustur("Liste")).json();
      await ekle(koleksiyon.id, b);
      await api.toplulukStore.getToplulukStore().durumGecis(b, ["yayinda"], "geri-cekildi", "yayinda");
      expect((await (await detay(koleksiyon.id)).json()).oyunlar).toEqual([{ oyun_id: b, kaldirildi: true }]);
      expect((await ekle(koleksiyon.id, b)).status).toBe(404);
      expect((await ekle(koleksiyon.id, "bozuk")).status).toBe(422);
      expect((await olustur("")).status).toBe(422);
      for (let i = 1; i < KOLEKSIYON.enCok; i++) expect((await olustur(`K${i}`)).status).toBe(201);
      const fazla = await olustur("Fazla");
      expect(fazla.status).toBe(409);
      expect((await fazla.json()).error).toMatch(/En çok 20/);
    });

    it("başka öğretmenin koleksiyonuna erişilemez; oturumsuz 401; başka siteden yazma 403", async () => {
      const { koleksiyon } = await (await olustur("Benim")).json();
      const baska = await hesapAc(api, "ogretmen2");
      expect((await detay(koleksiyon.id, baska)).status).toBe(404);
      expect((await ekle(koleksiyon.id, a, baska)).status).toBe(404);
      expect(await listem(baska)).toEqual([]);
      expect((await api.koleksiyon.GET(new Request("http://localhost/api/koleksiyon"))).status).toBe(401);
      const req = cerezli(jsonRequest("/api/koleksiyon", { ad: "X" }), ogretmen);
      req.headers.set("sec-fetch-site", "cross-site");
      expect((await api.koleksiyon.POST(req)).status).toBe(403);
    });
  });
});

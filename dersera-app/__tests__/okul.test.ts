import { getUniteler } from "@/data/mufredat/programlar";
import type { GameDefinition } from "@/lib/composer/definition";
import { davetKoduNormal, OKUL } from "@/lib/okul";
import { HATALI_DAVET_SAATLIK } from "@/lib/okulService";
import { createMemoryOkulStore } from "@/lib/okulStore";
import { buildApi, cerezli, hesapAc, jsonRequest } from "./helpers/api";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";
import { clearRedisEnv } from "./helpers/fakeRedis";

const girdi = resolvedInput({ sinif: 6, ders: "fen-bilimleri", sure: 40, deneyim: "dengeli", alan: "sinif" });
const dersler = [{ ders: "fen-bilimleri", konuId: getUniteler(6, "fen-bilimleri")[0].id }];
const oyun = (baslik: string, degistir?: (d: GameDefinition) => void) => {
  const d = makeDefinition(girdi, 6);
  d.meta.baslik = baslik;
  degistir?.(d);
  return d;
};

describe("okul: kurallar", () => {
  it("davet kodu biçimi: küçük harf, boşluk ve tire tolere edilir; karışan karakter reddedilir", () => {
    expect(davetKoduNormal("abcd-efgh")).toBe("ABCDEFGH");
    expect(davetKoduNormal(" ab cd ef gh ")).toBe("ABCDEFGH");
    expect(davetKoduNormal("ABCDEFG0")).toBeNull();
    expect(davetKoduNormal("ABC")).toBeNull();
    expect(davetKoduNormal(12345678)).toBeNull();
  });

  it("depo: öğretmen başına tek okul, üye ve paylaşım sınırları", async () => {
    const s = createMemoryOkulStore();
    const okul = { id: "o1", ad: "A", olusturma: 1, olusturan: "y", davetKodu: "AAAAAAAA" };
    expect(await s.olustur(okul, { hesapId: "y", rol: "yonetici", katilma: 1 })).toBe(true);
    expect(await s.olustur({ ...okul, id: "o2", davetKodu: "BBBBBBBB" }, { hesapId: "y", rol: "yonetici", katilma: 1 })).toBe(false);
    for (let i = 1; i < OKUL.enCokUye; i++) expect(await s.katil("o1", { hesapId: `h${i}`, rol: "ogretmen", katilma: 1 })).toBe("ok");
    expect(await s.katil("o1", { hesapId: "fazla", rol: "ogretmen", katilma: 1 })).toBe("dolu");
    expect(await s.katil("o1", { hesapId: "h1", rol: "ogretmen", katilma: 1 })).toBe("zaten-uye");
    const p = (i: number) => ({ id: `p${i}`, kaynak: `k${i}`, paylasan: "y", baslik: "B", sinif: 6, ders: "Fen", konu: "K", sure_dk: 40, tarih: i, definition: oyun("x"), dersler: [] });
    for (let i = 0; i < OKUL.enCokPaylasim; i++) expect(await s.paylas("o1", p(i))).toBe("ok");
    expect(await s.paylas("o1", p(OKUL.enCokPaylasim))).toBe("dolu");
    // Aynı kaynağın yeniden paylaşımı sınırdayken de yer değiştirir.
    expect(await s.paylas("o1", { ...p(0), id: "p0-yeni" })).toBe("ok");
    expect(await s.paylasim("o1", "p0")).toBeNull();
    expect(await s.paylasim("o1", "p0-yeni")).not.toBeNull();
    // Başka okulun paylaşımı okunamaz.
    expect(await s.paylasim("o2", "p0-yeni")).toBeNull();
  });
});

describe("okul: uç noktalar", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  let yonetici: string;
  let ogretmen: string;
  let yabanci: string;
  beforeEach(async () => {
    clearRedisEnv();
    api = await buildApi();
    yonetici = await hesapAc(api, "yonetici1");
    ogretmen = await hesapAc(api, "ogretmen1");
    yabanci = await hesapAc(api, "yabanci1");
  });

  const post = (mod: { POST: (r: Request) => Promise<Response> }, yol: string, body: unknown, c: string | null) => mod.POST(cerezli(jsonRequest(yol, body), c));
  const get = (mod: { GET: (r: Request) => Promise<Response> }, yol: string, c: string | null) => mod.GET(cerezli(new Request(`http://localhost${yol}`), c));
  const okulum = async (c: string) => (await get(api.okul, "/api/okul", c)).json();
  const okulKur = async (ad = "Atatürk Ortaokulu") => (await (await post(api.okul, "/api/okul", { ad }, yonetici)).json()).okul.davetKodu as string;
  const katil = (kod: string, c = ogretmen) => post(api.okulKatil, "/api/okul/katil", { kod }, c);
  const hesapId = async (ad: string) => (await api.authStore.getAuthStore().idByAd(ad))!;
  const kaydet = async (d: GameDefinition, c = ogretmen) => (await (await api.library.POST(cerezli(jsonRequest("/api/library", { definition: d, dersler }), c))).json()).id as string;
  const paylas = (kutuphaneId: string, c = ogretmen) => post(api.okulPaylasim, "/api/okul/paylasim", { kutuphaneId }, c);
  const liste = (c: string) => get(api.okulPaylasim, "/api/okul/paylasim", c);
  const detay = (id: string, c: string) => api.okulPaylasimOge.GET(cerezli(new Request(`http://localhost/api/okul/paylasim/${id}`), c), api.idParams(id));
  const kaldir = (id: string, c: string) =>
    api.okulPaylasimOge.DELETE(cerezli(new Request(`http://localhost/api/okul/paylasim/${id}`, { method: "DELETE" }), c), api.idParams(id));
  const cikar = async (ad: string, c = yonetici) => {
    const id = await hesapId(ad);
    return api.okulUye.DELETE(cerezli(new Request(`http://localhost/api/okul/uyeler/${id}`, { method: "DELETE" }), c), { params: Promise.resolve({ hesapId: id }) });
  };

  it("oturum yoksa 401; üye olmayan okulu yok görür", async () => {
    expect((await get(api.okul, "/api/okul", null)).status).toBe(401);
    expect(await okulum(yabanci)).toEqual({ okul: null });
    expect((await liste(yabanci)).status).toBe(404);
    expect((await get(api.okulPano, "/api/okul/pano", yabanci)).status).toBe(404);
  });

  it("okul kurma ve davetle katılma: roller, davet kodu yalnız yöneticide, tek okul", async () => {
    expect((await post(api.okul, "/api/okul", { ad: "ab" }, yonetici)).status).toBe(422);
    const kod = await okulKur();
    expect(await okulum(yonetici)).toEqual({ okul: { ad: "Atatürk Ortaokulu", uyeSayisi: 1, davetKodu: kod }, rol: "yonetici" });
    expect((await post(api.okul, "/api/okul", { ad: "İkinci Okul" }, yonetici)).status).toBe(409);
    expect((await katil("ZZZZZZZZ")).status).toBe(404);
    const r = await katil(`${kod.slice(0, 4).toLowerCase()}-${kod.slice(4)}`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ okul: { ad: "Atatürk Ortaokulu", uyeSayisi: 2 }, rol: "ogretmen" });
    expect((await katil(kod)).status).toBe(409);
    // Başka okul kuramaz (zaten üye).
    expect((await post(api.okul, "/api/okul", { ad: "Kaçak Okul" }, ogretmen)).status).toBe(409);
  });

  it("eşzamanlı iki okul kurma ya da iki okula katılma: yalnız biri olur", async () => {
    const [a, b] = await Promise.all([post(api.okul, "/api/okul", { ad: "Okul A" }, yabanci), post(api.okul, "/api/okul", { ad: "Okul B" }, yabanci)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const kod1 = await okulKur("Okul C");
    const kod2 = (await (await post(api.okul, "/api/okul", { ad: "Okul D" }, await hesapAc(api, "baska1"))).json()).okul.davetKodu;
    const [x, y] = await Promise.all([katil(kod1), katil(kod2)]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
  });

  it("üye yönetimi: yalnız yönetici çıkarır; yönetici çıkarılamaz ve ayrılamaz; öğretmen ayrılır", async () => {
    const kod = await okulKur();
    await katil(kod);
    await katil(kod, yabanci);
    expect((await cikar("yabanci1", ogretmen)).status).toBe(403);
    expect((await cikar("yonetici1")).status).toBe(422);
    expect((await post(api.okulAyril, "/api/okul/ayril", {}, yonetici)).status).toBe(422);
    expect((await cikar("yabanci1")).status).toBe(200);
    expect(await okulum(yabanci)).toEqual({ okul: null });
    expect((await cikar("yabanci1")).status).toBe(404);
    expect((await post(api.okulAyril, "/api/okul/ayril", {}, ogretmen)).status).toBe(200);
    expect(await okulum(ogretmen)).toEqual({ okul: null });
    // Ayrılan yeniden katılabilir.
    expect((await katil(kod)).status).toBe(200);
  });

  it("davet kodu yenilenince eskisi geçersiz; yalnız yönetici yeniler", async () => {
    const eski = await okulKur();
    await katil(eski);
    expect((await post(api.okulDavet, "/api/okul/davet", {}, ogretmen)).status).toBe(403);
    const r = await post(api.okulDavet, "/api/okul/davet", {}, yonetici);
    const yeni = (await r.json()).davetKodu as string;
    expect(yeni).not.toBe(eski);
    expect((await katil(eski, yabanci)).status).toBe(404);
    expect((await katil(yeni, yabanci)).status).toBe(200);
  });

  it("eşzamanlı yenilemeler: yalnız okulun güncel kodu geçerli, öksüz kod kalmaz", async () => {
    const ilk = await okulKur();
    const yanitlar = await Promise.all(Array.from({ length: 4 }, () => post(api.okulDavet, "/api/okul/davet", {}, yonetici)));
    const kodlar = await Promise.all(yanitlar.map(async (r) => (await r.json()).davetKodu as string));
    const guncel = (await okulum(yonetici)).okul.davetKodu as string;
    expect(kodlar).toContain(guncel);
    const store = api.okulStore.getOkulStore();
    for (const k of new Set([ilk, ...kodlar])) expect(await store.davettenOkul(k)).toBe(k === guncel ? await store.okulOf(await hesapId("yonetici1")) : null);
  });

  it("hatalı davet kodu denemesi saatte sınırlı; doğru kod sayılmaz", async () => {
    const kod = await okulKur();
    for (let i = 0; i < HATALI_DAVET_SAATLIK; i++) expect((await katil("ZZZZ-ZZZZ", yabanci)).status).toBe(404);
    const r = await katil(kod, yabanci);
    expect(r.status).toBe(429);
    expect((await r.json()).error).toMatch(/Çok fazla/);
    // Sınır hesap başınadır; başka öğretmen etkilenmez ve başarılı katılım sayacı artırmaz.
    expect((await katil(kod)).status).toBe(200);
  });

  it("okul içi paylaşım: üyeler görür ve açar; başka okul ve üye olmayan göremez; yeniden paylaşım yer değiştirir", async () => {
    const kod = await okulKur();
    await katil(kod);
    const kId = await kaydet(oyun("Kuvvet Avı"));
    const r = await paylas(kId);
    expect(r.status).toBe(201);
    const pId = (await r.json()).id as string;
    const l = await (await liste(yonetici)).json();
    expect(l.oyunlar).toEqual([expect.objectContaining({ id: pId, baslik: "Kuvvet Avı", sinif: 6, paylasanAd: "ogretmen1", kaldirabilir: true })]);
    expect((await (await liste(ogretmen)).json()).oyunlar[0].kaldirabilir).toBe(true);
    expect(JSON.stringify(l)).not.toMatch(/definition|kaynak|hesap:/);
    const d = await detay(pId, yonetici);
    expect(d.status).toBe(200);
    expect((await d.json()).oyun.definition.meta.baslik).toBe("Kuvvet Avı");

    // Başka okul: aynı kimlikle bile göremez.
    await post(api.okul, "/api/okul", { ad: "Başka Okul" }, yabanci);
    expect((await detay(pId, yabanci)).status).toBe(404);
    expect((await (await liste(yabanci)).json()).oyunlar).toEqual([]);

    // Kütüphane listesi okul durumunu taşır.
    const kut = await (await api.library.GET(cerezli(new Request("http://localhost/api/library"), ogretmen))).json();
    expect(kut.okul).toEqual({ ad: "Atatürk Ortaokulu" });
    expect(kut.oyunlar.find((o: { id: string }) => o.id === kId).okulPaylasimi).toBe(pId);

    // Yeniden paylaşım: yeni kopya, eskisi kalkar.
    const r2 = await paylas(kId);
    const pId2 = (await r2.json()).id as string;
    expect(pId2).not.toBe(pId);
    expect((await (await liste(yonetici)).json()).oyunlar.map((o: { id: string }) => o.id)).toEqual([pId2]);
    expect((await detay(pId, yonetici)).status).toBe(404);
  });

  it("paylaşım içerik kapılarından geçer; üye olmayan ve başkasının kütüphane kaydı paylaşılamaz", async () => {
    const kod = await okulKur();
    await katil(kod);
    expect((await paylas(await kaydet(oyun("Kaba", (d) => (d.duraklar[2].hikaye_metni = "Siktir git dedi."))))).status).toBe(422);
    const yabancininKaydi = await kaydet(oyun("Yabancı"), yabanci);
    expect((await paylas(yabancininKaydi, yabanci)).status).toBe(404);
    // Öğretmen başkasının kütüphane kimliğini paylaşamaz (kendi kütüphanesinde yok).
    expect((await paylas(yabancininKaydi)).status).toBe(404);
  });

  it("kaldırma: paylaşan ya da yönetici; diğer öğretmen kaldıramaz", async () => {
    const kod = await okulKur();
    await katil(kod);
    await katil(kod, yabanci);
    const pId = (await (await paylas(await kaydet(oyun("Bir")))).json()).id as string;
    expect((await (await liste(yabanci)).json()).oyunlar[0].kaldirabilir).toBe(false);
    expect((await kaldir(pId, yabanci)).status).toBe(403);
    expect((await kaldir(pId, yonetici)).status).toBe(200);
    expect((await (await liste(ogretmen)).json()).oyunlar).toEqual([]);
    const pId2 = (await (await paylas(await kaydet(oyun("İki")))).json()).id as string;
    expect((await kaldir(pId2, ogretmen)).status).toBe(200);
  });

  it("pano: yalnız yönetici; öğretmen başına kütüphane, paylaşım, bitiren öğrenci ve puan", async () => {
    const kod = await okulKur();
    await katil(kod);
    expect((await get(api.okulPano, "/api/okul/pano", ogretmen)).status).toBe(403);
    const k1 = await kaydet(oyun("Bir"));
    await kaydet(oyun("İki"));
    await paylas(k1);
    const s = api.istatistikStore.getIstatistikStore();
    const kaynak = `hesap:${await hesapId("ogretmen1")}:${k1}`;
    for (let i = 0; i < 5; i++) {
      await s.bitirenKaydet("KOD-001", `o${i}`, kaynak, true, 100, 60_000);
      await s.puanKaydet("KOD-001", `o${i}`, kaynak, 4, true, 60_000);
    }
    const pano = await (await get(api.okulPano, "/api/okul/pano", yonetici)).json();
    expect(pano.ogretmenler.map((o: { kullaniciAdi: string; rol: string }) => [o.kullaniciAdi, o.rol])).toEqual([
      ["yonetici1", "yonetici"],
      ["ogretmen1", "ogretmen"],
    ]);
    expect(pano.ogretmenler[1]).toMatchObject({ kutuphaneOyun: 2, paylasim: 1, ogrenci: 5, puanOrtalama: 4 });
    expect(pano.toplam).toEqual({ ogretmen: 2, kutuphaneOyun: 2, paylasim: 1, ogrenci: 5 });
    expect(JSON.stringify(pano)).not.toMatch(/sifre/);
  });
});

import { clearRedisEnv } from "./helpers/fakeRedis";
import { buildApi, hesapAc, jsonRequest, toplulugaKoy } from "./helpers/api";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";
import { getUniteler } from "@/data/mufredat/programlar";
import type { GameDefinition } from "@/lib/composer/definition";
import { TOPLULUK_KURALLARI as K } from "@/lib/topluluk";
import { paylasimUygunlugu } from "@/lib/toplulukPaylasim";
import type { Hesap } from "@/lib/authStore";

const fizik = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const dersler = [{ ders: "fizik", konuId: getUniteler(10, "fizik")[0].id }];
const GUN = 24 * 60 * 60 * 1000;
const oyun = (baslik: string, degistir?: (d: GameDefinition) => void) => {
  const d = makeDefinition(fizik, 8);
  d.meta.baslik = baslik;
  degistir?.(d);
  return d;
};

describe("paylaşım uygunluğu (saf kural)", () => {
  const hesap = (yasGun: number): Hesap => ({ id: "x", kullaniciAdi: "x", sifreOzeti: "", surum: 1, olusturma: Date.now() - yasGun * GUN });
  it("hesap yaşı, öğrenci sayısı ve öğrenci puanı eşikleri gerekçeleriyle", () => {
    expect(paylasimUygunlugu(hesap(5), { ogrenci_sayisi: 10, puan_ortalama: 3.5 }, Date.now())).toEqual({ uygun: true, nedenler: [] });
    const r = paylasimUygunlugu(hesap(1), { ogrenci_sayisi: 7, puan_ortalama: null }, Date.now());
    expect(r.uygun).toBe(false);
    // Hesap yaşı oyunun eksikleri arasında sayılmaz (kütüphanede bir kez gösterilir) ama uygunluğu kapatır.
    expect(r.nedenler).toEqual(["10 öğrenci bitirmeli (şu an 7)", "öğrenci puanı en az 3,5 (henüz yok)"]);
    expect(paylasimUygunlugu(hesap(1), { ogrenci_sayisi: 10, puan_ortalama: 4 }, Date.now())).toEqual({ uygun: false, nedenler: [] });
    expect(paylasimUygunlugu(hesap(5), { ogrenci_sayisi: 12, puan_ortalama: 3.4 }, Date.now()).nedenler).toEqual(["öğrenci puanı en az 3,5 (şu an 3,4)"]);
  });

  it("hesap hazırlığı: kalan gün yukarı yuvarlanır", () => {
    const { hesapHazirligi } = jest.requireActual("@/lib/toplulukPaylasim") as typeof import("@/lib/toplulukPaylasim");
    expect(hesapHazirligi(hesap(0.5), Date.now())).toEqual({ toplulukHazir: false, kalanGun: 3 });
    expect(hesapHazirligi(hesap(2.2), Date.now())).toEqual({ toplulukHazir: false, kalanGun: 1 });
    expect(hesapHazirligi(hesap(3), Date.now())).toEqual({ toplulukHazir: true, kalanGun: 0 });
  });
});

describe("topluluk paylaşımı ve öğretmen incelemesi", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  let sahip: string;
  beforeEach(async () => {
    clearRedisEnv();
    api = await buildApi();
    sahip = await eskiHesap("sahip1");
  });
  afterEach(() => jest.restoreAllMocks());

  // Topluluk kuralı hesap yaşı ister: hesap açılıp oluşturulma zamanı geçmişe çekilir (Date.now taklit edilmez;
  // bellek depoları ilk kullanımda saat fonksiyonunu yakalar).
  async function eskiHesap(ad: string, gunOnce = 10) {
    const c = await hesapAc(api, ad);
    const store = api.authStore.getAuthStore();
    const h = (await store.hesap((await store.idByAd(ad))!))!;
    await store.sifreGuncelle({ ...h, olusturma: Date.now() - gunOnce * GUN });
    return c;
  }
  const cerezli = (req: Request, c: string) => (req.headers.set("cookie", c), req);
  const kaydet = async (definition: GameDefinition, c = sahip) =>
    (await (await api.library.POST(cerezli(jsonRequest("/api/library", { definition, dersler }), c))).json()).id as string;
  const guncelle = async (id: string, definition: GameDefinition, c = sahip) => {
    const put = new Request(`http://localhost/api/library/${id}`, { method: "PUT", headers: { "Content-Type": "application/json", cookie: c }, body: JSON.stringify({ definition }) });
    expect((await api.libraryItem.PUT(put, api.idParams(id))).status).toBe(200);
  };
  const sahipOf = (c: string) => api.libraryService.istekSahibi(cerezli(new Request("http://localhost/"), c)) as Promise<string>;
  // Kütüphane kaydına eşiği geçen saha istatistiği: 10 bitiren, 5 oy (ortalama 4).
  async function esikGec(id: string, c = sahip, puan = 4) {
    const s = api.istatistikStore.getIstatistikStore();
    const kaynak = `${await sahipOf(c)}:${id}`;
    const kod = `T${id.slice(0, 2).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
    await s.kodBagla(kod, kaynak, 1e9);
    for (let i = 0; i < K.enAzOgrenci; i++) await s.bitirenKaydet(kod, `o${i}`, kaynak, true, 60, 1e9);
    for (let i = 0; i < 5; i++) await s.puanKaydet(kod, `o${i}`, kaynak, puan, true, 1e9);
  }
  const paylas = (id: string, c = sahip) => api.libraryTopluluk.POST(cerezli(new Request(`http://localhost/api/library/${id}/topluluk`, { method: "POST" }), c), api.idParams(id));
  const geriCek = (id: string, c = sahip) => api.libraryTopluluk.DELETE(cerezli(new Request(`http://localhost/api/library/${id}/topluluk`, { method: "DELETE" }), c), api.idParams(id));
  const kuyruk = async (c: string) => (await api.inceleme.GET(cerezli(new Request("http://localhost/api/topluluk/inceleme"), c))).json();
  const detay = (id: string, c: string) => api.incelemeOyun.GET(cerezli(new Request(`http://localhost/api/topluluk/inceleme/${id}`), c), api.idParams(id));
  const incele = (id: string, c: string, karar: string, not = "") =>
    api.incelemeOyun.POST(cerezli(jsonRequest(`/api/topluluk/inceleme/${id}`, { karar, not }), c), api.idParams(id));
  const liste = async () => (await (await api.topluluk.GET(new Request("http://localhost/api/topluluk"))).json()).oyunlar as { baslik: string; oyun_id: string }[];
  const kutuphane = async (c = sahip) => (await (await api.library.GET(cerezli(new Request("http://localhost/api/library"), c))).json()).oyunlar;
  const kartOf = async (id: string, c = sahip) => (await kutuphane(c)).find((o: { id: string }) => o.id === id);
  const bekleyenId = async (c: string) => (await kuyruk(c)).oyunlar[0]?.oyun_id as string;
  const yarin = () => {
    const ileri = Date.now() + GUN + 1000;
    jest.spyOn(Date, "now").mockReturnValue(ileri);
  };

  it("eşik altındaki oyun gönderilemez; kütüphane kartı gerekçeleri gösterir, eşik geçince uygun olur", async () => {
    const id = await kaydet(oyun("Eşik"));
    const kart = await kartOf(id);
    expect(kart.paylasim.uygun).toBe(false);
    expect(kart.paylasim.nedenler.join(" ")).toMatch(/10 öğrenci/);
    expect(kart.paylasim.nedenler.join(" ")).not.toMatch(/günlük/);
    expect(kart.topluluk).toBeNull();
    const res = await paylas(id);
    expect(res.status).toBe(422);
    expect((await res.json()).nedenler).toEqual(expect.arrayContaining([expect.stringMatching(/öğrenci/), expect.stringMatching(/puan/)]));
    await esikGec(id, sahip, 3);
    expect((await kartOf(id)).paylasim.nedenler).toEqual([expect.stringMatching(/şu an 3/)]);
    const id2 = await kaydet(oyun("Eşik 2"));
    await esikGec(id2);
    expect((await kartOf(id2)).paylasim).toEqual({ uygun: true, nedenler: [] });
  });

  it("yeni hesap gönderemez ve inceleyemez (hesap yaşı)", async () => {
    const yeni = await hesapAc(api, "yeni1");
    const id = await kaydet(oyun("Yeni"), yeni);
    await esikGec(id, yeni);
    expect((await paylas(id, yeni)).status).toBe(403);
    expect(await kuyruk(yeni)).toMatchObject({ inceleyebilir: false, neden: expect.stringMatching(/3 günlük/), oyunlar: [] });
    const liste = await (await api.library.GET(cerezli(new Request("http://localhost/api/library"), yeni))).json();
    expect(liste.hesap).toEqual({ toplulukHazir: false, kalanGun: 3 });
    expect(liste.oyunlar[0].paylasim).toEqual({ uygun: false, nedenler: [] });
  });

  it("gönderim incelemeye girer, listede görünmez; ikinci kabul ile yayına girer ve kuyruktan çıkar", async () => {
    const id = await kaydet(oyun("Hareket"));
    await esikGec(id);
    const res = await paylas(id);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ durum: "inceleme" });
    expect(await liste()).toEqual([]);
    expect((await kartOf(id)).topluluk).toMatchObject({ durum: "inceleme", kabul: 0, ret: 0 });
    expect((await paylas(id)).status).toBe(409);

    const i1 = await eskiHesap("inceleyen1");
    const i2 = await eskiHesap("inceleyen2");
    const tid = await bekleyenId(i1);
    expect(tid).toMatch(/^[0-9a-f-]{36}$/);
    // Sahip kendi oyununu kuyrukta görmez ve inceleyemez.
    expect((await kuyruk(sahip)).oyunlar).toEqual([]);
    expect((await incele(tid, sahip, "kabul")).status).toBe(403);
    expect((await detay(tid, sahip)).status).toBe(403);

    // İnceleyen tam oyunu ve içerik denetimini görür; gönderen ve diğer inceleyenler gizli.
    const d = await detay(tid, i1);
    expect(d.status).toBe(200);
    const dj = await d.json();
    expect(dj.oyun.definition.meta.baslik).toBe("Hareket");
    expect(dj.yonetisim.karar).toBe("PASS");
    expect(JSON.stringify(dj)).not.toMatch(/olusturan|kaynak|onceki_id|inceleyen|hesap:/);

    expect(await (await incele(tid, i1, "kabul")).json()).toEqual({ durum: "inceleme", kabul: 1, ret: 0 });
    expect((await incele(tid, i1, "kabul")).status).toBe(409);
    expect((await kuyruk(i1)).oyunlar).toEqual([]);
    expect((await kartOf(id)).topluluk).toMatchObject({ durum: "inceleme", kabul: 1 });
    expect(await (await incele(tid, i2, "kabul")).json()).toEqual({ durum: "yayinda", kabul: 2, ret: 0 });
    // Topluluk kabulü sahibine kazanılmış kredi verir (bir kez).
    const kredi = await (await api.kredi.GET(cerezli(new Request("http://localhost/api/kredi"), sahip))).json();
    expect(kredi).toMatchObject({ kazanilan: 5, toplam: 35 });
    expect(kredi.hareketler[0]).toMatchObject({ tur: "odul", miktar: 5, aciklama: "Topluluğa kabul: Hareket" });
    expect((await liste()).map((o) => o.baslik)).toEqual(["Hareket"]);
    expect((await kartOf(id)).topluluk).toMatchObject({ durum: "yayinda" });
    const i3 = await eskiHesap("inceleyen3");
    expect((await kuyruk(i3)).oyunlar).toEqual([]);
    expect((await incele(tid, i3, "kabul")).status).toBe(404);
    // Aynı içerik yeniden gönderilemez.
    expect((await paylas(id)).status).toBe(409);
  });

  it("ret gerekçe ister; iki ret ile reddedilir, gerekçeler sahibine isimsiz gösterilir; değiştirilmeden yeniden gönderilemez", async () => {
    const id = await kaydet(oyun("Ret"));
    await esikGec(id);
    await paylas(id);
    const i1 = await eskiHesap("inceleyen1");
    const i2 = await eskiHesap("inceleyen2");
    const tid = await bekleyenId(i1);
    expect((await incele(tid, i1, "ret", "kısa")).status).toBe(422);
    expect((await incele(tid, i1, "belki")).status).toBe(422);
    expect((await incele(tid, i1, "kabul", "x".repeat(K.notEnCok + 1))).status).toBe(422);
    expect((await incele(tid, i1, "ret", "3. duraktaki doğru cevap yanlış.")).status).toBe(200);
    expect(await (await incele(tid, i2, "ret", "Final sorusu konuyla ilgisiz.")).json()).toEqual({ durum: "reddedildi", kabul: 0, ret: 2 });
    expect(await liste()).toEqual([]);
    const kart = await kartOf(id);
    expect(kart.topluluk).toMatchObject({ durum: "reddedildi", ret: 2, retNotlari: ["3. duraktaki doğru cevap yanlış.", "Final sorusu konuyla ilgisiz."] });
    expect(JSON.stringify(kart)).not.toMatch(/inceleyen|hesap:/);
    yarin();
    expect((await paylas(id)).status).toBe(409);
    await guncelle(id, oyun("Ret (düzeltildi)"));
    expect((await paylas(id)).status).toBe(201);
    // Ret ödül vermez.
    expect((await (await api.kredi.GET(cerezli(new Request("http://localhost/api/kredi"), sahip))).json()).kazanilan).toBe(0);
  });

  it("eşzamanlı geri çekme ile son onay yarışında geri çekme kazanır (oyun yayına girmez)", async () => {
    const id = await kaydet(oyun("Yarış"));
    await esikGec(id);
    await paylas(id);
    const [i1, i2] = [await eskiHesap("inceleyen1"), await eskiHesap("inceleyen2")];
    const tid = await bekleyenId(i1);
    await incele(tid, i1, "kabul");
    // İkinci oy yazıldıktan hemen sonra, eşik geçişinden önce sahibi geri çeker.
    const store = api.toplulukStore.getToplulukStore();
    const gercek = store.incelemeEkle.bind(store);
    jest.spyOn(store, "incelemeEkle").mockImplementationOnce(async (oyunId, inc) => {
      const r = await gercek(oyunId, inc);
      expect((await geriCek(id)).status).toBe(200);
      return r;
    });
    const res = await incele(tid, i2, "kabul");
    expect(await res.json()).toMatchObject({ durum: "geri-cekildi", kabul: 2 });
    expect(await liste()).toEqual([]);
    expect((await kartOf(id)).topluluk).toMatchObject({ durum: "geri-cekildi" });
  });

  it("eşzamanlı iki son kabul oyu tek geçiş yapar; ödül bir kez verilir", async () => {
    const id = await kaydet(oyun("Çift Oy"));
    await esikGec(id);
    await paylas(id);
    const [i1, i2, i3] = [await eskiHesap("inceleyen1"), await eskiHesap("inceleyen2"), await eskiHesap("inceleyen3")];
    const tid = await bekleyenId(i1);
    await incele(tid, i1, "kabul");
    const yanitlar = await Promise.all([incele(tid, i2, "kabul"), incele(tid, i3, "kabul")]);
    // Geç kalan oy ya aynı sonucu görür (200) ya da kayıt artık incelemede olmadığı için 404 alır; yayına bir kez girer.
    const govdeler = await Promise.all(yanitlar.map((r) => r.json()));
    expect(yanitlar.filter((r, i) => r.status === 200 && govdeler[i].durum === "yayinda").length).toBeGreaterThanOrEqual(1);
    expect(yanitlar.every((r) => r.status === 200 || r.status === 404)).toBe(true);
    const kredi = await (await api.kredi.GET(cerezli(new Request("http://localhost/api/kredi"), sahip))).json();
    expect(kredi.kazanilan).toBe(5);
    expect(kredi.hareketler.filter((h: { tur: string }) => h.tur === "odul")).toHaveLength(1);
  });

  it("aynı anda iki gönderim günlük sınırı delemez", async () => {
    const a = await kaydet(oyun("Eş A"));
    const b = await kaydet(oyun("Eş B"));
    await esikGec(a);
    await esikGec(b);
    const sonuclar = (await Promise.all([paylas(a), paylas(b)])).map((r) => r.status).sort();
    expect(sonuclar).toEqual([201, 429]);
  });

  it("günde en fazla bir gönderim", async () => {
    const a = await kaydet(oyun("A"));
    const b = await kaydet(oyun("B"));
    await esikGec(a);
    await esikGec(b);
    expect((await paylas(a)).status).toBe(201);
    const ikinci = await paylas(b);
    expect(ikinci.status).toBe(429);
    expect((await ikinci.json()).error).toMatch(/Günde en fazla 1/);
    yarin();
    expect((await paylas(b)).status).toBe(201);
  });

  it("içerik denetiminden geçmeyen oyun gönderilemez", async () => {
    const id = await kaydet(oyun("Kaba", (d) => (d.duraklar[2].hikaye_metni = "Siktir git.")));
    await esikGec(id);
    const res = await paylas(id);
    expect(res.status).toBe(422);
    expect((await res.json()).yonetisim.karar).toBe("BLOCK");
  });

  it("başka öğretmenin topluluktaki oyununun aynısı gönderilemez", async () => {
    const d = oyun("Kopya");
    await toplulugaKoy(api, d, dersler, { olusturan: "hesap:baskasi" });
    const id = await kaydet(d);
    await esikGec(id);
    const res = await paylas(id);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/aynısı toplulukta/);
  });

  it("yeni sürüm: önceki sürüm onaya kadar yayında kalır, onaylanınca yerini alır", async () => {
    const id = await kaydet(oyun("Sürüm 1"));
    await esikGec(id);
    await paylas(id);
    const [i1, i2] = [await eskiHesap("inceleyen1"), await eskiHesap("inceleyen2")];
    let tid = await bekleyenId(i1);
    await incele(tid, i1, "kabul");
    await incele(tid, i2, "kabul");
    await guncelle(id, oyun("Sürüm 2"));
    yarin();
    expect((await paylas(id)).status).toBe(201);
    expect((await liste()).map((o) => o.baslik)).toEqual(["Sürüm 1"]);
    expect((await kartOf(id)).topluluk).toMatchObject({ durum: "inceleme", oncekiYayinda: true });
    tid = await bekleyenId(i1);
    await incele(tid, i1, "kabul");
    await incele(tid, i2, "kabul");
    expect((await liste()).map((o) => o.baslik)).toEqual(["Sürüm 2"]);
    expect((await kartOf(id)).topluluk).toMatchObject({ durum: "yayinda", oncekiYayinda: false });
  });

  it("geri çekme: yayındaki oyun listeden çıkar; aynı içerik yeniden paylaşılınca incelemesiz geri gelir; incelemedeki yeni sürümle önceki sürüm birlikte çekilir", async () => {
    const id = await kaydet(oyun("Çekilecek"));
    await esikGec(id);
    await paylas(id);
    const [i1, i2] = [await eskiHesap("inceleyen1"), await eskiHesap("inceleyen2")];
    const tid = await bekleyenId(i1);
    await incele(tid, i1, "kabul");
    await incele(tid, i2, "kabul");
    expect((await geriCek(id)).status).toBe(200);
    expect(await liste()).toEqual([]);
    expect((await kartOf(id)).topluluk).toMatchObject({ durum: "geri-cekildi" });
    expect((await geriCek(id)).status).toBe(409);
    // Önceden onaylanmış aynı içerik: yeniden paylaşımda doğrudan yayına döner (günlük sınıra sayılmaz).
    expect(await (await paylas(id)).json()).toEqual({ durum: "yayinda" });
    expect((await liste()).map((o) => o.baslik)).toEqual(["Çekilecek"]);
    // Yeniden paylaşım incelemesiz döndüğü için ikinci ödül verilmez.
    expect((await (await api.kredi.GET(cerezli(new Request("http://localhost/api/kredi"), sahip))).json()).kazanilan).toBe(5);

    await guncelle(id, oyun("Çekilecek v2"));
    yarin();
    await paylas(id);
    expect((await liste()).map((o) => o.baslik)).toEqual(["Çekilecek"]);
    expect((await geriCek(id)).status).toBe(200);
    expect(await liste()).toEqual([]);
    expect((await kuyruk(i1)).oyunlar).toEqual([]);
  });

  it("başkası geri çekemez; oturumsuz istek 401; bozuk kimlik 404", async () => {
    const id = await kaydet(oyun("Benim"));
    await esikGec(id);
    await paylas(id);
    const baska = await eskiHesap("baska1");
    expect((await geriCek(id, baska)).status).toBe(404);
    expect((await api.libraryTopluluk.POST(new Request(`http://localhost/api/library/${id}/topluluk`, { method: "POST" }), api.idParams(id))).status).toBe(401);
    expect((await api.inceleme.GET(new Request("http://localhost/api/topluluk/inceleme"))).status).toBe(401);
    expect((await detay("bozuk", baska)).status).toBe(404);
    expect((await incele("00000000-0000-4000-8000-000000000000", baska, "kabul")).status).toBe(404);
  });

  it("topluluk deposu okunamazsa kütüphane listesi yine gelir (topluluk durumu boş)", async () => {
    const id = await kaydet(oyun("Hata"));
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(api.toplulukStore.getToplulukStore(), "kaynakOku").mockRejectedValue(new Error("redis kapalı"));
    const kart = await kartOf(id);
    expect(kart.topluluk).toBeNull();
    err.mockRestore();
  });
});

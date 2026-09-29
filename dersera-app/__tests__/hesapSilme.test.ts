import { getUniteler } from "@/data/mufredat/programlar";
import { createMemoryAuthStore, createRedisAuthStore } from "@/lib/authStore";
import { createMemoryDenetimKaydiStore, createRedisDenetimKaydiStore, SILINMIS_HESAP } from "@/lib/denetimKaydi";
import { sonAylar } from "@/lib/hesapSilme";
import { ayOf } from "@/lib/kredi";
import { createRedisKrediStore } from "@/lib/krediStore";
import { createRedisOgrenmeTakibiStore } from "@/lib/ogrenmeTakibiStore";
import { icerikOzetiOf, yeniToplulukKaydi } from "@/lib/toplulukService";
import { buildApi, cerezli, hesapAc, jsonRequest, toplulugaKoy } from "./helpers/api";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";
import { clearRedisEnv, recordingCommand } from "./helpers/fakeRedis";
import { createLuaRedis } from "./helpers/luaRedis";
import { anahtarlariTara } from "@/lib/redis";

const girdi = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const dersler = [{ ders: "fizik" as const, konuId: getUniteler(10, "fizik")[0].id }];
const SIFRE = "gizli-sifre-1";

describe("son aylar", () => {
  it("bu ay dahil geriye; yıl dönümünde doğru", () => {
    const ocak = Date.UTC(2027, 0, 15, 12);
    expect(ayOf(ocak)).toBe("2027-01");
    expect(sonAylar(ocak, 3)).toEqual(["2027-01", "2026-12", "2026-11"]);
    expect(sonAylar(ocak, 14)).toHaveLength(14);
    expect(sonAylar(ocak, 14).at(-1)).toBe("2025-12");
  });
});

describe("depo silme komutları", () => {
  it("hesap: hesap, ad ve dizin tek betikte; ad bu arada değiştiyse silinmez", async () => {
    const m = createMemoryAuthStore();
    await m.olustur({ id: "a1", kullaniciAdi: "ayse", sifreOzeti: "x", surum: 1, olusturma: 1 });
    expect(await m.hesapSil("a1", "baska")).toBe(false);
    expect(await m.hesap("a1")).not.toBeNull();
    expect(await m.hesapSil("a1", "ayse")).toBe(true);
    expect([await m.hesap("a1"), await m.idByAd("ayse")]).toEqual([null, null]);
    expect(await m.olustur({ id: "a2", kullaniciAdi: "ayse", sifreOzeti: "y", surum: 1, olusturma: 2 })).toBe(true);

    const { command, calls } = recordingCommand(() => 1);
    expect(await createRedisAuthStore(command).hesapSil("a1", "ayse")).toBe(true);
    expect(calls[0].slice(2)).toEqual(["3", "dersera:hesap:a1", "dersera:hesap:a1:ad", "dersera:hesap-adi:ayse", "a1", "ayse"]);
  });

  it("kredi, öğrenme takibi ve denetim: kişisel anahtarlar silinir, kopya kayıtları kimliksizleşir", async () => {
    const k = recordingCommand(() => 1);
    await createRedisKrediStore(k.command).hesapSil("a1", ["2026-09", "2026-08"]);
    expect(k.calls[0]).toEqual(["DEL", "dersera:kredi:a1:aylik:2026-09", "dersera:kredi:a1:aylik:2026-08", "dersera:kredi:a1:kazanilan", "dersera:kredi:a1:hareketler", "dersera:kredi:a1:aski"]);
    const t = recordingCommand(() => 1);
    await createRedisOgrenmeTakibiStore(t.command).tablolariSil("hesap:a1", ["2026-09", "2026-08"]);
    expect(t.calls[0]).toEqual(["DEL", "dersera:takip:hesap:a1:2026-09", "dersera:takip:hesap:a1:2026-08"]);
    const d = recordingCommand(() => 1);
    await createRedisDenetimKaydiStore(d.command).hesabiUnut("a1");
    expect(d.calls[0]).toEqual(["DEL", "dersera:denetim:kosul-onayi:a1"]);
    expect(d.calls[1].slice(2)).toEqual(["1", "dersera:denetim:kopya", '"hesapId":"a1"', '"hesapId":"silindi"', '"kullaniciAdi":"', '"kullaniciAdi":"silinmiş hesap"']);

    const mem = createMemoryDenetimKaydiStore();
    await mem.kosulOnayiYaz("a1", { surum: "2026-09", tarih: 1 });
    await mem.kopyaEkle({ tarih: 1, hesapId: "a1", kullaniciAdi: "ayse", tur: "topluluk", oyunId: "o1", baslik: "B" });
    await mem.kopyaEkle({ tarih: 2, hesapId: "b1", kullaniciAdi: "bora", tur: "okul", oyunId: "o2", baslik: "C" });
    await mem.hesabiUnut("a1");
    expect(await mem.kosulOnayi("a1")).toBeNull();
    expect(await mem.kopyalar(10)).toEqual([
      { tarih: 2, hesapId: "b1", kullaniciAdi: "bora", tur: "okul", oyunId: "o2", baslik: "C" },
      { tarih: 1, ...SILINMIS_HESAP, tur: "topluluk", oyunId: "o1", baslik: "B" },
    ]);
  });
});

describe("hesabımı sil", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  let ayse: string;
  let bora: string;
  let ayseId: string;
  const eskiYoneticiler = process.env.DERSERA_YONETICILER;

  beforeEach(async () => {
    clearRedisEnv();
    process.env.DERSERA_YONETICILER = "platform1";
    api = await buildApi();
    ayse = await hesapAc(api, "ayse");
    bora = await hesapAc(api, "bora");
    ayseId = (await api.authStore.getAuthStore().idByAd("ayse"))!;
  });
  afterAll(() => {
    if (eskiYoneticiler === undefined) delete process.env.DERSERA_YONETICILER;
    else process.env.DERSERA_YONETICILER = eskiYoneticiler;
  });

  const sil = (c: string, sifre: unknown = SIFRE) => api.hesapSil.POST(cerezli(jsonRequest("/api/auth/hesap-sil", { sifre }), c));
  const ben = async (c: string) => (await (await api.ben.GET(cerezli(new Request("http://localhost/api/auth/ben"), c))).json()).hesap;
  const giris = (ad: string) => api.giris.POST(jsonRequest("/api/auth/giris", { kullaniciAdi: ad, sifre: SIFRE }));

  it("şifre, onay ve oturum ister; yanlış şifrede hiçbir şey silinmez", async () => {
    expect((await api.hesapSil.POST(jsonRequest("/api/auth/hesap-sil", { sifre: SIFRE }))).status).toBe(401);
    const r = await sil(ayse, "yanlis-sifre");
    expect(r.status).toBe(403);
    expect(await ben(ayse)).toMatchObject({ kullaniciAdi: "ayse" });
    expect((await sil(ayse, "")).status).toBe(403);
    const req = cerezli(jsonRequest("/api/auth/hesap-sil", { sifre: SIFRE }), ayse);
    req.headers.set("sec-fetch-site", "cross-site");
    expect((await api.hesapSil.POST(req)).status).toBe(403);
    expect(await ben(ayse)).not.toBeNull();
  });

  it("hesabı ve kişisel verileri siler, topluluktaki oyunu geri çeker, okuldan çıkarır, kopya kaydını kimliksizleştirir; ad yeniden alınabilir", async () => {
    const sahip = `hesap:${ayseId}`;
    const now = Date.now();
    // Okul: bora yönetici, ayse öğretmen; ayse bir oyunu okulla paylaşır.
    const kod = (await (await api.okul.POST(cerezli(jsonRequest("/api/okul", { ad: "Deneme Lisesi" }), bora))).json()).okul.davetKodu;
    expect((await api.okulKatil.POST(cerezli(jsonRequest("/api/okul/katil", { kod }), ayse))).status).toBe(200);
    const def = makeDefinition(girdi, 8);
    const libId = (await (await api.library.POST(cerezli(jsonRequest("/api/library", { definition: def, dersler }), ayse))).json()).id as string;
    expect((await api.okulPaylasim.POST(cerezli(jsonRequest("/api/okul/paylasim", { kutuphaneId: libId }), ayse))).status).toBe(201);
    // Topluluk: ayse'nin kütüphane oyunu yayında.
    const ts = api.toplulukStore.getToplulukStore();
    const kayit = yeniToplulukKaydi(def, dersler, sahip, now, { durum: "yayinda", aktif: true, kaynak: `${sahip}:${libId}` });
    const toplulukId = await ts.ekle(kayit, icerikOzetiOf(def));
    await ts.kaynakGuncelle(`${sahip}:${libId}`, toplulukId);
    // Kopya kaydı: ayse bora'nın topluluk oyununu açar.
    const boraDef = makeDefinition(girdi, 6);
    boraDef.meta.baslik = "Bora'nın oyunu";
    const boraOyun = await toplulugaKoy(api, boraDef, dersler, { olusturan: "hesap:bora" });
    expect((await api.toplulukOyun.GET(cerezli(new Request(`http://localhost/api/topluluk/${boraOyun}`), ayse), api.idParams(boraOyun))).status).toBe(200);
    // Koleksiyon, kredi, öğrenme takibi, ikinci oturum.
    expect((await api.koleksiyon.POST(cerezli(jsonRequest("/api/koleksiyon", { ad: "Favoriler" }), ayse))).status).toBe(201);
    await api.krediStore.getKrediStore().odul(ayseId, 3, now, "Topluluğa kabul: Deneme");
    await api.ogrenmeTakibiStore.getOgrenmeTakibiStore().ogrenciSay(sahip, ayOf(now), "KRT-111", "o1", ["x|A|d"], ["oyun"], 60_000);
    const ikinciOturum = (await giris("ayse")).headers.get("set-cookie")!.split(";")[0];

    const r = await sil(ayse);
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toMatch(/dersera_oturum=;.*Max-Age=0/i);

    // Kimlik: iki oturum da geçersiz, eski şifreyle giriş yok, ad boşa çıktı.
    expect(await ben(ayse)).toBeNull();
    expect(await ben(ikinciOturum)).toBeNull();
    expect((await giris("ayse")).status).not.toBe(200);
    expect(await api.authStore.getAuthStore().hesap(ayseId)).toBeNull();
    // Veriler.
    expect(await api.libraryStore.getLibraryStore().idler(sahip)).toEqual([]);
    expect((await ts.get(toplulukId))?.durum).toBe("geri-cekildi");
    const okul = api.okulStore.getOkulStore();
    expect(await okul.okulOf(ayseId)).toBeNull();
    const okulId = (await okul.okulOf((await api.authStore.getAuthStore().idByAd("bora"))!))!;
    expect((await okul.paylasimlar(okulId)).filter((p) => p.paylasan === ayseId)).toEqual([]);
    expect(await api.koleksiyonStore.getKoleksiyonStore().listele(ayseId)).toEqual([]);
    expect(await api.krediStore.getKrediStore().oku(ayseId, ayOf(now), 10)).toEqual({ kullanilan: 0, kazanilan: 0, hareketler: [] });
    expect(await api.ogrenmeTakibiStore.getOgrenmeTakibiStore().sayaclar(sahip, [ayOf(now)])).toEqual([{}]);
    const denetim = api.denetimKaydi.getDenetimKaydiStore();
    expect(await denetim.kosulOnayi(ayseId)).toBeNull();
    const kopyalar = await denetim.kopyalar(10);
    expect(kopyalar.some((k) => k.hesapId === ayseId || k.kullaniciAdi === "ayse")).toBe(false);
    expect(kopyalar).toContainEqual(expect.objectContaining({ ...SILINMIS_HESAP, oyunId: boraOyun }));
    // Diğer öğretmen etkilenmez; ad yeniden alınabilir.
    expect(await ben(bora)).toMatchObject({ kullaniciAdi: "bora" });
    expect(await hesapAc(api, "ayse")).toBeTruthy();
  });

  it("ayrıldığı okuldaki paylaşım, kütüphaneden silinmiş topluluk oyunu ve önceki sürümler de temizlenir; ad değişmişse eski ad da kalmaz", async () => {
    const sahip = `hesap:${ayseId}`;
    const now = Date.now();
    // Okul 1'de paylaş, sonra ayrıl.
    const kod = (await (await api.okul.POST(cerezli(jsonRequest("/api/okul", { ad: "Eski Okul" }), bora))).json()).okul.davetKodu;
    await api.okulKatil.POST(cerezli(jsonRequest("/api/okul/katil", { kod }), ayse));
    const def = makeDefinition(girdi, 8);
    const libId = (await (await api.library.POST(cerezli(jsonRequest("/api/library", { definition: def, dersler }), ayse))).json()).id as string;
    expect((await api.okulPaylasim.POST(cerezli(jsonRequest("/api/okul/paylasim", { kutuphaneId: libId }), ayse))).status).toBe(201);
    expect((await api.okulAyril.POST(cerezli(jsonRequest("/api/okul/ayril", {}), ayse))).status).toBe(200);
    const okul = api.okulStore.getOkulStore();
    const eskiOkul = (await okul.okulOf((await api.authStore.getAuthStore().idByAd("bora"))!))!;
    expect((await okul.paylasimlar(eskiOkul)).some((p) => p.paylasan === ayseId)).toBe(true);
    // Topluluk: kütüphane kaydı olmayan (silinmiş) yayındaki oyun + önceki sürüm yayında, yenisi incelemede.
    const ts = api.toplulukStore.getToplulukStore();
    const d1 = makeDefinition(girdi, 6);
    d1.meta.baslik = "Yetim oyun";
    const yetim = await ts.ekle(yeniToplulukKaydi(d1, dersler, sahip, now, { durum: "yayinda", aktif: true, kaynak: `${sahip}:silinmis-kayit` }), icerikOzetiOf(d1));
    const d2 = makeDefinition(girdi, 7);
    d2.meta.baslik = "Sürüm 1";
    const s1 = await ts.ekle(yeniToplulukKaydi(d2, dersler, sahip, now, { durum: "yayinda", aktif: true, kaynak: `${sahip}:${libId}` }), icerikOzetiOf(d2));
    const d3 = makeDefinition(girdi, 9);
    d3.meta.baslik = "Sürüm 2";
    const s2 = await ts.ekle(yeniToplulukKaydi(d3, dersler, sahip, now, { durum: "inceleme", aktif: false, kaynak: `${sahip}:${libId}`, onceki_id: s1 }), icerikOzetiOf(d3));
    await ts.kuyrugaEkle(s2, now);
    // Başkasının oyunu yayında kalır.
    const boraOyun = await toplulugaKoy(api, makeDefinition(girdi, 5), dersler, { olusturan: "hesap:bora" });
    // Kopya kaydı eski adla yazılır, sonra ad değişir.
    expect((await api.toplulukOyun.GET(cerezli(new Request(`http://localhost/api/topluluk/${boraOyun}`), ayse), api.idParams(boraOyun))).status).toBe(200);
    expect((await api.ad.POST(cerezli(jsonRequest("/api/auth/ad", { yeniKullaniciAdi: "ayse_yeni", sifre: SIFRE }), ayse))).status).toBe(200);

    expect((await sil(ayse)).status).toBe(200);
    expect((await okul.paylasimlar(eskiOkul)).some((p) => p.paylasan === ayseId)).toBe(false);
    expect((await ts.get(yetim))?.durum).toBe("geri-cekildi");
    expect((await ts.get(s1))?.durum).toBe("geri-cekildi");
    expect((await ts.get(s2))?.durum).toBe("geri-cekildi");
    expect(await ts.kuyruk(10)).not.toContain(s2);
    expect((await ts.get(boraOyun))?.durum ?? "yayinda").toBe("yayinda");
    const kopyalar = await api.denetimKaydi.getDenetimKaydiStore().kopyalar(10);
    expect(JSON.stringify(kopyalar)).not.toMatch(new RegExp(`ayse|${ayseId}`));
    expect(await api.authStore.getAuthStore().idByAd("ayse_yeni")).toBeNull();
    expect(await api.authStore.getAuthStore().idByAd("ayse")).toBeNull();
  });

  it("silme başlayınca diğer oturumlar hemen düşer (sürüm artar)", async () => {
    const ikinci = (await giris("ayse")).headers.get("set-cookie")!.split(";")[0];
    const auth = api.authStore.getAuthStore();
    const asil = auth.hesapSil.bind(auth);
    let arada: unknown = "okunmadı";
    auth.hesapSil = async (id, ad) => {
      arada = await ben(ikinci);
      return asil(id, ad);
    };
    expect((await sil(ayse)).status).toBe(200);
    expect(arada).toBeNull();
  });

  it("okul yöneticisi, platform yöneticisi ve süren oyun oluşturma engellenir; hiçbir şey silinmez", async () => {
    await api.okul.POST(cerezli(jsonRequest("/api/okul", { ad: "Deneme Lisesi" }), bora));
    const r1 = await sil(bora);
    expect(r1.status).toBe(409);
    expect((await r1.json()).error).toMatch(/Okul yöneticisisin/);
    expect(await ben(bora)).not.toBeNull();

    const platform = await hesapAc(api, "platform1");
    const r2 = await sil(platform);
    expect(r2.status).toBe(409);
    expect((await r2.json()).error).toMatch(/Platform yöneticisi/);

    await api.krediStore.getKrediStore().harca(ayseId, ayOf(Date.now()), 30, 3, Date.now(), "Oyun oluşturma", 60_000, "aski-1");
    const r3 = await sil(ayse);
    expect(r3.status).toBe(409);
    expect((await r3.json()).error).toMatch(/oluşturuluyor/);
    expect(await ben(ayse)).not.toBeNull();
  });
});

// Yeni Lua betikleri gerçekten çalıştırılır (fengari): argüman biçimi değil, betiğin davranışı denetlenir.
describe("hesap silme Lua betikleri (çalıştırılarak)", () => {
  it("hesap: ad değiştiyse silmez; siliyorsa hesap, ad ve dizin gider, ad yeniden alınır", async () => {
    const r = createLuaRedis();
    const s = createRedisAuthStore(r.command);
    expect(await s.olustur({ id: "a1", kullaniciAdi: "ayşe", sifreOzeti: "x", surum: 1, olusturma: 1 })).toBe(true);
    expect(await s.adTasi("a1", "ayşe", "ayşe_yeni")).toBe("tasindi");
    expect(await s.hesapSil("a1", "ayşe")).toBe(false);
    expect(await s.hesap("a1")).not.toBeNull();
    expect(await s.hesapSil("a1", "ayşe_yeni")).toBe(true);
    expect([await s.hesap("a1"), await s.idByAd("ayşe_yeni"), await s.idByAd("ayşe")]).toEqual([null, null, null]);
    expect([...r.dizeler.keys()]).toEqual([]);
    expect(await s.olustur({ id: "a2", kullaniciAdi: "ayşe_yeni", sifreOzeti: "y", surum: 1, olusturma: 2 })).toBe(true);
  });

  it("hesap: dizin başka hesaba geçmişse (ad yeniden alınmış) o hesabın dizinine dokunmaz", async () => {
    const r = createLuaRedis();
    const s = createRedisAuthStore(r.command);
    await s.olustur({ id: "a1", kullaniciAdi: "ayse", sifreOzeti: "x", surum: 1, olusturma: 1 });
    // Bozuk ya da yarışta kalmış durum: ad dizini başka hesabı gösteriyor.
    r.dizeler.set("dersera:hesap-adi:ayse", "b1");
    expect(await s.hesapSil("a1", "ayse")).toBe(true);
    expect(r.dizeler.get("dersera:hesap-adi:ayse")).toBe("b1");
  });

  it("kopya kaydı: yalnız bu hesabın kayıtları, eski adla yazılmış olsa da kimliksizleşir; başlıktaki tırnak ve benzer metin bozulmaz", async () => {
    const r = createLuaRedis();
    const s = createRedisDenetimKaydiStore(r.command);
    await s.kosulOnayiYaz("a1", { surum: "2026-09", tarih: 1 });
    const kayitlar = [
      { tarih: 1, hesapId: "a1", kullaniciAdi: "eski_ad", tur: "topluluk" as const, oyunId: "o1", baslik: 'Başlık "hesapId":"a1" ve "kullaniciAdi":"x"' },
      { tarih: 2, hesapId: "a10", kullaniciAdi: "baska", tur: "okul" as const, oyunId: "o2", baslik: "a1" },
      { tarih: 3, hesapId: "a1", kullaniciAdi: "yeni.ad-ş", tur: "okul" as const, oyunId: "o3", baslik: "Üç" },
    ];
    for (const k of kayitlar) await s.kopyaEkle(k);
    await s.hesabiUnut("a1");
    expect(await s.kosulOnayi("a1")).toBeNull();
    expect(await s.kopyalar(10)).toEqual([
      { ...kayitlar[2], ...SILINMIS_HESAP },
      kayitlar[1],
      { ...kayitlar[0], ...SILINMIS_HESAP },
    ]);
  });

  it("anahtar taraması desene uyan anahtarları getirir", async () => {
    const r = createLuaRedis();
    r.dizeler.set("dersera:topluluk:olusturan:x", "hesap:a1");
    r.dizeler.set("dersera:topluluk:oyun:x", "{}");
    expect(await anahtarlariTara(r.command, "dersera:topluluk:olusturan:*")).toEqual(["dersera:topluluk:olusturan:x"]);
  });
});

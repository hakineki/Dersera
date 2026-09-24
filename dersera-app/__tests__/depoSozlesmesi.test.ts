import { randomUUID } from "crypto";
import { createMemoryAuthStore, createRedisAuthStore, type AuthStore } from "@/lib/authStore";
import { createMemoryLimiter, createRedisLimiter, type Limiter } from "@/lib/composer/rateLimit";
import { createMemoryYzDenetimStore, createRedisYzDenetimStore, type YzDenetimStore } from "@/lib/composer/yzDenetimService";
import { createMemoryIstatistikStore, createRedisIstatistikStore, type IstatistikStore } from "@/lib/istatistikStore";
import { createMemoryKrediStore, createRedisKrediStore, type KrediStore } from "@/lib/krediStore";
import { kayitOlustur } from "@/lib/library";
import { createMemoryLibraryStore, createRedisLibraryStore, type LibraryStore } from "@/lib/libraryStore";
import { createMemoryModerasyonStore, createRedisModerasyonStore, type ModerasyonStore } from "@/lib/moderasyonStore";
import { createMemoryYoneticiStore, createRedisYoneticiStore, type YoneticiStore } from "@/lib/yonetici";
import { createMemoryOkulStore, createRedisOkulStore, type OkulStore } from "@/lib/okulStore";
import { createRedisCommand, type RedisCommand } from "@/lib/redis";
import { icerikOzetiOf, yeniToplulukKaydi } from "@/lib/toplulukService";
import { createMemoryToplulukStore, createRedisToplulukStore, type ToplulukStore } from "@/lib/toplulukStore";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";
import { getUniteler } from "@/data/mufredat/programlar";

// Depo sözleşmesi: aynı davranış testleri bellek ve Redis depolarında. Bellek her zaman çalışır (testin kendisi
// doğrulanır). Redis yalnız açıkça istenince ve BOŞ, ayrı bir veritabanında çalışır: Lua betiklerinin (kredi,
// sürüm CAS, topluluk durumu, puanlar, bitiren sayımı, hesap açma) gerçek Redis'teki duman testidir.
//
//   DERSERA_REDIS_DUMAN=1 KV_REST_API_URL=… KV_REST_API_TOKEN=… npx jest __tests__/depoSozlesmesi.test.ts
//
// Üretim veritabanında çalışmaz: başlangıçta DBSIZE 0 değilse durur. Bitince yalnız bu çalıştırmanın anahtarlarını siler.

const REDIS_ISTENDI = process.env.DERSERA_REDIS_DUMAN === "1";
const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

interface Depolar {
  auth: AuthStore;
  kredi: KrediStore;
  library: LibraryStore;
  topluluk: ToplulukStore;
  istatistik: IstatistikStore;
  limiter: Limiter;
  yz: YzDenetimStore;
  moderasyon: ModerasyonStore;
  yonetici: YoneticiStore;
  okul: OkulStore;
}

// Yazılan her "dersera:" anahtarını kaydeden komut: temizlik yalnız bunları siler.
const yazilanlar = new Set<string>();
function kayitliKomut(ham: RedisCommand): RedisCommand {
  return async (args) => {
    for (const a of args.slice(1)) if (typeof a === "string" && a.startsWith("dersera:")) yazilanlar.add(a);
    return ham(args);
  };
}

const uygulamalar: [string, () => Depolar][] = [
  [
    "bellek",
    () => ({
      auth: createMemoryAuthStore(),
      kredi: createMemoryKrediStore(),
      library: createMemoryLibraryStore(),
      topluluk: createMemoryToplulukStore(),
      istatistik: createMemoryIstatistikStore(),
      limiter: createMemoryLimiter(),
      yz: createMemoryYzDenetimStore(),
      moderasyon: createMemoryModerasyonStore(),
      yonetici: createMemoryYoneticiStore(),
      okul: createMemoryOkulStore(),
    }),
  ],
];
let komut: RedisCommand | null = null;
if (REDIS_ISTENDI) {
  if (!url || !token) throw new Error("DERSERA_REDIS_DUMAN=1 için KV_REST_API_URL ve KV_REST_API_TOKEN gerekli");
  komut = kayitliKomut(createRedisCommand(url, token));
  const c = komut;
  uygulamalar.push([
    "redis",
    () => ({
      auth: createRedisAuthStore(c),
      kredi: createRedisKrediStore(c),
      library: createRedisLibraryStore(c),
      topluluk: createRedisToplulukStore(c),
      istatistik: createRedisIstatistikStore(c),
      limiter: createRedisLimiter(c),
      yz: createRedisYzDenetimStore(c),
      moderasyon: createRedisModerasyonStore(c),
      yonetici: createRedisYoneticiStore(c),
      okul: createRedisOkulStore(c),
    }),
  ]);
}

beforeAll(async () => {
  if (!komut) return;
  const boyut = Number(await komut(["DBSIZE"]));
  if (boyut !== 0) throw new Error(`Duman testi yalnız boş, ayrı bir veritabanında çalışır (DBSIZE=${boyut}). Üretim veritabanını kullanmayın.`);
}, 30_000);

afterAll(async () => {
  if (!komut) return;
  const anahtarlar = [...yazilanlar];
  for (let i = 0; i < anahtarlar.length; i += 50) await komut(["DEL", ...anahtarlar.slice(i, i + 50)]);
}, 60_000);

const girdi = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const dersler = [{ ders: "fizik" as const, konuId: getUniteler(10, "fizik")[0].id }];
const SAAT = 60 * 60 * 1000;

describe.each(uygulamalar)("%s depoları", (_ad, kur) => {
  let d: Depolar;
  let run: string;
  beforeEach(() => {
    d = kur();
    run = randomUUID().slice(0, 8);
  });

  it("hesap: ad tekilliği atomik, ad taşıma, oturum", async () => {
    const h = { id: `h-${run}`, kullaniciAdi: `ogretmen${run}`, sifreOzeti: "x", surum: 1, olusturma: 1 };
    expect(await d.auth.olustur(h)).toBe(true);
    expect(await d.auth.olustur({ ...h, id: `h2-${run}` })).toBe(false);
    expect(await d.auth.idByAd(h.kullaniciAdi)).toBe(h.id);
    expect(await d.auth.hesap(h.id)).toMatchObject({ id: h.id, kullaniciAdi: h.kullaniciAdi });
    const baska = { ...h, id: `h3-${run}`, kullaniciAdi: `baska${run}` };
    expect(await d.auth.olustur(baska)).toBe(true);
    expect(await d.auth.adTasi(h.id, h.kullaniciAdi, baska.kullaniciAdi)).toBe("alinmis");
    expect(await d.auth.adTasi(h.id, "yanlis", `yeni${run}`)).toBe("degismis");
    expect(await d.auth.adTasi(h.id, h.kullaniciAdi, `yeni${run}`)).toBe("tasindi");
    expect(await d.auth.idByAd(`yeni${run}`)).toBe(h.id);
    expect(await d.auth.idByAd(h.kullaniciAdi)).toBeNull();
    await d.auth.oturumYaz(`o-${run}`, { id: h.id, surum: 1 }, SAAT);
    expect(await d.auth.oturum(`o-${run}`)).toEqual({ id: h.id, surum: 1 });
    await d.auth.oturumSil(`o-${run}`);
    expect(await d.auth.oturum(`o-${run}`)).toBeNull();
  });

  it("kredi: önce aylık hak, sonra kazanılan; yetmezse hiçbir şey yazılmaz; iade tek sefer; tamamlanan iade edilmez", async () => {
    const id = `k-${run}`;
    const ay = "2026-09";
    expect(await d.kredi.harca(id, ay, 30, 28, 1, "a", SAAT, `a1-${run}`)).toEqual({ ok: true, aylik: 28, kazanilan: 0 });
    expect(await d.kredi.harca(id, ay, 30, 3, 2, "b", SAAT, `a2-${run}`)).toEqual({ ok: false, aylikKalan: 2, kazanilan: 0 });
    await d.kredi.odul(id, 5, 3, "ödül");
    expect(await d.kredi.harca(id, ay, 30, 3, 4, "c", SAAT, `a3-${run}`)).toEqual({ ok: true, aylik: 2, kazanilan: 1 });
    expect((await d.kredi.oku(id, ay, 10)).kullanilan).toBe(30);
    expect((await d.kredi.oku(id, ay, 10)).kazanilan).toBe(4);

    const askida = await d.kredi.askidakiler(id);
    expect(askida.map((a) => a.id).sort()).toEqual([`a1-${run}`, `a3-${run}`].sort());
    expect(await d.kredi.tamamla(id, `a1-${run}`)).toBe(true);
    const a3 = askida.find((a) => a.id === `a3-${run}`)!;
    expect(await d.kredi.iade(id, a3, 5, "iade", SAAT)).toBe(true);
    expect(await d.kredi.iade(id, a3, 6, "iade", SAAT)).toBe(false);
    const son = await d.kredi.oku(id, ay, 10);
    expect(son.kullanilan).toBe(28);
    expect(son.kazanilan).toBe(5);
    // Tamamlanan harcama iade edilemez.
    const a1 = askida.find((a) => a.id === `a1-${run}`)!;
    expect(await d.kredi.iade(id, a1, 7, "iade", SAAT)).toBe(false);
    expect(son.hareketler.map((h) => h.tur)).toEqual(expect.arrayContaining(["harcama", "odul", "iade"]));
  });

  it("kütüphane: sürüm CAS (ok / catisma / yok), sayım, silme", async () => {
    const sahip = `hesap:s-${run}`;
    const kayit = kayitOlustur(`kk${run}`, makeDefinition(girdi, 6), dersler, null, 1);
    await d.library.put(sahip, kayit);
    expect(await d.library.count(sahip)).toBe(1);
    expect(await d.library.replaceIfSurum(sahip, { ...kayit, surum: 2, baslik: "Yeni" }, 1)).toBe("ok");
    expect(await d.library.replaceIfSurum(sahip, { ...kayit, surum: 2, baslik: "Eski sekme" }, 1)).toBe("catisma");
    expect((await d.library.get(sahip, kayit.id))?.baslik).toBe("Yeni");
    expect(await d.library.replace(sahip, { ...kayit, surum: 2, baslik: "Kod güncellendi", sonKod: "ABC-123" })).toBe(true);
    expect(await d.library.get(sahip, kayit.id)).toMatchObject({ baslik: "Kod güncellendi", sonKod: "ABC-123" });
    expect(await d.library.replaceIfSurum(sahip, { ...kayit, id: `yok${run}` }, 1)).toBe("yok");
    expect(await d.library.remove(sahip, kayit.id)).toBe(true);
    expect(await d.library.replace(sahip, kayit)).toBe(false);
    expect(await d.library.count(sahip)).toBe(0);
  });

  it("topluluk: içerik tekilliği, atomik durum geçişi, özet okuma, kuyruk, öğretmen puanı güncellemesi", async () => {
    const def = makeDefinition(girdi, 6);
    def.meta.baslik = `Duman ${run}`;
    const k = yeniToplulukKaydi(def, dersler, `hesap:o-${run}`, 1_000, { durum: "inceleme", aktif: false });
    const h = icerikOzetiOf(def);
    expect(await d.topluluk.ekle(k, h)).toBe(k.oyun_id);
    const ikinci = yeniToplulukKaydi(def, dersler, `hesap:x-${run}`, 2_000, { durum: "inceleme", aktif: false });
    expect(await d.topluluk.ekle(ikinci, h)).toBe(k.oyun_id);
    expect(await d.topluluk.icerikId(h)).toBe(k.oyun_id);

    await d.topluluk.kuyrugaEkle(k.oyun_id, 1_000);
    expect(await d.topluluk.kuyruk(1_000)).toContain(k.oyun_id);
    expect(await d.topluluk.durumGecis(k.oyun_id, ["yayinda"], "reddedildi", "inceleme")).toBe(false);
    expect(await d.topluluk.durumGecis(k.oyun_id, ["inceleme"], "yayinda", "inceleme", 3_000)).toBe(true);
    expect(await d.topluluk.durumGecis(k.oyun_id, ["inceleme"], "reddedildi", "inceleme")).toBe(false);
    await d.topluluk.kuyruktanCikar(k.oyun_id);
    expect(await d.topluluk.kuyruk(1_000)).not.toContain(k.oyun_id);
    expect((await d.topluluk.ozetleriOku([k.oyun_id, `yok-${run}`]))).toEqual([expect.objectContaining({ oyun_id: k.oyun_id, sinif: 10 }), null]);

    await d.topluluk.ogretmenPuanla(k.oyun_id, "a", 4);
    await d.topluluk.ogretmenPuanla(k.oyun_id, "b", 2);
    await d.topluluk.ogretmenPuanla(k.oyun_id, "a", 5);
    expect(await d.topluluk.ogretmenPuanOzeti(k.oyun_id)).toEqual({ toplam: 7, sayi: 2 });
    expect(await d.topluluk.ogretmenPuani(k.oyun_id, "a")).toBe(5);
    // Öğrenci puanı listede PUAN_KOVASI (5) oyda bir görünür.
    const ozetOf = async () => (await d.topluluk.sirali(null, 1_000)).find((o) => o.ozet?.oyun_id === k.oyun_id)?.ozet;
    for (const p of [4, 4, 3, 5]) await d.topluluk.puanEkle(k.oyun_id, p);
    expect(await ozetOf()).toMatchObject({ puan_sayisi: 0, puan_ortalama: null });
    await d.topluluk.puanEkle(k.oyun_id, 2);
    expect(await ozetOf()).toMatchObject({ puan_sayisi: 5, puan_ortalama: 3.6 });
    expect(await d.topluluk.incelemeEkle(k.oyun_id, { inceleyen: "i1", karar: "kabul", not: "", tarih: 1 })).toBe(true);
    expect(await d.topluluk.incelemeEkle(k.oyun_id, { inceleyen: "i1", karar: "ret", not: "tekrar", tarih: 2 })).toBe(false);
  });

  // Kod sınırı koddaki tüm bitirişleri (sayılmayanlar dahil) sayar.
  it("istatistik: bitiren tek sayılır, kod sınırı, puan tek oy, katılımda ilk zaman kalır", async () => {
    const kod = `D${run}`;
    const kaynak = `hesap:s-${run}:kk${run}`;
    await d.istatistik.kodBagla(kod, kaynak, SAAT);
    expect(await d.istatistik.kodunKaynagi(kod)).toBe(kaynak);
    expect(await d.istatistik.bitirenKaydet(kod, "o1", kaynak, true, 3, SAAT)).toBe("yeni-sayildi");
    expect(await d.istatistik.bitirenKaydet(kod, "o1", kaynak, true, 3, SAAT)).toBe("zaten");
    expect(await d.istatistik.bitirenKaydet(kod, "o2", kaynak, false, 3, SAAT)).toBe("yeni-sayilmadi");
    expect(await d.istatistik.bitirenKaydet(kod, "o3", kaynak, true, 3, SAAT)).toBe("yeni-sayildi");
    expect(await d.istatistik.bitirenKaydet(kod, "o4", kaynak, true, 3, SAAT)).toBe("yeni-sayilmadi");
    expect(await d.istatistik.bitirisDurumu(kod, "o1")).toBe("sayildi");
    expect(await d.istatistik.bitirisDurumu(kod, "o2")).toBe("sayilmadi");
    expect(await d.istatistik.puanKaydet(kod, "o1", kaynak, 4, true, SAAT)).toBe(true);
    expect(await d.istatistik.puanKaydet(kod, "o1", kaynak, 1, true, SAAT)).toBe(false);
    // Puan PUAN_KOVASI (5) oyda bir görünür; sayılmayan oy toplamlara girmez.
    expect(await d.istatistik.puanKaydet(kod, "o9", kaynak, 1, false, SAAT)).toBe(true);
    for (const [o, p] of [["o2", 4], ["o3", 3], ["o4", 5]] as const) expect(await d.istatistik.puanKaydet(kod, o, kaynak, p, true, SAAT)).toBe(true);
    expect(await d.istatistik.istatistikler([kaynak])).toEqual([{ ogrenci: 2, puanToplam: 0, puanSayisi: 0 }]);
    expect(await d.istatistik.puanKaydet(kod, "o5", kaynak, 2, true, SAAT)).toBe(true);
    expect(await d.istatistik.istatistikler([kaynak])).toEqual([{ ogrenci: 2, puanToplam: 18, puanSayisi: 5 }]);
    await d.istatistik.katilimKaydet(kod, "o1", 100, SAAT);
    await d.istatistik.katilimKaydet(kod, "o1", 200, SAAT);
    expect(await d.istatistik.katilimZamani(kod, "o1")).toBe(100);
  });

  it("moderasyon: tekil ekleme, liste sırası, tek karar; yönetici adı ilk kimliğe bağlanır", async () => {
    const kayit = (id: string, tarih: number) => ({ id, tur: "engellenen" as const, tarih, karar: "BLOCK" as const, baslik: `B ${id}`, sinif: 10, ders: "Fizik", sahip: null, bulgular: [], durum: "bekliyor" as const });
    const a = `00000000-0000-0000-0000-${run}0001`;
    const b = `00000000-0000-0000-0000-${run}0002`;
    expect(await d.moderasyon.ekle(kayit(a, 1_000), `t-${run}-a`)).toBe(true);
    expect(await d.moderasyon.ekle(kayit(`x-${run}`, 1_500), `t-${run}-a`)).toBe(false);
    expect(await d.moderasyon.ekle(kayit(b, 2_000), `t-${run}-b`)).toBe(true);
    const bekleyen = (await d.moderasyon.liste("bekliyor", 1_000)).filter((k) => k.id === a || k.id === b).map((k) => k.id);
    expect(bekleyen).toEqual([b, a]);
    const sonuc = { karar: "temiz" as const, not: "", yonetici: "y", tarih: 3_000 };
    expect(await d.moderasyon.kilitle(a, sonuc)).toBe(true);
    expect(await d.moderasyon.kilitle(a, { ...sonuc, karar: "kaldir" })).toBe(false);
    // Kilit alındı ama tamamlanmadı: kayıt yine kapatılmış (kilitteki sonuçla) okunur.
    expect(await d.moderasyon.get(a)).toMatchObject({ durum: "kapatildi", sonuc });
    expect(await d.moderasyon.tamamla(a)).toMatchObject({ id: a, durum: "kapatildi", sonuc });
    // Bırakılan kilit kaydı yeniden karar bekler hâle getirir.
    expect(await d.moderasyon.kilitle(b, sonuc)).toBe(true);
    await d.moderasyon.kilidiBirak(b);
    expect((await d.moderasyon.get(b))?.durum).toBe("bekliyor");
    expect(await d.moderasyon.tamamla(b)).toBeNull();
    expect((await d.moderasyon.get(a))?.sonuc?.karar).toBe("temiz");
    expect((await d.moderasyon.liste("bekliyor", 1_000)).map((k) => k.id)).not.toContain(a);
    expect((await d.moderasyon.liste("kapatildi", 1_000)).map((k) => k.id)).toContain(a);

    expect(await d.yonetici.bagla(`ad${run}`, "h1")).toBe("h1");
    expect(await d.yonetici.bagla(`ad${run}`, "h2")).toBe("h1");
  });

  it("okul: tek okul, katılma, çıkarma CAS, davet yenileme, paylaşım yer değiştirme ve okul yalıtımı", async () => {
    const okul = { id: `o-${run}`, ad: "Okul", olusturma: 1, olusturan: `y-${run}`, davetKodu: `D${run}`.slice(0, 8) };
    expect(await d.okul.olustur(okul, { hesapId: okul.olusturan, rol: "yonetici", katilma: 1 })).toBe(true);
    expect(await d.okul.olustur({ ...okul, id: `o2-${run}`, davetKodu: `E${run}`.slice(0, 8) }, { hesapId: okul.olusturan, rol: "yonetici", katilma: 1 })).toBe(false);
    expect(await d.okul.get(okul.id)).toEqual(okul);
    expect(await d.okul.davettenOkul(okul.davetKodu)).toBe(okul.id);
    const ogr = `g-${run}`;
    expect(await d.okul.katil(okul.id, { hesapId: ogr, rol: "ogretmen", katilma: 2 })).toBe("ok");
    expect(await d.okul.katil(okul.id, { hesapId: ogr, rol: "ogretmen", katilma: 2 })).toBe("zaten-uye");
    expect(await d.okul.okulOf(ogr)).toBe(okul.id);
    expect((await d.okul.uyeler(okul.id)).map((u) => u.rol).sort()).toEqual(["ogretmen", "yonetici"]);
    expect(await d.okul.uyeCikar("baska-okul", ogr)).toBe(false);
    expect(await d.okul.uyeCikar(okul.id, ogr)).toBe(true);
    expect(await d.okul.uyeCikar(okul.id, ogr)).toBe(false);
    expect(await d.okul.okulOf(ogr)).toBeNull();

    const yeniKod = `F${run}`.slice(0, 8);
    expect(await d.okul.davetYenile(okul, yeniKod)).toBe(true);
    expect(await d.okul.davettenOkul(okul.davetKodu)).toBeNull();
    expect(await d.okul.davettenOkul(yeniKod)).toBe(okul.id);
    expect((await d.okul.get(okul.id))?.davetKodu).toBe(yeniKod);

    const p = { id: `p-${run}`, kaynak: `hesap:${ogr}:k1`, paylasan: ogr, baslik: "B", sinif: 6, ders: "Fen", konu: "K", sure_dk: 40, tarih: 1, definition: makeDefinition(girdi, 6), dersler };
    expect(await d.okul.paylas(okul.id, p)).toBe("ok");
    expect(await d.okul.kaynakPaylasimlari(okul.id, [p.kaynak, "yok"])).toEqual([p.id, null]);
    const p2 = { ...p, id: `p2-${run}`, tarih: 2 };
    expect(await d.okul.paylas(okul.id, p2)).toBe("ok");
    expect((await d.okul.paylasimlar(okul.id)).map((x) => x.id)).toEqual([p2.id]);
    expect(await d.okul.paylasim(okul.id, p.id)).toBeNull();
    expect((await d.okul.paylasim(okul.id, p2.id))?.definition.meta.baslik).toBe(p.definition.meta.baslik);
    expect(await d.okul.paylasim(`baska-${run}`, p2.id)).toBeNull();
    expect(await d.okul.paylasimKaldir(okul.id, p2)).toBe(true);
    expect(await d.okul.paylasimKaldir(okul.id, p2)).toBe(false);
    expect(await d.okul.kaynakPaylasimlari(okul.id, [p.kaynak])).toEqual([null]);
  });

  it("oran sınırı sayacı ve yapay zekâ denetim önbelleği", async () => {
    const anahtar = `dersera:duman:sinir:${run}`;
    expect(await d.limiter.hit(anahtar, SAAT)).toBe(1);
    expect(await d.limiter.hit(anahtar, SAAT)).toBe(2);
    expect(await d.limiter.count(anahtar)).toBe(2);
    const bulgu = { yer: "d1", kategori: "siddet" as const, agirlik: "incele" as const, alinti: "a", aciklama: "b" };
    await d.yz.set(`duman${run}`, [bulgu]);
    expect(await d.yz.get(`duman${run}`)).toEqual([bulgu]);
    expect(await d.yz.get(`yok${run}`)).toBeNull();
  });
});

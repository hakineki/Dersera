import { metinleriTara } from "@/lib/composer/cocukGuvenligi";
import { MEKAN_SINIRLARI as S } from "@/lib/mekan";
import { KONUM_BILMECELERI as BILMECELER, mekanBilmeceleri } from "@/data/konumBilmeceleri";
import { MEKANLAR, mekanOf } from "@/data/mekanlar";

describe("okul mekânları ve konum bilmeceleri", () => {
  it("20 mekân; kimlikler tekil ve kısa-çizgili küçük harf", () => {
    expect(MEKANLAR).toHaveLength(20);
    const idler = MEKANLAR.map((m) => m.id);
    expect(new Set(idler).size).toBe(20);
    for (const m of MEKANLAR) {
      expect(m.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(m.ad.trim()).toBe(m.ad);
      expect(m.ad.length).toBeGreaterThan(2);
      expect(m.emoji.length).toBeGreaterThan(0);
    }
    expect(MEKANLAR.map((m) => m.ad)).toEqual(expect.arrayContaining(["Sınıf", "Kütüphane", "Bahçe", "Spor salonu", "Kantin"]));
    expect(mekanOf("sinif")?.ayrintiOrnegi).toBeTruthy();
    expect(mekanOf("yok")).toBeNull();
  });

  it("her mekânda en az 10 bilmece; kimlik ve nokta tekil; yalnız tanımlı mekânlar", () => {
    const idler = new Set(MEKANLAR.map((m) => m.id));
    expect(new Set(BILMECELER.map((b) => b.id)).size).toBe(BILMECELER.length);
    for (const b of BILMECELER) expect(idler.has(b.mekanId)).toBe(true);
    for (const m of MEKANLAR) {
      const liste = mekanBilmeceleri(m.id);
      expect(liste.length).toBeGreaterThanOrEqual(S.enAzBilmece);
      liste.forEach((b, i) => expect(b.id).toBe(`${m.id}-${i + 1}`));
      const noktalar = liste.map((b) => b.nokta.toLocaleLowerCase("tr-TR"));
      expect(new Set(noktalar).size).toBe(noktalar.length);
    }
  });

  it("metinler dolu, sınırlar içinde, baştan sona kırpılmış; ipuçları bilmeceden farklı ve birbirinden farklı", () => {
    for (const b of BILMECELER) {
      for (const [alan, v, enCok] of [
        ["nokta", b.nokta, S.noktaEnCok],
        ["bilmece", b.bilmece, S.bilmeceEnCok],
        ["ipucu1", b.ipucu1, S.ipucuEnCok],
        ["ipucu2", b.ipucu2, S.ipucuEnCok],
      ] as const) {
        expect({ id: b.id, alan, bos: v.trim().length < 3, uzun: v.length > enCok, kirpik: v !== v.trim() }).toEqual({ id: b.id, alan, bos: false, uzun: false, kirpik: false });
      }
      expect(new Set([b.bilmece, b.ipucu1, b.ipucu2]).size).toBe(3);
    }
  });

  it("bilmece ve 1. ipucu noktanın adını vermez", () => {
    // Noktada geçip adı vermeyen genel yer kelimeleri.
    const GENEL = new Set([
      "kapı", "kapısı", "kapının", "duvar", "duvarı", "yanı", "yanındaki", "altı", "altındaki", "üstü", "kenarı", "kenar",
      "köşe", "köşesi", "yüzü", "önü", "içi", "arkası", "arkalığı", "ucu", "bölümü", "sınıf", "sınıfı", "masası",
      "masasının", "levhası", "tabelası",
    ]);
    // kullanıcı onaylı: kütüphane metinleri olduğu gibi kalır.
    const ONAYLI = new Set(["kutuphane-3", "kutuphane-4", "kutuphane-6", "kutuphane-8", "kutuphane-9"]);
    const kucuk = (s: string) => s.toLocaleLowerCase("tr-TR");
    const sizintilar: string[] = [];
    for (const b of BILMECELER) {
      if (ONAYLI.has(b.id)) continue;
      const metin = kucuk(`${b.bilmece} ${b.ipucu1}`);
      const kelimeler = kucuk(b.nokta)
        .split(/[^a-zçğıöşüâîû]+/u)
        .filter((k) => k.length >= 4 && !GENEL.has(k));
      for (const k of kelimeler) if (metin.includes(k.slice(0, 5))) sizintilar.push(`${b.id}: ${k.slice(0, 5)}`);
    }
    expect(sizintilar).toEqual([]);
  });

  it("aynı nokta tüm dosyada en fazla 4 kez geçer", () => {
    const kucuk = (s: string) => s.toLocaleLowerCase("tr-TR");
    const kelimeler = (s: string) => kucuk(s).split(/[^a-zçğıöşüâîû]+/u).filter(Boolean);
    const sayac = new Map<string, string[]>();
    for (const b of BILMECELER) {
      // Mekân adı sözcüklerini (ilk 5 harfe göre) çıkar: "Kantin kapısının yanı" ile "Yemekhane kapısının yanı" aynı sayılır.
      const adKokleri = new Set(kelimeler(mekanOf(b.mekanId)?.ad ?? "").filter((k) => k.length >= 3).map((k) => k.slice(0, 5)));
      const anahtar = kelimeler(b.nokta).filter((k) => !adKokleri.has(k.slice(0, 5))).join(" ");
      sayac.set(anahtar, [...(sayac.get(anahtar) ?? []), b.id]);
    }
    const fazla = [...sayac].filter(([, idler]) => idler.length > 4).map(([anahtar, idler]) => `${anahtar}: ${idler.join(", ")}`);
    expect(fazla).toEqual([]);
  });

  it("çocuk güvenliği taramasında hiçbir eşleşme yok", () => {
    const metinler = [
      ...MEKANLAR.map((m) => ({ metin: `${m.ad} ${m.ayrintiOrnegi ?? ""}`, yer: m.id })),
      ...BILMECELER.flatMap((b) => [b.nokta, b.bilmece, b.ipucu1, b.ipucu2].map((metin) => ({ metin, yer: b.id }))),
    ];
    expect(metinleriTara(metinler)).toEqual([]);
  });
});

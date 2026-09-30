import { metinleriTara } from "@/lib/composer/cocukGuvenligi";
import { MEKAN_SINIRLARI as S } from "@/lib/mekan";
import { BILMECELER, MEKANLAR, mekanBilmeceleri, mekanOf } from "@/data/mekanlar";

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

  it("çocuk güvenliği taramasında hiçbir eşleşme yok", () => {
    const metinler = [
      ...MEKANLAR.map((m) => ({ metin: `${m.ad} ${m.ayrintiOrnegi ?? ""}`, yer: m.id })),
      ...BILMECELER.flatMap((b) => [b.nokta, b.bilmece, b.ipucu1, b.ipucu2].map((metin) => ({ metin, yer: b.id }))),
    ];
    expect(metinleriTara(metinler)).toEqual([]);
  });
});

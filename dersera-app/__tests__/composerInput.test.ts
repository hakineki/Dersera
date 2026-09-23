import { getKonuSecenekleri, getUniteler, PROGRAM_DERSLERI, SINIFLAR } from "@/data/mufredat/programlar";
import { parseComposeInput } from "@/lib/composer/input";
import { answerFormatError, isCorrect } from "@/lib/composer/answers";
import { buildRecipe } from "@/lib/composer/recipe";

describe("müfredat verisi", () => {
  it("dokuz dersin 9–12. sınıf programları yüklenmiş", () => {
    const secenekler = getKonuSecenekleri();
    for (const ders of ["matematik", "fizik", "kimya", "turk-dili", "biyoloji", "cografya", "din-kulturu"]) {
      for (const s of SINIFLAR) expect(secenekler[`${s}:${ders}`]?.length).toBeGreaterThan(0);
    }
    expect(secenekler["10:felsefe"]?.length).toBeGreaterThan(0);
    expect(secenekler["11:tarih"]?.length).toBeGreaterThan(0);
  });

  it("her öğrenme çıktısının resmî kodu ve metni var; kodlar sınıf içinde benzersiz", () => {
    for (const ders of PROGRAM_DERSLERI) {
      for (const s of SINIFLAR) {
        const uniteler = getUniteler(s, ders);
        const kodlar = uniteler.flatMap((u) => u.ogrenmeCiktilari.map((o) => `${u.id}/${o.kod}`));
        expect(new Set(kodlar).size).toBe(kodlar.length);
        uniteler.forEach((u) => u.ogrenmeCiktilari.forEach((o) => {
          expect(o.kod).toMatch(/^([A-ZÇĞİÖŞÜ]{2,5}\.?)?\d+(\.\d+)+$/u);
          expect(o.metin.length).toBeGreaterThan(10);
        }));
      }
    }
  });

  it("istemciye giden seçenekler öğrenme çıktısı içermez", () => {
    const json = JSON.stringify(getKonuSecenekleri());
    expect(json).not.toContain("ogrenmeCiktilari");
    expect(json).not.toContain("FİZ.11.1.1");
  });
});

describe("parseComposeInput", () => {
  const konu = getUniteler(10, "fizik")[0];
  const valid = { sinif: 10, ders: "fizik", konuId: konu.id, sure: 40, deneyim: "dengeli", alan: "sinif" };

  it("geçerli seçimi çözer ve konunun öğrenme çıktılarını ekler", () => {
    const r = parseComposeInput(valid);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.input.ogrenmeCiktilari).toEqual(konu.ogrenmeCiktilari);
  });

  it.each([
    ["başka dersin konusu (senaryo 4)", { ...valid, konuId: getUniteler(10, "kimya")[0].id }],
    ["olmayan konu", { ...valid, konuId: "999999" }],
    ["sayı olmayan konu", { ...valid, konuId: "<script>" }],
    ["olmayan sınıf", { ...valid, sinif: 8 }],
    ["olmayan ders", { ...valid, ders: "astroloji" }],
    ["izinsiz süre", { ...valid, sure: 30 }],
    ["izinsiz deneyim", { ...valid, deneyim: "zor" }],
    ["fazladan alan (soru sayısı)", { ...valid, soruSayisi: 12 }],
    ["programda olmayan sınıf-ders (Felsefe 9)", { ...valid, sinif: 9, ders: "felsefe" }],
  ])("reddeder: %s", (_l, body) => {
    expect(parseComposeInput(body).ok).toBe(false);
  });
});

describe("tarif", () => {
  it.each([
    [20, 4, 5],
    [40, 6, 8],
    [60, 8, 10],
  ])("%i dk → %i-%i ana görev", (sure, min, max) => {
    expect(buildRecipe(sure, "dengeli", "sinif").anaGorev).toEqual({ min, max });
  });

  it("deneyim biçimleri yalnız sayı değil dramaturji de değiştirir", () => {
    const m = buildRecipe(40, "macera", "sinif");
    const d = buildRecipe(40, "ders", "sinif");
    expect(m.secim.min).toBeGreaterThanOrEqual(2);
    expect(d.secim).toEqual({ min: 1, max: 1 });
    expect(m.dramaturji).not.toBe(d.dramaturji);
    expect(m.final).not.toBe(d.final);
  });
});

describe("cevap biçimleri", () => {
  it.each([
    ["sayisal", "12", "12,0", true],
    ["sayisal", "3.5", "3,5", true],
    ["siralama", "a | b | c", "a|b|c", true],
    ["siralama", "a | b | c", "b | a | c", false],
    ["eslestirme", "x => 1 | y => 2", "y => 2 | x => 1", true],
    ["coktan_secmeli", "Doğru", " doğru ", true],
  ] as const)("%s: %s ~ %s → %s", (tur, dogru, verilen, sonuc) => {
    expect(isCorrect(tur, dogru, verilen)).toBe(sonuc);
  });

  it("eşleştirme biçim hatasını yakalar", () => {
    expect(answerFormatError("eslestirme", ["a => 1", "b 2", "c => 3"], "a => 1 | b 2 | c => 3")).toMatch(/sol => sağ/);
  });
});

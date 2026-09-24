import { getKonuSecenekleri, getUniteler, PROGRAM_DERSLERI, SINIFLAR } from "@/data/mufredat/programlar";
import { parseComposeInput } from "@/lib/composer/input";
import { hedefKodu } from "@/lib/composer/modelOutput";
import { answerFormatError, isCorrect } from "@/lib/composer/answers";
import { buildRecipe } from "@/lib/composer/recipe";

describe("müfredat verisi", () => {
  it("lise (9–12) ve ortaokul (5–8) programları yüklenmiş", () => {
    const secenekler = getKonuSecenekleri();
    for (const ders of ["matematik", "fizik", "kimya", "turk-dili", "biyoloji", "cografya", "din-kulturu"]) {
      for (const s of [9, 10, 11, 12]) expect(secenekler[`${s}:${ders}`]?.length).toBeGreaterThan(0);
    }
    for (const ders of ["matematik", "fen-bilimleri", "turkce", "din-kulturu"]) {
      for (const s of [5, 6, 7, 8]) expect(secenekler[`${s}:${ders}`]?.length).toBeGreaterThan(0);
    }
    for (const s of [5, 6, 7]) expect(secenekler[`${s}:sosyal-bilgiler`]?.length).toBeGreaterThan(0);
    for (const ders of ["turkce", "matematik"]) for (const s of [1, 2, 3, 4]) expect(secenekler[`${s}:${ders}`]?.length).toBeGreaterThan(0);
    for (const s of [1, 2, 3]) expect(secenekler[`${s}:hayat-bilgisi`]?.length).toBeGreaterThan(0);
    for (const k of ["3:fen-bilimleri", "4:fen-bilimleri", "4:sosyal-bilgiler", "4:din-kulturu"]) expect(secenekler[k]?.length).toBeGreaterThan(0);
    expect(secenekler["4:hayat-bilgisi"]).toBeUndefined();
    expect(secenekler["8:inkilap-tarihi"]?.length).toBeGreaterThan(0);
    // Kademe dışı ders yok: lise dersi ortaokulda, ortaokul dersi lisede görünmez.
    expect(secenekler["6:fizik"]).toBeUndefined();
    expect(secenekler["10:fen-bilimleri"]).toBeUndefined();
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
          expect(o.kod).toMatch(/^([A-ZÇĞİÖŞÜ]{1,5}(\.[A-ZÇĞİÖŞÜ]{1,5})*\.?)?\d+(\.\d+)+$/u);
          // Model çıktısındaki kod bu işlevle ayıklanır: her gerçek kod aynen geçmeli (açıklamalı yazılsa da).
          expect(hedefKodu(o.kod)).toBe(o.kod);
          expect(hedefKodu(`${o.kod}: ${o.metin}`)).toBe(o.kod);
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
  const valid = { sinif: 10, dersler: [{ ders: "fizik", konuId: konu.id }], sure: 40, deneyim: "dengeli", alan: "sinif" };

  it("geçerli seçimi çözer ve konunun öğrenme çıktılarını ekler", () => {
    const r = parseComposeInput(valid);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.input.ogrenmeCiktilari).toEqual(konu.ogrenmeCiktilari);
  });

  it("ön not isteğe bağlıdır; kırpılır, kontrol karakterleri atılır, boşsa yok sayılır", () => {
    const r = parseComposeInput({ ...valid, serbest_not: "  Laboratuvarda\u0007 bir\u200B\u202Ekaza\tolsun\nsonra  " });
    expect(r.ok && r.input.serbest_not).toBe("Laboratuvarda birkaza olsun\nsonra");
    expect(parseComposeInput({ ...valid, serbest_not: null }).ok).toBe(false);
    const bos = parseComposeInput({ ...valid, serbest_not: "   " });
    expect(bos.ok && "serbest_not" in bos.input).toBe(false);
    const yok = parseComposeInput(valid);
    expect(yok.ok && "serbest_not" in yok.input).toBe(false);
    expect(parseComposeInput({ ...valid, serbest_not: "a".repeat(500) }).ok).toBe(true);
  });

  it("birden çok dersi çözer; hedefler birleşir, ders adları ve konular meta için birleştirilir", () => {
    const mat = getUniteler(10, "matematik")[0];
    const r = parseComposeInput({ ...valid, dersler: [{ ders: "fizik", konuId: konu.id }, { ders: "matematik", konuId: mat.id }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.ogrenmeCiktilari).toEqual([...konu.ogrenmeCiktilari, ...mat.ogrenmeCiktilari]);
    expect(r.input.hedefDersleri).toEqual({ Fizik: konu.ogrenmeCiktilari.map((o) => o.kod), Matematik: mat.ogrenmeCiktilari.map((o) => o.kod) });
    expect(r.input.dersAdi).toBe("Fizik + Matematik");
    expect(r.input.konuAdi).toBe(`${konu.ad} · ${mat.ad}`);
  });

  it("60 dakikalık oyunda dokuz dersin tamamı seçilebilir (programı olan sınıfta)", () => {
    const hepsi = ["matematik", "fizik", "kimya", "turk-dili", "biyoloji", "tarih", "cografya", "felsefe", "din-kulturu"].map((ders) => ({
      ders,
      konuId: getUniteler(11, ders).find((u) => u.ogrenmeCiktilari.length)!.id,
    }));
    expect(parseComposeInput({ ...valid, sinif: 11, sure: 60, dersler: hepsi }).ok).toBe(true);
  });

  it.each([
    [20, 5],
    [40, 8],
  ])("%i dakikada %i dersten fazlası Anthropic'e gitmeden reddedilir", (sure, enFazla) => {
    const hepsi = ["matematik", "fizik", "kimya", "turk-dili", "biyoloji", "tarih", "cografya", "felsefe", "din-kulturu"].map((ders) => ({
      ders,
      konuId: getUniteler(11, ders).find((u) => u.ogrenmeCiktilari.length)!.id,
    }));
    expect(parseComposeInput({ ...valid, sinif: 11, sure, dersler: hepsi.slice(0, enFazla) }).ok).toBe(true);
    const r = parseComposeInput({ ...valid, sinif: 11, sure, dersler: hepsi.slice(0, enFazla + 1) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(`en fazla ${enFazla} ders`);
  });

  it.each([
    ["başka dersin konusu (senaryo 4)", { ...valid, dersler: [{ ders: "fizik", konuId: getUniteler(10, "kimya")[0].id }] }],
    ["olmayan konu", { ...valid, dersler: [{ ders: "fizik", konuId: "999999" }] }],
    ["sayı olmayan konu", { ...valid, dersler: [{ ders: "fizik", konuId: "<script>" }] }],
    ["olmayan sınıf", { ...valid, sinif: 8 }],
    ["olmayan ders", { ...valid, dersler: [{ ders: "astroloji", konuId: konu.id }] }],
    ["hiç ders yok", { ...valid, dersler: [] }],
    ["aynı ders iki kez", { ...valid, dersler: [{ ders: "fizik", konuId: konu.id }, { ders: "fizik", konuId: konu.id }] }],
    ["izinsiz süre", { ...valid, sure: 30 }],
    ["izinsiz deneyim", { ...valid, deneyim: "zor" }],
    ["fazladan alan (soru sayısı)", { ...valid, soruSayisi: 12 }],
    ["500 karakteri aşan ön not", { ...valid, serbest_not: "a".repeat(501) }],
    ["metin olmayan ön not", { ...valid, serbest_not: 42 }],
    ["programda olmayan sınıf-ders (Felsefe 9)", { ...valid, sinif: 9, dersler: [{ ders: "felsefe", konuId: konu.id }] }],
  ])("reddeder: %s", (_l, body) => {
    expect(parseComposeInput(body).ok).toBe(false);
  });
});

describe("tarif", () => {
  it.each([
    [20, 5, 5],
    [40, 8, 8],
    [60, 12, 12],
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

import { getKonuSecenekleri, getUniteler } from "@/data/mufredat/programlar";
import { validationContext } from "@/lib/composer/service";
import { parseComposeInput } from "@/lib/composer/input";
import { toDefinition } from "@/lib/composer/modelOutput";
import { buildUserPrompt } from "@/lib/composer/prompt";
import { buildRecipe } from "@/lib/composer/recipe";
import { validateGame } from "@/lib/composer/validator";
import { PROFILLER, yasProfiliOf } from "@/lib/yasProfili";
import { makeDefinition, resolvedInput, toModelOutput } from "./helpers/composerFixtures";

describe("yaş profili", () => {
  it("sınıftan türetilir: 5–8 ortaokul, 9–12 lise (alt kademeler müfredat eklenince)", () => {
    expect([5, 6, 7, 8].map(yasProfiliOf)).toEqual(Array(4).fill("MIDDLE_11_14"));
    expect([9, 10, 11, 12].map(yasProfiliOf)).toEqual(Array(4).fill("HIGH_15_18"));
    expect([1, 2, 3, 4].map(yasProfiliOf)).toEqual(Array(4).fill("PRIMARY_6_10"));
    expect(yasProfiliOf(0)).toBe("PRESCHOOL_3_5");
  });

  it("üretim istemi profile özgü kuralları taşır", () => {
    const orta = resolvedInput({ sinif: 6, ders: "fen-bilimleri", sure: 40, deneyim: "dengeli", alan: "sinif" });
    const lise = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
    const p = (i: typeof orta) => buildUserPrompt(i, buildRecipe(i.sure, i.deneyim, i.alan), []);
    const ilk = resolvedInput({ sinif: 2, ders: "hayat-bilgisi", sure: 20, deneyim: "dengeli", alan: "sinif" });
    expect(p(ilk)).toContain("Öğrenci profili: İlkokul (6–10 yaş)");
    for (const k of PROFILLER.PRIMARY_6_10.istem) expect(p(ilk)).toContain(k);
    expect(p(orta)).toContain("Öğrenci profili: Ortaokul (11–14 yaş)");
    for (const k of PROFILLER.MIDDLE_11_14.istem) expect(p(orta)).toContain(k);
    expect(p(orta)).not.toContain(PROFILLER.HIGH_15_18.istem[0]);
    expect(p(lise)).toContain("Öğrenci profili: Lise (15–18 yaş)");
    expect(p(lise)).toContain("çocuksu maskot");
  });
});

describe("ortaokul müfredatı ile oyun", () => {
  it("5–8. sınıf seçimi çözülür; kademe dışı sınıf ve ders reddedilir", () => {
    const konu = getUniteler(7, "fen-bilimleri")[0];
    const ok = parseComposeInput({ sinif: 7, dersler: [{ ders: "fen-bilimleri", konuId: konu.id }], sure: 40, deneyim: "dengeli", alan: "sinif" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.input.ogrenmeCiktilari).toEqual(konu.ogrenmeCiktilari);
    // Kademe dışı sınıf, konusu geçerli olsa da reddedilir.
    const mat = (sinif: number, s = sinif) => ({ sinif, dersler: [{ ders: "matematik", konuId: getUniteler(s, "matematik")[0].id }], sure: 40, deneyim: "dengeli", alan: "sinif" });
    expect(parseComposeInput(mat(1)).ok).toBe(true);
    for (const sinif of [0, 13]) expect(parseComposeInput(mat(sinif, 1)).ok).toBe(false);
    // Fizik ortaokulda yok; Fen Bilimleri lisede yok.
    expect(parseComposeInput({ sinif: 7, dersler: [{ ders: "fizik", konuId: getUniteler(9, "fizik")[0].id }], sure: 40, deneyim: "dengeli", alan: "sinif" }).ok).toBe(false);
    expect(parseComposeInput({ sinif: 10, dersler: [{ ders: "fen-bilimleri", konuId: konu.id }], sure: 40, deneyim: "dengeli", alan: "sinif" }).ok).toBe(false);
  });

  it.each([
    [1, "turkce"],
    [1, "matematik"],
    [2, "hayat-bilgisi"],
    [3, "fen-bilimleri"],
    [4, "sosyal-bilgiler"],
    [4, "din-kulturu"],
    [5, "turkce"],
    [6, "fen-bilimleri"],
    [7, "sosyal-bilgiler"],
    [8, "inkilap-tarihi"],
    [8, "matematik"],
  ] as const)("%i. sınıf %s: model çıktısındaki kodlar korunur, oyun doğrulamadan geçer", (sinif, ders) => {
    const girdi = resolvedInput({ sinif, ders, sure: 40, deneyim: "dengeli", alan: "sinif" });
    const cikti = toModelOutput(makeDefinition(girdi, 7));
    // Model kodun yanına açıklama yazsa da (ör. "T.D.5.3: Dinleyeceğinin...") kod ayıklanır.
    cikti.duraklar[0].ogrenme_hedefi = `${cikti.duraklar[0].ogrenme_hedefi}: ${girdi.ogrenmeCiktilari[0].metin}`;
    const t = toDefinition(cikti, girdi);
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.definition.duraklar[0].gorev.ogrenme_hedefi).toBe(girdi.ogrenmeCiktilari[0].kod);
    const v = validateGame(t.definition, validationContext(girdi));
    expect(v.hatalar.filter((h) => h.kod === "hedef-disi")).toEqual([]);
    expect(v.gecerli).toBe(true);
  });

  it("istemciye giden ortaokul seçenekleri öğrenme çıktısı içermez", () => {
    const json = JSON.stringify(getKonuSecenekleri());
    expect(json).not.toContain("FB.5.2.1");
    expect(json).not.toContain("T.D.5.3");
    expect(json).not.toContain("HB.1.1.1");
    expect(json).toContain("Ben Ve Okulum");
    expect(json).toContain("Kuvveti Tanıyalım");
  });
});

describe("durak dersi (öğretmen paneli ve oyun görünümü)", () => {
  it("ortaokul dersi adıyla görünür; soru bankası alanı klasik derse düşer", async () => {
    const { definitionToStops } = await import("@/lib/composer/adapter");
    const { durakDersAdi, toStops } = await import("@/lib/games");
    const { PROGRAM_DERSLERI, PROGRAM_DERS_ADI } = await import("@/data/mufredat/dersler");
    const orta = makeDefinition(resolvedInput({ sinif: 6, ders: "fen-bilimleri", sure: 40, deneyim: "dengeli", alan: "sinif" }), 7);
    const duraklar = definitionToStops(orta);
    expect(duraklar[0].dersKey).toBe("fen-bilimleri");
    expect(durakDersAdi(duraklar[0].dersKey)).toBe("Fen Bilimleri");
    expect(toStops(duraklar)[0]).toMatchObject({ subject: "Fen Bilimleri", dersKey: "genel-kultur" });
    const lise = definitionToStops(makeDefinition(resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" }), 7));
    expect(toStops(lise)[0]).toMatchObject({ subject: "Fizik", dersKey: "fizik" });
    for (const k of PROGRAM_DERSLERI) expect(durakDersAdi(k)).toBe(k === "din-kulturu" ? "Din Kültürü ve Ahlak Bilgisi" : PROGRAM_DERS_ADI[k]);
  });

  it("istemciye giden modüller müfredat verisini (JSON) içe aktarmaz", () => {
    const fs = jest.requireActual<typeof import("fs")>("fs");
    for (const f of ["lib/games.ts", "data/mufredat/dersler.ts"]) {
      const kaynak = fs.readFileSync(`${process.cwd()}/${f}`, "utf8");
      expect(kaynak).not.toMatch(/from ["'][^"']*(programlar|\.json)["']/);
    }
  });
});

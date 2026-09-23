import { onar } from "@/lib/composer/repair";
import { validateGame } from "@/lib/composer/validator";
import { validationContext } from "@/lib/composer/service";
import type { GameDefinition } from "@/lib/composer/definition";
import { composeAndValidate } from "@/lib/composer/service";
import { fakeClient, makeDefinition, resolvedInput, toModelOutput } from "./helpers/composerFixtures";

const input = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const clone = (d: GameDefinition): GameDefinition => JSON.parse(JSON.stringify(d));
const codes = (def: GameDefinition) => validateGame(def, validationContext(input)).hatalar.map((h) => h.kod);

describe("otomatik onarÄ±m", () => {
  it("geÃ§erli oyuna dokunmaz", () => {
    const def = makeDefinition(input, 7);
    const r = onar(def);
    expect(r.notlar).toEqual([]);
    expect(r.definition).toEqual(def);
  });

  it("gÃ¶revsiz seÃ§im duraÄŸÄ±nÄ± Ã¶nceki duraÄŸa taÅŸÄ±r", () => {
    const def = clone(makeDefinition(input, 7));
    // d1 â†’ (boÅŸ seÃ§im) â†’ d3 | d4 ; d2 gÃ¶revsiz bir seÃ§im dÃ¼ÄŸÃ¼mÃ¼
    const g = def.duraklar[1].gorev;
    g.soru = ""; g.dogru_cevap = ""; g.ipucu_1 = ""; g.ipucu_2 = "";
    g.destek_gorevi = { soru: "", secenekler: [], dogru_cevap: "", aciklama: "" };
    expect(codes(def)).toContain("soru-bos");
    const r = onar(def);
    expect(r.definition.duraklar.map((d) => d.id)).not.toContain("d2");
    expect(r.definition.duraklar[0]).toMatchObject({ sahne_turu: "secim", varsayilan_sonraki_durak_id: null });
    expect(codes(r.definition)).toEqual([]);
    expect(r.notlar).toHaveLength(1);
  });

  const bosalt = (def: GameDefinition, i: number) => {
    const g = def.duraklar[i].gorev;
    g.soru = ""; g.dogru_cevap = ""; g.ipucu_1 = ""; g.ipucu_2 = ""; g.odul_id = null;
    g.destek_gorevi = { soru: "", secenekler: [], dogru_cevap: "", aciklama: "" };
    return def;
  };

  it.each([
    ["seÃ§im Ã¶nceki duraÄŸa dÃ¶nÃ¼yor (rota kaybolurdu)", (def: GameDefinition) => { def.duraklar[1].secimler[1].hedef_durak_id = "d1"; }],
    ["silinecek durak Ã¶dÃ¼l veriyor", (def: GameDefinition) => { def.duraklar[1].gorev.odul_id = "n1"; }],
    ["iki durak boÅŸ seÃ§ime baÄŸlanÄ±yor", (def: GameDefinition) => { def.duraklar[3].varsayilan_sonraki_durak_id = "d2"; }],
  ])("gÃ¶revsiz seÃ§imi taÅŸÄ±maz: %s", (_l, boz) => {
    const def = bosalt(clone(makeDefinition(input, 7)), 1);
    boz(def);
    const r = onar(def);
    expect(r.definition.duraklar.map((d) => d.id)).toContain("d2");
    expect(r.notlar.filter((n) => n.includes("seÃ§imi"))).toEqual([]);
    expect(codes(r.definition).length).toBeGreaterThan(0);
  });

  it("okul oyununda QR'lÄ± boÅŸ seÃ§im duraÄŸÄ±nÄ± silmez", () => {
    const okul = resolvedInput({ sinif: 11, ders: "matematik", sure: 60, deneyim: "macera", alan: "okul" });
    const def = bosalt(clone(makeDefinition(okul, 9)), 1);
    expect(onar(def).definition.duraklar.map((d) => d.id)).toContain("d2");
  });

  it("baÅŸlangÄ±Ã§ duraÄŸÄ± boÅŸ seÃ§imse dokunmaz", () => {
    const def = bosalt(clone(makeDefinition(input, 7)), 0);
    def.duraklar[0].sahne_turu = "secim";
    def.duraklar[0].secimler = [{ metin: "a", hedef_durak_id: "d2" }, { metin: "b", hedef_durak_id: "d3" }];
    def.duraklar[0].varsayilan_sonraki_durak_id = null;
    expect(onar(def).definition.duraklar[0].id).toBe("d1");
  });

  it("Ã¶dÃ¼lsÃ¼z ortak durak kalmadÄ±ysa nesneyi taÅŸÄ±maz; hata kalÄ±r", () => {
    const def = clone(makeDefinition(input, 5));
    def.duraklar[3].gorev.odul_id = null; // n1 yalnÄ±z Rota A'da
    def.duraklar[0].gorev.odul_id = "n2"; def.duraklar[1].gorev.odul_id = "n2"; def.duraklar[4].gorev.odul_id = "n2";
    const r = onar(def);
    expect(r.notlar).toEqual([]);
    expect(codes(r.definition)).toContain("nesne-kacirilabilir");
  });

  it("kopuk duraÄŸÄ± dizideki Ã¶nceki rota sonuna baÄŸlar", () => {
    const def = clone(makeDefinition(input, 7));
    def.duraklar[5].varsayilan_sonraki_durak_id = null; // d6 â†’ d7 kopar
    expect(codes(def)).toContain("erisilemez-durak");
    const r = onar(def);
    expect(r.definition.duraklar[5].varsayilan_sonraki_durak_id).toBe("d7");
    expect(codes(r.definition)).toEqual([]);
  });

  it("yalnÄ±z bir dalda verilen final nesnesini ortak duraÄŸa taÅŸÄ±r", () => {
    const def = clone(makeDefinition(input, 7));
    def.duraklar[3].gorev.odul_id = null; // n1 yalnÄ±z Rota A'da
    expect(codes(def)).toContain("nesne-kacirilabilir");
    const r = onar(def);
    const verenler = r.definition.duraklar.filter((d) => d.gorev.odul_id === "n1").map((d) => d.id);
    expect(verenler).toEqual(["d7"]);
    expect(codes(r.definition)).toEqual([]);
  });

  it("girdiyi deÄŸiÅŸtirmez", () => {
    const def = clone(makeDefinition(input, 7));
    def.duraklar[5].varsayilan_sonraki_durak_id = null;
    const once = JSON.stringify(def);
    onar(def);
    expect(JSON.stringify(def)).toBe(once);
  });
});

describe("Ã¼retim akÄ±ÅŸÄ±nda onarÄ±m", () => {
  it("onarÄ±m notlarÄ± uyarÄ±larÄ±n baÅŸÄ±na eklenir ve oyun geÃ§erli olur", async () => {
    const def = clone(makeDefinition(input, 7));
    def.duraklar[5].varsayilan_sonraki_durak_id = null;
    const { definition, validation } = await composeAndValidate(input, fakeClient(toModelOutput(def)).client);
    expect(validation.gecerli).toBe(true);
    expect(validation.uyarilar[0].kod).toBe("otomatik-duzeltme");
    expect(definition.duraklar[5].varsayilan_sonraki_durak_id).toBe("d7");
  });
});

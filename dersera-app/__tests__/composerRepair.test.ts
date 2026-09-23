import { onar } from "@/lib/composer/repair";
import { validateGame } from "@/lib/composer/validator";
import { validationContext } from "@/lib/composer/service";
import type { GameDefinition } from "@/lib/composer/definition";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";

const input = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const clone = (d: GameDefinition): GameDefinition => JSON.parse(JSON.stringify(d));
const codes = (def: GameDefinition) => validateGame(def, validationContext(input)).hatalar.map((h) => h.kod);

describe("otomatik onarım", () => {
  it("geçerli oyuna dokunmaz", () => {
    const def = makeDefinition(input, 7);
    const r = onar(def);
    expect(r.notlar).toEqual([]);
    expect(r.definition).toEqual(def);
  });

  it("görevsiz seçim durağını önceki durağa taşır", () => {
    const def = clone(makeDefinition(input, 7));
    // d1 → (boş seçim) → d3 | d4 ; d2 görevsiz bir seçim düğümü
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

  it("kopuk durağı dizideki önceki rota sonuna bağlar", () => {
    const def = clone(makeDefinition(input, 7));
    def.duraklar[5].varsayilan_sonraki_durak_id = null; // d6 → d7 kopar
    expect(codes(def)).toContain("erisilemez-durak");
    const r = onar(def);
    expect(r.definition.duraklar[5].varsayilan_sonraki_durak_id).toBe("d7");
    expect(codes(r.definition)).toEqual([]);
  });

  it("yalnız bir dalda verilen final nesnesini ortak durağa taşır", () => {
    const def = clone(makeDefinition(input, 7));
    def.duraklar[3].gorev.odul_id = null; // n1 yalnız Rota A'da
    expect(codes(def)).toContain("nesne-kacirilabilir");
    const r = onar(def);
    const verenler = r.definition.duraklar.filter((d) => d.gorev.odul_id === "n1").map((d) => d.id);
    expect(verenler).toEqual(["d7"]);
    expect(codes(r.definition)).toEqual([]);
  });

  it("girdiyi değiştirmez", () => {
    const def = clone(makeDefinition(input, 7));
    def.duraklar[5].varsayilan_sonraki_durak_id = null;
    const once = JSON.stringify(def);
    onar(def);
    expect(JSON.stringify(def)).toBe(once);
  });
});

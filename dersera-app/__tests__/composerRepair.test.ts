import { onar } from "@/lib/composer/repair";
import { validateGame } from "@/lib/composer/validator";
import { validationContext } from "@/lib/composer/service";
import type { GameDefinition } from "@/lib/composer/definition";
import { composeAndValidate } from "@/lib/composer/service";
import { fakeClient, makeDefinition, resolvedInput, toModelOutput } from "./helpers/composerFixtures";

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

  it("görevi boş seçim durağını silmez (parçalı üretimde düşen grup); hata görünür kalır ve düzeltmeye gider", () => {
    const def = clone(makeDefinition(input, 7));
    const g = def.duraklar[1].gorev;
    g.soru = ""; g.dogru_cevap = ""; g.ipucu_1 = ""; g.ipucu_2 = "";
    g.destek_gorevi = { soru: "", secenekler: [], dogru_cevap: "", aciklama: "" };
    const r = onar(def);
    expect(r.definition.duraklar.map((d) => d.id)).toContain("d2");
    expect(r.definition.duraklar[1].sahne_turu).toBe("secim");
    expect(codes(r.definition)).toContain("soru-bos");
  });

  it("ödülsüz ortak durak kalmadıysa nesneyi taşımaz; hata kalır", () => {
    const def = clone(makeDefinition(input, 5));
    def.duraklar[3].gorev.odul_id = null; // n1 yalnız Rota A'da
    def.duraklar[0].gorev.odul_id = "n2"; def.duraklar[1].gorev.odul_id = "n2"; def.duraklar[4].gorev.odul_id = "n2";
    const r = onar(def);
    expect(r.notlar).toEqual([]);
    expect(codes(r.definition)).toContain("nesne-kacirilabilir");
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

  it("hiçbir durakta verilmeyen final nesnesini ortak ödülsüz durağa atar", () => {
    const def = clone(makeDefinition(input, 7));
    def.envanter.push({ id: "n3", tur: "parca", isim: "Parça", final_icin_gerekli: true });
    def.final.gerekli_nesneler.push("n3");
    expect(codes(def)).toContain("nesne-kazanilamaz");
    const r = onar(def);
    expect(r.definition.duraklar.filter((d) => d.gorev.odul_id === "n3").map((d) => d.id)).toEqual(["d7"]);
    expect(r.notlar[0]).toContain("hiçbir görevde verilmiyordu");
    expect(codes(r.definition)).toEqual([]);
  });

  it("verilecek ödülsüz ortak durak yoksa nesneyi finalden çıkarır", () => {
    const def = clone(makeDefinition(input, 5));
    // d1, d2, d5 dolu: her rotanın geçtiği ödülsüz durak kalmaz.
    def.duraklar[0].gorev.odul_id = "n2";
    def.duraklar[1].gorev.odul_id = "n2";
    def.envanter.push({ id: "n3", tur: "parca", isim: "Parça", final_icin_gerekli: true });
    def.final.gerekli_nesneler.push("n3");
    const r = onar(def);
    expect(r.definition.final.gerekli_nesneler).not.toContain("n3");
    expect(r.definition.envanter.find((e) => e.id === "n3")!.final_icin_gerekli).toBe(false);
    expect(codes(r.definition)).not.toContain("nesne-kazanilamaz");
    expect(r.notlar.some((n) => n.includes("finalin gereksinimlerinden çıkarıldı"))).toBe(true);
  });

  it("dengeli oyunda gerekli nesnelerin tümü finalden çıkarılırsa oyun yine yayınlanamaz", () => {
    const def = clone(makeDefinition(input, 5));
    def.envanter.forEach((e) => (e.final_icin_gerekli = false));
    def.envanter.push({ id: "n3", tur: "parca", isim: "Parça", final_icin_gerekli: true });
    def.final.gerekli_nesneler = ["n3"];
    def.duraklar[0].gorev.odul_id = "n2";
    def.duraklar[1].gorev.odul_id = "n2";
    const r = onar(def);
    expect(r.definition.final.gerekli_nesneler).toEqual([]);
    expect(codes(r.definition)).toContain("final-nesne-kullanmiyor");
  });

  it("envanterde olmayan nesneyi onarmaz; hata kalır", () => {
    const def = clone(makeDefinition(input, 7));
    def.final.gerekli_nesneler.push("yok");
    expect(codes(onar(def).definition)).toContain("final-nesne-yok");
  });

  it("girdiyi değiştirmez", () => {
    const def = clone(makeDefinition(input, 7));
    def.duraklar[5].varsayilan_sonraki_durak_id = null;
    const once = JSON.stringify(def);
    onar(def);
    expect(JSON.stringify(def)).toBe(once);
  });
});

describe("üretim akışında onarım", () => {
  it("onarım notları uyarıların başına eklenir ve oyun geçerli olur", async () => {
    const def = clone(makeDefinition(input, 7));
    def.duraklar[5].varsayilan_sonraki_durak_id = null;
    const { definition, validation } = await composeAndValidate(input, fakeClient(toModelOutput(def)).client);
    expect(validation.gecerli).toBe(true);
    expect(validation.uyarilar[0].kod).toBe("otomatik-duzeltme");
    expect(definition.duraklar[5].varsayilan_sonraki_durak_id).toBe("d7");
  });
});

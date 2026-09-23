import { arrive, choose, currentStep, definitionPanelStops, FINAL_ID, inventory, needsScan, qrOf } from "@/lib/composer/scene";
import type { GameProgress, SceneState } from "@/lib/gameState";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";

const sinif = makeDefinition(resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" }), 6);
const okul = makeDefinition(resolvedInput({ sinif: 11, ders: "matematik", sure: 60, deneyim: "macera", alan: "okul" }), 6);

const bos: SceneState = { yol: [], hedef: null };
const tamam = (...ids: string[]): GameProgress => Object.fromEntries(ids.map((id) => [id, { completedAt: 1, hintsUsed: 0 }]));

describe("sahne akışı (tek sınıf)", () => {
  it("başlangıçta ilk durağa geçiş gösterir; QR gerekmez", () => {
    const s = currentStep(sinif, bos, {}, false);
    expect(s).toMatchObject({ tur: "gecis", hedef: "d1", onceki: null });
    expect(needsScan(sinif, "d1")).toBe(false);
  });

  it("varılan durakta görev, tamamlanınca varsayılan sonraki durağa geçiş gelir", () => {
    const st = arrive(bos, "d1");
    expect(currentStep(sinif, st, {}, false)).toMatchObject({ tur: "gorev", durak: { id: "d1" } });
    expect(currentStep(sinif, st, tamam("d1"), false)).toMatchObject({ tur: "gecis", hedef: "d2" });
  });

  it("seçim sahnesinde görevden sonra karar istenir; seçim rotayı belirler", () => {
    const st = arrive(arrive(bos, "d1"), "d2");
    const p = tamam("d1", "d2");
    expect(currentStep(sinif, st, p, false)).toMatchObject({ tur: "secim", durak: { id: "d2" } });
    const secildi = choose(st, "d4");
    expect(currentStep(sinif, secildi, p, false)).toMatchObject({ tur: "gecis", hedef: "d4" });
    expect(currentStep(sinif, arrive(secildi, "d4"), p, false)).toMatchObject({ tur: "gorev", durak: { id: "d4" } });
  });

  it("yanlış cevap rotayı değiştirmez: görev tamamlanana kadar aynı durakta kalınır", () => {
    const st = arrive(bos, "d1");
    expect(currentStep(sinif, st, {}, false)).toMatchObject({ tur: "gorev", durak: { id: "d1" } });
  });

  it("son durak finale, final de bitişe götürür", () => {
    const son = `d${sinif.duraklar.length}`;
    const st: SceneState = { yol: ["d1", "d2", "d3", "d5", son], hedef: null };
    expect(currentStep(sinif, st, tamam("d1", "d2", "d3", "d5", son), false)).toMatchObject({ tur: "gecis", hedef: FINAL_ID });
    expect(currentStep(sinif, arrive(st, FINAL_ID), {}, false)).toEqual({ tur: "final" });
    expect(currentStep(sinif, arrive(st, FINAL_ID), {}, true)).toEqual({ tur: "bitti" });
  });

  it("geri dönüşlü rotada tamamlanmış sahneye gelinirse görev tekrar sorulmaz", () => {
    const st: SceneState = { yol: ["d1", "d2", "d3", "d2"], hedef: null };
    expect(currentStep(sinif, st, tamam("d1", "d2", "d3"), false)).toMatchObject({ tur: "secim" });
  });

  it("envanter tamamlanan görevlerin ödüllerinden hesaplanır; aynı nesne iki kez sayılmaz", () => {
    expect(inventory(sinif, tamam("d1", "d3"))).toEqual(["n1"]);
    expect(inventory(sinif, tamam("d3", "d4", "d5"))).toEqual(["n1", "n2"]);
  });
});

describe("sahne akışı (okul macerası)", () => {
  it("hedefe varmak için o durağın QR'ı taranmalıdır; final QR istemez", () => {
    expect(needsScan(okul, "d1")).toBe(true);
    expect(qrOf(okul, "d3")).toBe(3);
    expect(needsScan(okul, FINAL_ID)).toBe(false);
  });
});

describe("öğretmen paneli durakları", () => {
  it("sonuçlardaki durak anahtarlarıyla aynı kimlikleri kullanır", () => {
    expect(definitionPanelStops(sinif).map((s) => s.id)).toEqual(sinif.duraklar.map((d) => d.id));
  });
});

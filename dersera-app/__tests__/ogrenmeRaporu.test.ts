import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";
import type { LeaderboardEntry } from "@/lib/gameState";
import { ogrenmeRaporu } from "@/lib/ogrenmeRaporu";

const girdi = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const def = makeDefinition(girdi, 6);
// Öğrenci sonucu: durak id → yanlış sayısı.
const sonuc = (ad: string, yanlis: Record<string, number>, dk = 20): LeaderboardEntry => ({
  nickname: ad,
  netSeconds: dk * 60,
  penaltySeconds: 0,
  hintsUsed: Object.values(yanlis).reduce((a, b) => a + b, 0),
  completedAt: 1,
  stopDetails: Object.fromEntries(Object.entries(yanlis).map(([id, y]) => [id, { hintsUsed: y, completedAt: 1 }])),
});

describe("öğrenme raporu", () => {
  it("katılım: bitiren, bitirmeyen, oran ve ortanca süre", () => {
    const r = ogrenmeRaporu(def, [sonuc("a", {}, 10), sonuc("b", {}, 20), sonuc("c", {}, 40)], 5);
    expect(r).toMatchObject({ katilan: 5, bitiren: 3, bitirmeyen: 2, bitirmeOrani: 0.6, medyanSureDk: 20 });
    // Katılan bilinmiyorsa ya da bitirenden azsa (eski oyun) tutarlı kalır.
    expect(ogrenmeRaporu(def, [sonuc("a", {})], null)).toMatchObject({ katilan: null, bitirmeyen: null, bitirmeOrani: null });
    expect(ogrenmeRaporu(def, [sonuc("a", {}), sonuc("b", {})], 1)).toMatchObject({ katilan: 2, bitirmeyen: 0 });
    expect(ogrenmeRaporu(def, [], 4)).toMatchObject({ bitiren: 0, medyanSureDk: null, bitirmeOrani: 0 });
  });

  it("durak: ilk denemede doğru, destek görevine düşen (≥3 yanlış), ortalama yanlış", () => {
    const r = ogrenmeRaporu(def, [sonuc("a", { d1: 0 }), sonuc("b", { d1: 1 }), sonuc("c", { d1: 3 }), sonuc("d", { d1: 0 })], null);
    expect(r.duraklar[0]).toMatchObject({ id: "d1", ulasan: 4, ilkDenemeOrani: 0.5, destekOrani: 0.25, ortalamaYanlis: 1, zorluk: "orta" });
    // Hiç ulaşılmayan durak (ör. seçilmeyen rota) az veri.
    expect(r.duraklar.find((d) => d.id === "d4")).toMatchObject({ ulasan: 0, ilkDenemeOrani: null, zorluk: "az-veri" });
  });

  it("öğrenme çıktısı bazında birleşir ve en çok zorlanılan önce sıralanır", () => {
    const hedef = (id: string) => def.duraklar.find((d) => d.id === id)!.gorev.ogrenme_hedefi;
    const kolay = hedef("d1");
    const r = ogrenmeRaporu(
      def,
      ["a", "b", "c", "d"].map((ad) => sonuc(ad, { d1: 0, d2: 3, d3: 2 })),
      null
    );
    expect(r.hedefler[0].zorluk).toBe("zor");
    expect(r.hedefler.find((h) => h.kod === kolay && h.duraklar.includes("Başlangıç"))).toBeDefined();
    const zor = r.hedefler[0];
    expect(zor.ilkDenemeOrani).toBe(0);
    expect(r.hedefler.map((h) => h.zorluk)).toEqual([...r.hedefler.map((h) => h.zorluk)].sort((a, b) => ["zor", "orta", "iyi", "az-veri"].indexOf(a) - ["zor", "orta", "iyi", "az-veri"].indexOf(b)));
  });

  it(`en az 3 öğrenci yoksa yorumlanmaz (az veri)`, () => {
    const r = ogrenmeRaporu(def, [sonuc("a", { d1: 3 }), sonuc("b", { d1: 3 })], null);
    expect(r.duraklar[0].zorluk).toBe("az-veri");
  });
});

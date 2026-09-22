import { sinif10 } from "../data/mufredat/sinif10";
import {
  getSorular,
  getAyIndex,
  rastgeleSoru,
  AYLAR,
  DERS_ADI,
} from "../data/mufredat";
import type { Ders } from "../data/mufredat";
import {
  isPreviousStopsComplete,
  type GameProgress,
} from "../lib/gameState";

const CORE_DERSLER: Ders[] = ["matematik", "fizik", "kimya", "turk-dili"];

describe("sinif10 şema bütünlüğü", () => {
  test("9 aylık veri mevcut", () => {
    expect(sinif10).toHaveLength(9);
  });

  test("her ay 4 ders içeriyor", () => {
    sinif10.forEach((ayPlan) => {
      CORE_DERSLER.forEach((ders) => {
        expect(ayPlan.dersler[ders]).toBeDefined();
      });
    });
  });

  test("her ders tam 3 soru içeriyor", () => {
    sinif10.forEach((ayPlan) => {
      CORE_DERSLER.forEach((ders) => {
        expect(ayPlan.dersler[ders]?.sorular).toHaveLength(3);
      });
    });
  });

  test("her soru tam 4 seçenek içeriyor", () => {
    sinif10.forEach((ayPlan) => {
      CORE_DERSLER.forEach((ders) => {
        ayPlan.dersler[ders]?.sorular.forEach((s) => {
          expect(s.secenekler).toHaveLength(4);
        });
      });
    });
  });

  test("dogruIndex 0-3 arasında", () => {
    sinif10.forEach((ayPlan) => {
      CORE_DERSLER.forEach((ders) => {
        ayPlan.dersler[ders]?.sorular.forEach((s) => {
          expect(s.dogruIndex).toBeGreaterThanOrEqual(0);
          expect(s.dogruIndex).toBeLessThanOrEqual(3);
        });
      });
    });
  });

  test("her soru metni ve iki ipucu dolu", () => {
    sinif10.forEach((ayPlan) => {
      CORE_DERSLER.forEach((ders) => {
        ayPlan.dersler[ders]?.sorular.forEach((s) => {
          expect(s.soru.trim()).toBeTruthy();
          expect(s.ipucu1.trim()).toBeTruthy();
          expect(s.ipucu2.trim()).toBeTruthy();
        });
      });
    });
  });

  test("ay slugları AYLAR listesiyle örtüşüyor", () => {
    const sluglar = AYLAR.map((a) => a.ay);
    sinif10.forEach((ayPlan) => {
      expect(sluglar).toContain(ayPlan.ay);
    });
  });

  test("'edebiyat' anahtarı artık yok; 'turk-dili' mevcut", () => {
    sinif10.forEach((ayPlan) => {
      expect(Object.keys(ayPlan.dersler)).not.toContain("edebiyat");
      expect(ayPlan.dersler["turk-dili"]).toBeDefined();
    });
  });
});

describe("genişletilmiş ders tipi", () => {
  test("DERS_ADI tüm yeni dersleri içeriyor", () => {
    expect(DERS_ADI["turk-dili"]).toBe("Türk Dili ve Edebiyatı");
    expect(DERS_ADI["biyoloji"]).toBe("Biyoloji");
    expect(DERS_ADI["tarih"]).toBe("Tarih");
    expect(DERS_ADI["cografya"]).toBe("Coğrafya");
    expect(DERS_ADI["felsefe"]).toBe("Felsefe");
    expect(DERS_ADI["din-kulturu"]).toBe("Din Kültürü ve Ahlak Bilgisi");
    expect(DERS_ADI["genel-kultur"]).toBe("Genel Kültür");
  });

  test("DERS_ADI 'edebiyat' anahtarı içermiyor", () => {
    expect((DERS_ADI as Record<string, string>)["edebiyat"]).toBeUndefined();
  });
});

describe("çoklu ay filtresi (getSorular)", () => {
  test("Eylül: 3 soru döner", () => {
    expect(getSorular("matematik", ["eylul"])).toHaveLength(3);
  });

  test("Eylül + Ekim: 6 soru döner", () => {
    expect(getSorular("matematik", ["eylul", "ekim"])).toHaveLength(6);
  });

  test("Tüm 9 ay: 27 soru döner (9 × 3)", () => {
    const tumAylar = AYLAR.map((a) => a.ay);
    CORE_DERSLER.forEach((ders) => {
      expect(getSorular(ders, [...tumAylar])).toHaveLength(27);
    });
  });

  test("Boş ay listesi: soru yok", () => {
    expect(getSorular("matematik", [])).toHaveLength(0);
  });

  test("Bilinmeyen ay: soru yok", () => {
    expect(getSorular("matematik", ["blinmeyen"])).toHaveLength(0);
  });

  test("getAyIndex geçersiz slug için 0 döner", () => {
    expect(getAyIndex("yok")).toBe(0);
  });

  test("getAyIndex bilinen slugları doğru indeksler", () => {
    expect(getAyIndex("eylul")).toBe(0);
    expect(getAyIndex("mayis")).toBe(8);
  });

  test("Yeni ders tipi için boş döner (veri yok)", () => {
    expect(getSorular("biyoloji", ["eylul"])).toHaveLength(0);
  });
});

describe("rastgeleSoru", () => {
  test("geçerli bir soru döndürüyor", () => {
    const s = rastgeleSoru("matematik", ["eylul"]);
    expect(s).not.toBeNull();
    expect(s!.soru.trim()).toBeTruthy();
    expect(s!.secenekler).toHaveLength(4);
    expect(s!.dogruIndex).toBeGreaterThanOrEqual(0);
  });

  test("birden fazla çağrıda farklı sorular gelebiliyor", () => {
    const tumAylar = AYLAR.map((a) => a.ay);
    const sonuclar = new Set(
      Array.from({ length: 50 }, () => rastgeleSoru("matematik", [...tumAylar])?.soru)
    );
    expect(sonuclar.size).toBeGreaterThan(1);
  });

  test("yalnızca seçilen ayların sorularından seçiyor", () => {
    const seciliSorular = new Set(
      getSorular("fizik", ["eylul", "ekim"]).map((s) => s.soru)
    );
    for (let i = 0; i < 30; i++) {
      const s = rastgeleSoru("fizik", ["eylul", "ekim"]);
      expect(seciliSorular.has(s!.soru)).toBe(true);
    }
  });

  test("veri olmayan ders için null döner", () => {
    expect(rastgeleSoru("biyoloji", ["eylul"])).toBeNull();
  });
});

describe("sıra kilidi (isPreviousStopsComplete)", () => {
  const orderedStops = [
    { id: "bahce", order: 1 },
    { id: "koridor", order: 2 },
    { id: "fizik-lab", order: 3 },
    { id: "kutuphane", order: 4 },
    { id: "mudur-odasi", order: 5 },
  ];

  test("ilk durak her zaman erişilebilir", () => {
    const emptyProgress: GameProgress = {};
    expect(isPreviousStopsComplete(1, emptyProgress, orderedStops)).toBe(true);
  });

  test("2. durak: 1. tamamlanmışsa erişilebilir", () => {
    const progress: GameProgress = {
      bahce: { completedAt: Date.now(), hintsUsed: 0 },
    };
    expect(isPreviousStopsComplete(2, progress, orderedStops)).toBe(true);
  });

  test("2. durak: 1. tamamlanmamışsa kilitli", () => {
    const emptyProgress: GameProgress = {};
    expect(isPreviousStopsComplete(2, emptyProgress, orderedStops)).toBe(false);
  });

  test("3. durak: 1. ve 2. tamamlanmışsa erişilebilir", () => {
    const progress: GameProgress = {
      bahce: { completedAt: Date.now(), hintsUsed: 0 },
      koridor: { completedAt: Date.now(), hintsUsed: 1 },
    };
    expect(isPreviousStopsComplete(3, progress, orderedStops)).toBe(true);
  });

  test("3. durak: yalnızca 1. tamamlanmışsa kilitli", () => {
    const progress: GameProgress = {
      bahce: { completedAt: Date.now(), hintsUsed: 0 },
    };
    expect(isPreviousStopsComplete(3, progress, orderedStops)).toBe(false);
  });

  test("5. durak: tüm öncekiler tamamsa erişilebilir", () => {
    const progress: GameProgress = {
      bahce: { completedAt: Date.now(), hintsUsed: 0 },
      koridor: { completedAt: Date.now(), hintsUsed: 0 },
      "fizik-lab": { completedAt: Date.now(), hintsUsed: 0 },
      kutuphane: { completedAt: Date.now(), hintsUsed: 0 },
    };
    expect(isPreviousStopsComplete(5, progress, orderedStops)).toBe(true);
  });
});

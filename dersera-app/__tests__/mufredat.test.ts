import { sinif10 } from "../data/mufredat/sinif10";
import {
  getSorular,
  getAyIndex,
  rastgeleSoru,
  AYLAR,
} from "../data/mufredat";
import type { Ders } from "../data/mufredat";

const DERSLER: Ders[] = ["matematik", "fizik", "kimya", "edebiyat"];

describe("sinif10 şema bütünlüğü", () => {
  test("9 aylık veri mevcut", () => {
    expect(sinif10).toHaveLength(9);
  });

  test("her ay 4 ders içeriyor", () => {
    sinif10.forEach((ayPlan) => {
      DERSLER.forEach((ders) => {
        expect(ayPlan.dersler[ders]).toBeDefined();
      });
    });
  });

  test("her ders tam 3 soru içeriyor", () => {
    sinif10.forEach((ayPlan) => {
      DERSLER.forEach((ders) => {
        expect(ayPlan.dersler[ders].sorular).toHaveLength(3);
      });
    });
  });

  test("her soru tam 4 seçenek içeriyor", () => {
    sinif10.forEach((ayPlan) => {
      DERSLER.forEach((ders) => {
        ayPlan.dersler[ders].sorular.forEach((s) => {
          expect(s.secenekler).toHaveLength(4);
        });
      });
    });
  });

  test("dogruIndex 0-3 arasında", () => {
    sinif10.forEach((ayPlan) => {
      DERSLER.forEach((ders) => {
        ayPlan.dersler[ders].sorular.forEach((s) => {
          expect(s.dogruIndex).toBeGreaterThanOrEqual(0);
          expect(s.dogruIndex).toBeLessThanOrEqual(3);
        });
      });
    });
  });

  test("her soru metni ve iki ipucu dolu", () => {
    sinif10.forEach((ayPlan) => {
      DERSLER.forEach((ders) => {
        ayPlan.dersler[ders].sorular.forEach((s) => {
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
});

describe("birikimli ay filtresi (getSorular)", () => {
  test("Eylül (index 0): 3 soru döner", () => {
    expect(getSorular("matematik", 0)).toHaveLength(3);
  });

  test("Ekim (index 1): 6 soru döner (Eylül+Ekim)", () => {
    expect(getSorular("matematik", 1)).toHaveLength(6);
  });

  test("Mayıs (index 8): 27 soru döner (9 ay × 3)", () => {
    DERSLER.forEach((ders) => {
      expect(getSorular(ders, 8)).toHaveLength(27);
    });
  });

  test("getAyIndex geçersiz slug için 0 döner", () => {
    expect(getAyIndex("yok")).toBe(0);
  });

  test("getAyIndex bilinen slugları doğru indeksler", () => {
    expect(getAyIndex("eylul")).toBe(0);
    expect(getAyIndex("mayis")).toBe(8);
  });
});

describe("rastgeleSoru", () => {
  test("geçerli bir soru döndürüyor", () => {
    const s = rastgeleSoru("matematik", 0);
    expect(s.soru.trim()).toBeTruthy();
    expect(s.secenekler).toHaveLength(4);
    expect(s.dogruIndex).toBeGreaterThanOrEqual(0);
  });

  test("birden fazla çağrıda farklı sorular gelebiliyor (deterministik değil)", () => {
    const sonuclar = new Set(
      Array.from({ length: 50 }, () => rastgeleSoru("matematik", 8).soru)
    );
    // 27 soru var; 50 denemede en az 2 farklı soru çıkmalı
    expect(sonuclar.size).toBeGreaterThan(1);
  });

  test("sadece seçilen aya kadar olan sorulardan seçiyor", () => {
    const kasimSorulari = new Set(
      getSorular("fizik", 2).map((s) => s.soru)
    );
    // Ekim'den (index 1) sonraki sorular seçilmemeli
    for (let i = 0; i < 30; i++) {
      const s = rastgeleSoru("fizik", 2);
      expect(kasimSorulari.has(s.soru)).toBe(true);
    }
  });
});

import { readFileSync } from "fs";
import { join } from "path";
import { loadEndTime, loadLeaderboard, loadPenaltySeconds, loadProgress, loadSceneState, STORAGE_KEYS, type LeaderboardEntry } from "@/lib/gameState";
import { bellekOyunKaydi, yerelOyunKaydi } from "@/lib/oyunKaydi";

// Testler Node'da çalışır: localStorage, çağrıları kaydeden bir Map ile taklit edilir.
function sahteDepo() {
  const m = new Map<string, string>();
  const cagrilar: string[] = [];
  const depo = {
    getItem: (k: string) => (cagrilar.push(`get ${k}`), m.get(k) ?? null),
    setItem: (k: string, v: string) => (cagrilar.push(`set ${k}`), void m.set(k, v)),
    removeItem: (k: string) => (cagrilar.push(`remove ${k}`), void m.delete(k)),
  };
  return { m, cagrilar, depo };
}

const sonuc: LeaderboardEntry = { nickname: "kartal", netSeconds: 300, penaltySeconds: 15, hintsUsed: 1, completedAt: 5 };

describe("oynatıcı durum deposu", () => {
  const eski = (globalThis as { localStorage?: unknown }).localStorage;
  let d: ReturnType<typeof sahteDepo>;
  beforeEach(() => {
    d = sahteDepo();
    (globalThis as { localStorage?: unknown }).localStorage = d.depo;
  });
  afterAll(() => {
    (globalThis as { localStorage?: unknown }).localStorage = eski;
  });

  it("öğrenci oyunu: aynı localStorage anahtarlarına aynı biçimde yazar (lib/gameState.ts ile birebir)", () => {
    const k = yerelOyunKaydi;
    k.sahneYaz({ yol: ["d1"], hedef: "d2" });
    k.durakBitti("d1", 2);
    k.cezaEkle(15);
    k.cezaEkle(15);
    k.bitisYaz(1234);
    k.sonucEkle(sonuc);
    expect(loadSceneState()).toEqual({ yol: ["d1"], hedef: "d2" });
    expect(loadProgress().d1).toMatchObject({ hintsUsed: 2 });
    expect(loadPenaltySeconds()).toBe(30);
    expect(loadEndTime()).toBe(1234);
    expect(loadLeaderboard()).toEqual([sonuc]);
    expect([...d.m.keys()].sort()).toEqual([STORAGE_KEYS.SAHNE_YOLU, STORAGE_KEYS.PROGRESS, STORAGE_KEYS.PENALTY, STORAGE_KEYS.END_TIME, STORAGE_KEYS.LEADERBOARD].sort());
    // Okuma da aynı yerden: sayfa yenilenince öğrenci kaldığı yerden devam eder.
    expect([k.sahne(), k.ilerleme().d1.hintsUsed, k.ceza(), k.bitis()]).toEqual([{ yol: ["d1"], hedef: "d2" }, 2, 30, 1234]);
  });

  it("demo: yalnız bellek; localStorage'a hiç dokunmaz, öğrencinin kayıtlı oyunu değişmez", () => {
    d.m.set(STORAGE_KEYS.PROGRESS, JSON.stringify({ x: { completedAt: 1, hintsUsed: 0 } }));
    d.m.set(STORAGE_KEYS.PENALTY, "45");
    const k = bellekOyunKaydi(() => 99);
    expect([k.sahne(), k.ilerleme(), k.ceza(), k.bitis()]).toEqual([{ yol: [], hedef: null }, {}, 0, null]);
    k.sahneYaz({ yol: ["d1"], hedef: null });
    k.durakBitti("d1", 3);
    k.cezaEkle(15);
    k.bitisYaz(500);
    k.sonucEkle(sonuc);
    expect([k.sahne(), k.ilerleme(), k.ceza(), k.bitis()]).toEqual([{ yol: ["d1"], hedef: null }, { d1: { completedAt: 99, hintsUsed: 3 } }, 15, 500]);
    expect(d.cagrilar).toEqual([]);
    expect(loadProgress()).toEqual({ x: { completedAt: 1, hintsUsed: 0 } });
    expect(loadPenaltySeconds()).toBe(45);
    // Dışarıya verilen ilerleme kopyadır; "Baştan" yeni depo boş başlar.
    k.ilerleme().d2 = { completedAt: 1, hintsUsed: 0 };
    expect(Object.keys(k.ilerleme())).toEqual(["d1"]);
    expect(bellekOyunKaydi().ilerleme()).toEqual({});
  });

  it("oynatıcı durumu yalnız depo üzerinden okur ve yazar (doğrudan localStorage işlevi kullanmaz)", () => {
    const kaynak = readFileSync(join(__dirname, "..", "app", "game", "composer", "ComposerPlayer.tsx"), "utf8");
    for (const f of ["loadSceneState", "saveSceneState", "loadProgress", "markStopComplete", "addPenalty", "loadPenaltySeconds", "loadEndTime", "saveEndTime", "addLeaderboardEntry"]) {
      expect(kaynak).not.toMatch(new RegExp(`\\b${f}\\b`));
    }
    // Demo sonuç ve puan göndermez.
    expect(kaynak).toMatch(/if \(!entry \|\| demo\) return;/);
  });
});

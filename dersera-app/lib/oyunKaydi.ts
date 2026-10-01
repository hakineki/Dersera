import {
  addLeaderboardEntry,
  addPenalty,
  loadEndTime,
  loadPenaltySeconds,
  loadProgress,
  loadSceneState,
  loadTakimSirasi,
  markStopComplete,
  saveEndTime,
  saveSceneState,
  type GameProgress,
  type LeaderboardEntry,
  type SceneState,
} from "@/lib/gameState";

// Composer oynatıcısının durum deposu. Öğrenci oyununda bu cihazın yerel deposu (sayfa yenilense ya da Wi-Fi kesilse de
// sürer; lib/gameState.ts). Öğretmenin "öğrenci gözüyle" demosunda yalnız bellek: öğrencinin yerel oyun durumuna ve
// sonuç tablosuna dokunmaz, sayfa kapanınca silinir.
export interface OyunKaydi {
  sahne(): SceneState;
  sahneYaz(s: SceneState): void;
  ilerleme(): GameProgress;
  durakBitti(durakId: string, yanlis: number): void;
  ceza(): number;
  cezaEkle(saniye: number): void;
  bitis(): number | null;
  bitisYaz(t: number): void;
  sonucEkle(e: LeaderboardEntry): void;
  // Katılım sırası (mekân rotasında başlangıç durağı); demoda yok.
  takimSirasi(): number | null;
}

export const yerelOyunKaydi: OyunKaydi = {
  sahne: loadSceneState,
  sahneYaz: saveSceneState,
  ilerleme: loadProgress,
  durakBitti: markStopComplete,
  ceza: loadPenaltySeconds,
  cezaEkle: addPenalty,
  bitis: loadEndTime,
  bitisYaz: saveEndTime,
  sonucEkle: addLeaderboardEntry,
  takimSirasi: loadTakimSirasi,
};

export function bellekOyunKaydi(now: () => number = Date.now): OyunKaydi {
  let sahne: SceneState = { yol: [], hedef: null };
  let ilerleme: GameProgress = {};
  let ceza = 0;
  let bitis: number | null = null;
  return {
    sahne: () => sahne,
    sahneYaz: (s) => {
      sahne = s;
    },
    ilerleme: () => ({ ...ilerleme }),
    durakBitti: (durakId, yanlis) => {
      ilerleme = { ...ilerleme, [durakId]: { completedAt: now(), hintsUsed: yanlis } };
    },
    ceza: () => ceza,
    cezaEkle: (saniye) => {
      ceza += saniye;
    },
    bitis: () => bitis,
    bitisYaz: (t) => {
      bitis = t;
    },
    // Demoda sonuç tablosu yok.
    sonucEkle: () => {},
    takimSirasi: () => null,
  };
}

import {
  STORAGE_KEYS,
  loadGameSnapshot,
  loadNickname,
  loadProgress,
  loadStartTime,
  markStopComplete,
  addPenalty,
  saveEndTime,
  saveNickname,
  saveStartTime,
  switchToGame,
  restartGame,
  loadPenaltySeconds,
  loadEndTime,
} from "@/lib/gameState";
import type { PublicGame } from "@/lib/games";

const store: Record<string, string> = {};
Object.defineProperty(global, "localStorage", {
  value: {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  },
});

const game = (code: string): PublicGame => ({
  code,
  stops: [],
  aylar: ["eylul"],
  createdAt: 0,
  expiresAt: 1,
  endedAt: null,
});

function playSome() {
  saveNickname("Kartal");
  saveStartTime(100);
  markStopComplete("qr-1", 1);
  addPenalty(15);
  saveEndTime(900);
}

beforeEach(() => Object.keys(store).forEach((k) => delete store[k]));

describe("oyun anlık görüntüsü", () => {
  it("kaydedilen oyunu geri yükler, bozuk veride null döner", () => {
    switchToGame(game("ABC-123"));
    expect(loadGameSnapshot()?.code).toBe("ABC-123");
    store[STORAGE_KEYS.GAME] = "{bozuk";
    expect(loadGameSnapshot()).toBeNull();
    store[STORAGE_KEYS.GAME] = JSON.stringify({ code: "X" });
    expect(loadGameSnapshot()).toBeNull();
  });

  it("aynı oyuna yeniden girişte ilerleme korunur", () => {
    switchToGame(game("ABC-123"));
    playSome();
    switchToGame({ ...game("ABC-123"), endedAt: 5 });
    expect(loadNickname()).toBe("Kartal");
    expect(Object.keys(loadProgress())).toEqual(["qr-1"]);
    expect(loadGameSnapshot()?.endedAt).toBe(5);
  });

  it("farklı oyuna geçişte önceki oyunun tüm verisi silinir", () => {
    switchToGame(game("ABC-123"));
    playSome();
    switchToGame(game("XYZ-999"));
    expect(loadGameSnapshot()?.code).toBe("XYZ-999");
    expect(loadNickname()).toBeNull();
    expect(loadStartTime()).toBeNull();
    expect(loadProgress()).toEqual({});
    expect(loadPenaltySeconds()).toBe(0);
    expect(loadEndTime()).toBeNull();
  });
});

describe("restartGame", () => {
  it("takma adı ve oyunu korur; süre, ilerleme, ceza ve bitişi sıfırlar", () => {
    switchToGame(game("ABC-123"));
    playSome();
    restartGame(5_000);
    expect(loadNickname()).toBe("Kartal");
    expect(loadGameSnapshot()?.code).toBe("ABC-123");
    expect(loadStartTime()).toBe(5_000);
    expect(loadProgress()).toEqual({});
    expect(loadPenaltySeconds()).toBe(0);
    expect(loadEndTime()).toBeNull();
  });
});

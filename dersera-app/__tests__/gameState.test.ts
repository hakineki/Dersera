import {
  loadPenaltySeconds,
  addPenalty,
  loadLeaderboard,
  addLeaderboardEntry,
  type LeaderboardEntry,
} from "../lib/gameState";

// Node ortamında localStorage mock'u
const store: Record<string, string> = {};
Object.defineProperty(global, "localStorage", {
  value: {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  },
  writable: true,
});

function makeEntry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    nickname: "testci",
    netSeconds: 120,
    penaltySeconds: 0,
    hintsUsed: 0,
    completedAt: 1000000,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("ceza (penalty) mekanizması", () => {
  test("başlangıçta 0 saniye", () => {
    expect(loadPenaltySeconds()).toBe(0);
  });

  test("addPenalty birikmeli çalışır", () => {
    addPenalty(15);
    expect(loadPenaltySeconds()).toBe(15);
    addPenalty(15);
    expect(loadPenaltySeconds()).toBe(30);
  });

  test("3 yanlış = 45 saniye ceza", () => {
    addPenalty(15);
    addPenalty(15);
    addPenalty(15);
    expect(loadPenaltySeconds()).toBe(45);
  });
});

describe("sınıf sıralaması (leaderboard)", () => {
  test("başlangıçta boş liste", () => {
    expect(loadLeaderboard()).toHaveLength(0);
  });

  test("tek giriş kaydedilebilir", () => {
    addLeaderboardEntry(makeEntry({ nickname: "ali", netSeconds: 200 }));
    const board = loadLeaderboard();
    expect(board).toHaveLength(1);
    expect(board[0].nickname).toBe("ali");
  });

  test("aynı takma ad güncellenir (eski kayıt silinir)", () => {
    addLeaderboardEntry(makeEntry({ nickname: "ali", netSeconds: 300 }));
    addLeaderboardEntry(makeEntry({ nickname: "ali", netSeconds: 200 }));
    const board = loadLeaderboard();
    expect(board).toHaveLength(1);
    expect(board[0].netSeconds).toBe(200);
  });

  test("farklı takma adlar birlikte tutulur", () => {
    addLeaderboardEntry(makeEntry({ nickname: "ali" }));
    addLeaderboardEntry(makeEntry({ nickname: "veli" }));
    expect(loadLeaderboard()).toHaveLength(2);
  });

  test("toplam süreye göre küçükten büyüğe sıralanır", () => {
    addLeaderboardEntry(makeEntry({ nickname: "c", netSeconds: 300, penaltySeconds: 30 }));
    addLeaderboardEntry(makeEntry({ nickname: "a", netSeconds: 200, penaltySeconds: 0 }));
    addLeaderboardEntry(makeEntry({ nickname: "b", netSeconds: 150, penaltySeconds: 60 }));
    const board = loadLeaderboard();
    // a: 200, b: 210, c: 330
    expect(board[0].nickname).toBe("a");
    expect(board[1].nickname).toBe("b");
    expect(board[2].nickname).toBe("c");
  });

  test("ceza dahil toplam süre sıralamayı etkiler", () => {
    // hızlı: net 100 + ceza 120 = 220; sakin: net 180 + ceza 0 = 180
    addLeaderboardEntry(makeEntry({ nickname: "hızlı", netSeconds: 100, penaltySeconds: 120 }));
    addLeaderboardEntry(makeEntry({ nickname: "sakin", netSeconds: 180, penaltySeconds: 0 }));
    const board = loadLeaderboard();
    expect(board[0].nickname).toBe("sakin"); // 180 < 220
  });
});

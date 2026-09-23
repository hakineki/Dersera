import { parseLeaderboardEntry } from "@/lib/results";
import { buildResultCode, mergeLeaderboardEntry, type LeaderboardEntry } from "@/lib/gameState";

const valid = {
  nickname: "Kartal_7",
  netSeconds: 540,
  penaltySeconds: 30,
  hintsUsed: 2,
  completedAt: 1_790_000_000_000,
  stopDetails: {
    bahce: { hintsUsed: 0, completedAt: 1_789_999_000_000 },
    "kimya-lab": { hintsUsed: 2, completedAt: 1_789_999_500_000 },
    "custom-1790000000000": { hintsUsed: 0, completedAt: 1_789_999_900_000 },
  },
};

describe("parseLeaderboardEntry", () => {
  it("geçerli girişi kabul eder", () => {
    expect(parseLeaderboardEntry(valid)).toEqual(valid);
  });

  it("stopDetails olmadan da kabul eder", () => {
    const rest: Partial<typeof valid> = { ...valid };
    delete rest.stopDetails;
    expect(parseLeaderboardEntry(rest)).toEqual(rest);
  });

  it("takma adı kırpar ve Türkçe karakterlere izin verir", () => {
    expect(parseLeaderboardEntry({ ...valid, nickname: "  Çağrı  " })?.nickname).toBe("Çağrı");
  });

  it("şemada olmayan alanları atar", () => {
    const parsed = parseLeaderboardEntry({ ...valid, isAdmin: true, resultCode: "XXX" });
    expect(parsed).not.toHaveProperty("isAdmin");
    expect(parsed).not.toHaveProperty("resultCode");
  });

  it.each([
    ["nesne olmayan gövde", "metin"],
    ["null", null],
    ["dizi", [valid]],
    ["çok kısa takma ad", { ...valid, nickname: "a" }],
    ["çok uzun takma ad", { ...valid, nickname: "a".repeat(21) }],
    ["izinsiz karakter", { ...valid, nickname: "<script>" }],
    ["negatif süre", { ...valid, netSeconds: -1 }],
    ["ondalıklı süre", { ...valid, netSeconds: 1.5 }],
    ["24 saati aşan süre", { ...valid, netSeconds: 86_401 }],
    ["metin olarak sayı", { ...valid, hintsUsed: "2" }],
    ["eksik completedAt", { ...valid, completedAt: undefined }],
    ["dizi olan stopDetails", { ...valid, stopDetails: [] }],
    ["geçersiz durak id", { ...valid, stopDetails: { "Kimya Lab": { hintsUsed: 0, completedAt: 1 } } }],
    ["bozuk durak detayı", { ...valid, stopDetails: { bahce: { hintsUsed: -3, completedAt: 1 } } }],
  ])("reddeder: %s", (_label, body) => {
    expect(parseLeaderboardEntry(body)).toBeNull();
  });

  it("__proto__ durak anahtarını reddeder ve prototipi kirletmez", () => {
    const body = JSON.parse(
      `{"nickname":"Kartal","netSeconds":1,"penaltySeconds":0,"hintsUsed":0,"completedAt":1,"stopDetails":{"__proto__":{"hintsUsed":0,"completedAt":1}}}`
    );
    expect(parseLeaderboardEntry(body)).toBeNull();
    expect(({} as Record<string, unknown>).hintsUsed).toBeUndefined();
  });

  it("50'den fazla durak detayını reddeder", () => {
    const stopDetails = Object.fromEntries(
      Array.from({ length: 51 }, (_, i) => [`d-${i}`, { hintsUsed: 0, completedAt: 1 }])
    );
    expect(parseLeaderboardEntry({ ...valid, stopDetails })).toBeNull();
  });
});

describe("buildResultCode", () => {
  it("takma adın ilk 3 harfi ve toplam saniyeden oluşur", () => {
    expect(buildResultCode("kartal", 570)).toBe("KAR-0570");
  });

  it("ASCII dışı harfleri X yapar, kısa adları doldurur", () => {
    expect(buildResultCode("Çağ", 5)).toBe("XAX-0005");
    expect(buildResultCode("ab", 12345)).toBe("ABX-12345");
  });
});

describe("mergeLeaderboardEntry", () => {
  const entry = (nickname: string, net: number, penalty = 0): LeaderboardEntry => ({
    nickname, netSeconds: net, penaltySeconds: penalty, hintsUsed: 0, completedAt: 1,
  });

  it("toplam süreye (net + ceza) göre sıralar", () => {
    const board = mergeLeaderboardEntry([entry("a1", 100, 60), entry("b1", 150)], entry("c1", 120));
    expect(board.map((e) => e.nickname)).toEqual(["c1", "b1", "a1"]);
  });

  it("aynı takma adın eski kaydını büyük/küçük harf fark etmeksizin değiştirir", () => {
    const board = mergeLeaderboardEntry([entry("Kartal", 100)], entry("kartal", 300));
    expect(board).toEqual([entry("kartal", 300)]);
  });
});

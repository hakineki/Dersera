import {
  defaultGameStop,
  formatRemaining,
  isGameActive,
  isPublicGame,
  nextClueFor,
  normalizeGameCode,
  parsePublishRequest,
  parseQrParam,
  remainingSeconds,
  toStops,
  QR_COUNT,
  type GameStop,
} from "@/lib/games";
import { HIKAYE, GENEL_HIKAYE } from "@/data/stops";
import { samplePublish } from "./helpers/api";

describe("normalizeGameCode", () => {
  it.each([
    ["MRS-482", "MRS-482"],
    ["mrs-482", "MRS-482"],
    ["mrs482", "MRS-482"],
    ["  MRS 482 ", "MRS-482"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeGameCode(input)).toBe(expected);
  });

  it("Türkçe İ içeren kod geçersizdir (kodlarda I harfi hiç kullanılmaz)", () => {
    expect(normalizeGameCode("abi-123")).toBeNull();
  });

  it.each(["", "MR-482", "MRSS-482", "MRS-48", "123-MRS", "MRS-4822", "M1S-482"])("reddeder: %s", (input) => {
    expect(normalizeGameCode(input)).toBeNull();
  });
});

describe("oyun süresi", () => {
  const game = { expiresAt: 10_000, endedAt: null };

  it("süre dolmadan aktif, dolunca pasif", () => {
    expect(isGameActive(game, 9_999)).toBe(true);
    expect(isGameActive(game, 10_000)).toBe(false);
  });

  it("erken bitirilen oyun süresi olsa da pasif", () => {
    expect(isGameActive({ expiresAt: 10_000, endedAt: 5_000 }, 6_000)).toBe(false);
    expect(remainingSeconds({ expiresAt: 10_000, endedAt: 5_000 }, 6_000)).toBe(0);
  });

  it("kalan süreyi yukarı yuvarlar, negatif vermez", () => {
    expect(remainingSeconds(game, 8_500)).toBe(2);
    expect(remainingSeconds(game, 20_000)).toBe(0);
  });

  it.each([
    [2843, "47:23"],
    [59, "00:59"],
    [3600, "1:00:00"],
    [7325, "2:02:05"],
  ])("formatRemaining(%i) = %s", (sec, text) => {
    expect(formatRemaining(sec)).toBe(text);
  });
});

describe("duraklar", () => {
  const gameStops: GameStop[] = [
    { qr: 7, name: "Bahçe", emoji: "🌳", dersKey: "matematik", hikaye: "h1" },
    { qr: 2, name: "Kantin", emoji: "🥪", dersKey: "fizik", hikaye: "h2" },
    { qr: 15, name: "Spor Salonu", emoji: "🏀", dersKey: "kimya", hikaye: "h3" },
  ];

  it("QR numarasından durak id'si, sıradan order üretir ve zinciri bağlar", () => {
    const stops = toStops(gameStops);
    expect(stops.map((s) => [s.id, s.order, s.nextStopId])).toEqual([
      ["qr-7", 1, "qr-2"],
      ["qr-2", 2, "qr-15"],
      ["qr-15", 3, null],
    ]);
    expect(stops[1].subject).toBe("Fizik");
    expect(stops[2].hikaye).toBe("h3");
  });

  it("ipucu bir sonraki durağın yerini ve QR numarasını söyler", () => {
    expect(nextClueFor(gameStops, 0)).toContain("Kantin");
    expect(nextClueFor(gameStops, 0)).toContain("2 numaralı");
    expect(nextClueFor(gameStops, 2)).toContain("Tüm durakları tamamladın");
  });

  it("ilk 5 varsayılan durak mevcut şablonlardan, sonrakiler genelden gelir", () => {
    expect(defaultGameStop(0)).toEqual({ qr: 1, name: "Bahçe", emoji: "🌳", dersKey: "matematik", hikaye: HIKAYE.bahce });
    expect(defaultGameStop(2).name).toBe("Laboratuvar");
    expect(defaultGameStop(7)).toMatchObject({ qr: 8, name: "Durak 8", hikaye: GENEL_HIKAYE });
  });
});

describe("parsePublishRequest", () => {
  it("geçerli isteği kabul eder ve metinleri kırpar", () => {
    const body = samplePublish();
    body.stops[0] = { ...body.stops[0], name: "  Bahçe  " };
    const parsed = parsePublishRequest(body);
    expect(parsed?.stops[0].name).toBe("Bahçe");
    expect(parsed?.durationMinutes).toBe(60);
  });

  it("şemada olmayan alanları atar", () => {
    const body = samplePublish({ adminTokenHash: "x", endedAt: 1 });
    (body.stops[0] as unknown as Record<string, unknown>).evil = true;
    const parsed = parsePublishRequest(body);
    expect(parsed).not.toHaveProperty("adminTokenHash");
    expect(parsed?.stops[0]).not.toHaveProperty("evil");
  });

  it("20 durağa kadar izin verir", () => {
    const stops = Array.from({ length: QR_COUNT }, (_, i) => defaultGameStop(i));
    expect(parsePublishRequest(samplePublish({ stops }))?.stops).toHaveLength(20);
  });

  const stop = defaultGameStop(0);
  it.each([
    ["nesne olmayan", "x"],
    ["süre 5 dk altı", samplePublish({ durationMinutes: 4 })],
    ["süre 8 saat üstü", samplePublish({ durationMinutes: 481 })],
    ["ondalıklı süre", samplePublish({ durationMinutes: 30.5 })],
    ["boş ay listesi", samplePublish({ aylar: [] })],
    ["bilinmeyen ay", samplePublish({ aylar: ["haziran"] })],
    ["tekrarlanan ay", samplePublish({ aylar: ["eylul", "eylul"] })],
    ["boş durak listesi", samplePublish({ stops: [] })],
    ["21 durak", samplePublish({ stops: Array.from({ length: 21 }, (_, i) => ({ ...stop, qr: (i % 20) + 1 })) })],
    ["aynı QR iki kez", samplePublish({ stops: [stop, { ...stop }] })],
    ["QR 0", samplePublish({ stops: [{ ...stop, qr: 0 }] })],
    ["QR 21", samplePublish({ stops: [{ ...stop, qr: 21 }] })],
    ["bilinmeyen ders", samplePublish({ stops: [{ ...stop, dersKey: "astroloji" }] })],
    ["prototip dersi", samplePublish({ stops: [{ ...stop, dersKey: "__proto__" }] })],
    ["boş yer adı", samplePublish({ stops: [{ ...stop, name: "   " }] })],
    ["41 karakter yer adı", samplePublish({ stops: [{ ...stop, name: "a".repeat(41) }] })],
    ["uzun hikaye", samplePublish({ stops: [{ ...stop, hikaye: "a".repeat(401) }] })],
  ])("reddeder: %s", (_label, body) => {
    expect(parsePublishRequest(body)).toBeNull();
  });
});

describe("isPublicGame", () => {
  it("bozuk yerel kopyayı tanır", () => {
    expect(isPublicGame({ code: "ABC-123", stops: [], aylar: [], expiresAt: 1, endedAt: null })).toBe(true);
    expect(isPublicGame({ code: "ABC-123" })).toBe(false);
    expect(isPublicGame(null)).toBe(false);
  });
});

describe("parseQrParam", () => {
  it.each([
    ["1", 1],
    ["20", 20],
    ["07", 7],
  ])("%s → %i", (v, n) => expect(parseQrParam(v)).toBe(n));

  it.each([null, "", "0", "21", "abc", "1.5", "-1", "1e1", " 3", "100"])("reddeder: %s", (v) => {
    expect(parseQrParam(v)).toBeNull();
  });
});

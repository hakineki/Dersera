import { createMemoryGamesStore, createRedisGamesStore, GAME_RETENTION_MS } from "@/lib/gamesStore";
import { endGame, generateGameCode, hashToken, publishGame } from "@/lib/gamesService";
import { parsePublishRequest } from "@/lib/games";
import { recordingCommand } from "./helpers/fakeRedis";
import { samplePublish } from "./helpers/api";

const request = parsePublishRequest(samplePublish())!;
const T = Date.now();

describe("generateGameCode", () => {
  it("3 harf + tire + 3 rakam üretir; karışan harfleri kullanmaz", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateGameCode();
      expect(code).toMatch(/^[A-Z]{3}-\d{3}$/);
      expect(code.slice(0, 3)).not.toMatch(/[IOQWX]/);
    }
  });

  it("rakamları sıfırla doldurur", () => {
    expect(generateGameCode(() => 0)).toBe("AAA-000");
  });
});

describe("publishGame", () => {
  it("oyunu kaydeder, yönetici anahtarını yalnızca bir kez döndürür ve özetini saklar", async () => {
    const store = createMemoryGamesStore();
    const res = await publishGame(store, request, T, () => "ABC-123");
    expect(res?.game).toEqual({
      code: "ABC-123",
      stops: request.stops,
      aylar: ["eylul"],
      createdAt: T,
      expiresAt: T + 60 * 60 * 1000,
      endedAt: null,
    });
    expect(res?.game).not.toHaveProperty("adminTokenHash");
    expect(res!.adminToken.length).toBeGreaterThanOrEqual(32);

    const stored = await store.get("ABC-123");
    expect(stored?.adminTokenHash).toBe(await hashToken(res!.adminToken));
    expect(stored?.adminTokenHash).not.toBe(res!.adminToken);
  });

  it("kod çakışırsa yeni kod dener: 10 okul aynı anda çakışmadan yayınlar", async () => {
    const store = createMemoryGamesStore();
    const codes = ["AAA-111", "AAA-111", "BBB-222"];
    const next = () => codes.shift()!;
    const first = await publishGame(store, request, T, next);
    const second = await publishGame(store, request, T, next);
    expect(first?.game.code).toBe("AAA-111");
    expect(second?.game.code).toBe("BBB-222");

    const many = await Promise.all(Array.from({ length: 10 }, () => publishGame(store, request)));
    expect(new Set(many.map((g) => g!.game.code)).size).toBe(10);
  });

  it("her deneme çakışırsa null döner", async () => {
    const store = createMemoryGamesStore();
    await publishGame(store, request, T, () => "AAA-111");
    expect(await publishGame(store, request, T, () => "AAA-111")).toBeNull();
  });
});

describe("endGame", () => {
  it("doğru anahtarla bitirir, yanlış anahtarı reddeder, bilinmeyen kodu bildirir", async () => {
    const store = createMemoryGamesStore();
    const { game, adminToken } = (await publishGame(store, request, T, () => "ABC-123"))!;

    expect(await endGame(store, "ZZZ-999", adminToken, T + 10)).toBe("not-found");
    expect(await endGame(store, game.code, "yanlis-anahtar", T + 10)).toBe("forbidden");
    expect((await store.get(game.code))?.endedAt).toBeNull();

    expect(await endGame(store, game.code, adminToken, T + 10)).toBe("ended");
    expect((await store.get(game.code))?.endedAt).toBe(T + 10);
  });

  it("tekrar bitirmek ilk bitiş zamanını değiştirmez", async () => {
    const store = createMemoryGamesStore();
    const { game, adminToken } = (await publishGame(store, request, T))!;
    await endGame(store, game.code, adminToken, T + 10);
    await endGame(store, game.code, adminToken, T + 99);
    expect((await store.get(game.code))?.endedAt).toBe(T + 10);
  });
});

describe("createMemoryGamesStore", () => {
  it("katılan öğrencileri büyük/küçük harf fark etmeksizin tekil sayar", async () => {
    const store = createMemoryGamesStore();
    await store.addPlayer("ABC-123", "Kartal", 0, 1);
    await store.addPlayer("ABC-123", "kartal", 0, 1);
    await store.addPlayer("ABC-123", "Martı", 0, 1);
    await store.addPlayer("XYZ-999", "Kartal", 0, 1);
    expect(await store.playerCount("ABC-123")).toBe(2);
    expect(await store.playerCount("YOK-000")).toBe(0);
  });

  it("saklama süresi dolan oyunu siler", async () => {
    jest.useFakeTimers({ now: 0, doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    try {
      const store = createMemoryGamesStore();
      const { game } = (await publishGame(store, request, 0))!;
      jest.setSystemTime(game.expiresAt + GAME_RETENTION_MS - 1);
      expect(await store.get(game.code)).not.toBeNull();
      jest.setSystemTime(game.expiresAt + GAME_RETENTION_MS + 1);
      expect(await store.get(game.code)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("createRedisGamesStore", () => {
  const game = {
    code: "ABC-123",
    stops: request.stops,
    aylar: ["eylul"],
    createdAt: 0,
    expiresAt: 3_600_000,
    endedAt: null,
    adminTokenHash: "h",
  };
  const ttl = String(3_600_000 + GAME_RETENTION_MS);

  it("oluştururken SET NX PX kullanır ve çakışmada false döner", async () => {
    const { command, calls } = recordingCommand(() => null);
    expect(await createRedisGamesStore(command).create(game, 0)).toBe(false);
    expect(calls[0]).toEqual(["SET", "dersera:game:ABC-123", JSON.stringify(game), "NX", "PX", ttl]);

    const ok = recordingCommand(() => "OK");
    expect(await createRedisGamesStore(ok.command).create(game, 0)).toBe(true);
  });

  it("okur, günceller ve oyuncuları kümeye ekler", async () => {
    const { command, calls } = recordingCommand((args) =>
      args[0] === "GET" ? JSON.stringify(game) : args[0] === "SCARD" ? 3 : "OK"
    );
    const store = createRedisGamesStore(command);
    expect(await store.get("ABC-123")).toEqual(game);
    await store.put({ ...game, endedAt: 5 }, 0);
    await store.addPlayer("ABC-123", "Kartal", 0, game.expiresAt);
    expect(await store.playerCount("ABC-123")).toBe(3);
    expect(calls.slice(1)).toEqual([
      ["SET", "dersera:game:ABC-123", JSON.stringify({ ...game, endedAt: 5 }), "PX", ttl],
      ["SADD", "dersera:game:ABC-123:players", "kartal"],
      ["PEXPIRE", "dersera:game:ABC-123:players", ttl],
      ["SCARD", "dersera:game:ABC-123:players"],
    ]);
  });

  it("olmayan oyun için null döner", async () => {
    const { command } = recordingCommand(() => null);
    expect(await createRedisGamesStore(command).get("ABC-123")).toBeNull();
  });
});

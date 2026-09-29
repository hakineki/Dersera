import { existsSync } from "fs";
import { join } from "path";
import { NICKNAME_PATTERN, takmaAdHatasi } from "@/lib/results";
import { clearRedisEnv } from "./helpers/fakeRedis";
import { buildApi, jsonRequest, samplePublish } from "./helpers/api";

// Öğrenci takma adı tek yoldan doğrulanır: giriş ekranı katılım ucuyla aynı kuralı kullanır, benzersizlik oyun başına
// katılım ucundadır. Eski genel bellek kaydı (/api/register) kaldırıldı: oyuna bağlı değildi, sunucu yeniden
// başlayınca siliniyor ve başka oyundaki aynı adı engelleyebiliyordu.

describe("takma ad", () => {
  it("giriş ekranı katılım ucunun kuralını uygular", () => {
    for (const ad of ["kartal", "Şahin_42", "ab", "a".repeat(20), "  çınar-7  "]) {
      expect(takmaAdHatasi(ad)).toBeNull();
      expect(NICKNAME_PATTERN.test(ad.trim())).toBe(true);
    }
    expect(takmaAdHatasi("a")).toMatch(/2–20/);
    expect(takmaAdHatasi("a".repeat(21))).toMatch(/2–20/);
    expect(takmaAdHatasi("ali veli")).toMatch(/harf, rakam/);
    expect(takmaAdHatasi("<script>")).toMatch(/harf, rakam/);
    expect(NICKNAME_PATTERN.test("ali veli")).toBe(false);
  });

  it("eski genel takma ad kaydı yok", () => {
    const kok = join(__dirname, "..");
    expect(existsSync(join(kok, "app/api/register/route.ts"))).toBe(false);
    expect(existsSync(join(kok, "lib/nicknames.ts"))).toBe(false);
  });

  it("aynı takma ad farklı oyunlarda kullanılabilir, aynı oyunda ikinci kez alınamaz", async () => {
    clearRedisEnv();
    const api = await buildApi();
    const yayinla = async () => ((await (await api.games.POST(jsonRequest("/api/games", samplePublish()))).json()) as { game: { code: string } }).game.code;
    const katil = (kod: string) => api.join.POST(jsonRequest("/join", { nickname: "kartal" }), api.params(kod));
    const [a, b] = [await yayinla(), await yayinla()];
    expect((await katil(a)).status).toBe(201);
    expect((await katil(b)).status).toBe(201);
    expect((await katil(a)).status).toBe(409);
  });
});

import { readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { clearRedisEnv } from "./helpers/fakeRedis";

// Canlıda Redis yoksa hiçbir kalıcı depo belleğe düşmez: her uç noktası başarı (2xx) vermeden durur.
// Bellek deposu sunucu başına ayrıdır ve yeniden başlayınca silinir; sessizce çalışıyor görünmesi veri kaybıdır.

const KOK = join(__dirname, "..");

function rotalar(dizin: string): string[] {
  return readdirSync(dizin).flatMap((ad) => {
    const yol = join(dizin, ad);
    return statSync(yol).isDirectory() ? rotalar(yol) : ad === "route.ts" ? [yol] : [];
  });
}

// Başarı verebilen uç: çıkış yalnız tarayıcı çerezini siler (oturum silinemezse de çıkış yapılmış olmalı).
const DEPOSUZ = new Set<string>(["POST app/api/auth/cikis/route.ts"]);

// Dinamik parçalar: [code] oyun kodu, diğerleri UUID.
const parametreler = new Proxy({} as Record<string, string>, { get: (_, k) => (k === "code" ? "KRT-423" : k === "stop" ? "1" : "00000000-0000-4000-8000-000000000000") });

let eskiOrtam: string | undefined;
beforeAll(() => {
  clearRedisEnv();
  eskiOrtam = process.env.NODE_ENV;
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterAll(() => {
  (process.env as Record<string, string | undefined>).NODE_ENV = eskiOrtam;
  jest.restoreAllMocks();
});

// Kalıcı depoların hepsi: canlıda Redis yoksa açılmaz (hesap, kredi ve oran sınırı kendi hatalarını verir).
const DEPOLAR: [string, string][] = [
  ["lib/gamesStore", "getGamesStore"],
  ["lib/gorselStore", "getGorselStore"],
  ["lib/istatistikStore", "getIstatistikStore"],
  ["lib/koleksiyonStore", "getKoleksiyonStore"],
  ["lib/libraryStore", "getLibraryStore"],
  ["lib/moderasyonStore", "getModerasyonStore"],
  ["lib/ogrenmeStore", "getOgrenmeStore"],
  ["lib/ogrenmeTakibiStore", "getOgrenmeTakibiStore"],
  ["lib/okulStore", "getOkulStore"],
  ["lib/resultsStore", "getResultsStore"],
  ["lib/toplulukStore", "getToplulukStore"],
  ["lib/yonetici", "getYoneticiStore"],
  ["lib/composer/yzDenetimService", "getYzDenetimStore"],
  ["lib/denetimKaydi", "getDenetimKaydiStore"],
  ["lib/yzMaliyetStore", "getYzMaliyetStore"],
  ["lib/yonetimIslemKaydi", "getYonetimIslemKaydiStore"],
  ["lib/authStore", "getAuthStore"],
  ["lib/krediStore", "getKrediStore"],
];

it.each(DEPOLAR)("%s: canlıda Redis yoksa belleğe düşmez", async (yol, getter) => {
  let mod!: Record<string, unknown>;
  await jest.isolateModulesAsync(async () => {
    mod = await import(join(KOK, yol));
  });
  expect(() => (mod[getter] as () => unknown)()).toThrow(/Redis gerekli/);
});

it("geliştirme ve testte Redis yoksa bellek deposu kullanılır", async () => {
  (process.env as Record<string, string | undefined>).NODE_ENV = "test";
  try {
    let mod!: typeof import("@/lib/gamesStore");
    await jest.isolateModulesAsync(async () => {
      mod = await import("@/lib/gamesStore");
    });
    expect(mod.getGamesStore().persistent).toBe(false);
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  }
});

const hepsi = rotalar(join(KOK, "app/api")).map((y) => relative(KOK, y).replace(/\\/g, "/"));

it("uç nokta listesi boş değil", () => {
  expect(hepsi.length).toBeGreaterThan(40);
});

describe.each(hepsi)("%s", (dosya) => {
  it.each([
    ["oturumsuz", null],
    ["oturumlu", "dersera_oturum=sahte-oturum"],
  ])("canlıda Redis yokken %s istek başarı vermez", async (_ad, cerez) => {
    let mod!: Record<string, unknown>;
    await jest.isolateModulesAsync(async () => {
      mod = await import(join(KOK, dosya));
    });
    const yontemler = ["GET", "POST", "PUT", "PATCH", "DELETE"].filter((m) => typeof mod[m] === "function");
    expect(yontemler.length).toBeGreaterThan(0);
    for (const m of yontemler) {
      const headers: Record<string, string> = { Origin: "http://localhost", "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9" };
      if (cerez) headers.Cookie = cerez;
      if (dosya.includes("yonetim/yedek")) headers.Authorization = "Bearer sahte";
      const req = new Request(`http://localhost/${dosya.replace(/^app\//, "").replace(/\/route\.ts$/, "")}?code=KRT-423`, {
        method: m,
        headers,
        body: m === "GET" || m === "DELETE" ? undefined : JSON.stringify({ nickname: "kartal", kullaniciAdi: "ogretmen1", sifre: "gizli-sifre-1", kosulOnayi: true }),
      });
      let durum: number;
      try {
        const yanit = (await (mod[m] as (r: Request, c: unknown) => Promise<Response>)(req, { params: Promise.resolve(parametreler) })) as Response;
        durum = yanit.status;
      } catch {
        // Yakalanmayan hata: Next.js 500 döner; bu da başarı değildir.
        durum = 500;
      }
      if (DEPOSUZ.has(`${m} ${dosya}`)) continue;
      expect({ istek: `${m} ${dosya}`, basari: durum >= 200 && durum < 300 }).toEqual({ istek: `${m} ${dosya}`, basari: false });
    }
  });
});

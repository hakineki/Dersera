import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";
import { anahtarlariTopla, OKUMA_PARCASI, yedekAnahtari, yedekCoz, yedekIcerigi, yedekSifrele, type YedekIcerigi } from "@/lib/yedek";
import { buildApi, cerezli, hesapAc, jsonRequest } from "./helpers/api";
import { clearRedisEnv, recordingCommand } from "./helpers/fakeRedis";

const env = process.env as Record<string, string | undefined>;
const ortamiKoru = () => {
  const eski = { ...process.env };
  return () => {
    for (const k of Object.keys(process.env)) if (!(k in eski)) delete env[k];
    Object.assign(env, eski);
  };
};

describe("kayıt: canlıda davet kodu zorunlu", () => {
  let geri: () => void;
  beforeEach(() => {
    geri = ortamiKoru();
    clearRedisEnv();
  });
  afterEach(() => geri());

  it("kural: canlıda kod yoksa kayıt kapalı; kod tanımlıysa yalnız doğru kodla; yerelde açık", async () => {
    const { kayitDurumu, kayitOl } = await import("@/lib/auth");
    const { createMemoryAuthStore } = await import("@/lib/authStore");
    const store = createMemoryAuthStore();
    delete env.KAYIT_DAVET_KODU;
    env.NODE_ENV = "production";
    expect(kayitDurumu()).toBe("kapali");
    expect(await kayitOl(store, "ogrenci1", "gizli-sifre-1", undefined)).toEqual({ ok: false, status: 403, error: "Yeni öğretmen kaydı şu anda kapalı." });
    // Kapalıyken koda bakılmaz (tahminle açılamaz).
    expect(await kayitOl(store, "ogrenci1", "gizli-sifre-1", "herhangi")).toMatchObject({ ok: false, status: 403 });
    env.KAYIT_DAVET_KODU = "okul-2026";
    expect(kayitDurumu()).toBe("davetli");
    expect(await kayitOl(store, "ogrenci1", "gizli-sifre-1", "tahmin")).toEqual({ ok: false, status: 403, error: "Davet kodu geçersiz." });
    expect(await kayitOl(store, "ogretmen1", "gizli-sifre-1", "okul-2026")).toMatchObject({ ok: true });
    delete env.KAYIT_DAVET_KODU;
    env.NODE_ENV = "test";
    expect(kayitDurumu()).toBe("acik");
    expect(await kayitOl(store, "yerel1", "gizli-sifre-1", undefined)).toMatchObject({ ok: true });
  });

  it("uç nokta: oturum bilgisi kayıt durumunu bildirir; davetliyken kod ister", async () => {
    env.KAYIT_DAVET_KODU = "okul-2026";
    const api = await buildApi();
    expect(await (await api.ben.GET(new Request("http://localhost/api/auth/ben"))).json()).toMatchObject({ davetGerekli: true, kayitKapali: false });
    expect((await api.kayit.POST(jsonRequest("/api/auth/kayit", { kullaniciAdi: "ogrenci1", sifre: "gizli-sifre-1", davetKodu: "tahmin" }))).status).toBe(403);
    expect((await api.kayit.POST(jsonRequest("/api/auth/kayit", { kullaniciAdi: "ogretmen1", sifre: "gizli-sifre-1", davetKodu: "okul-2026" }))).status).toBe(201);
  });
});

describe("öğretmene açık sayfalar ve topluluk listesi", () => {
  beforeEach(() => clearRedisEnv());
  afterEach(() => {
    jest.resetModules();
    jest.dontMock("next/headers");
  });

  it("topluluk listesi girişsiz 401, öğretmene 200", async () => {
    const api = await buildApi();
    expect((await api.topluluk.GET(new Request("http://localhost/api/topluluk"))).status).toBe(401);
    const c = await hesapAc(api, "ogretmen1");
    expect((await api.topluluk.GET(cerezli(new Request("http://localhost/api/topluluk"), c))).status).toBe(200);
  });

  it("topluluk, inceleme ve QR kütüphanesi sayfaları girişsiz yalnız giriş çağrısı gösterir (içerik gönderilmez)", async () => {
    let belirtec: string | undefined;
    jest.doMock("next/headers", () => ({ cookies: async () => ({ get: () => (belirtec ? { value: belirtec } : undefined) }) }));
    let sayfalar!: { ad: string; fn: () => Promise<{ type: unknown }> }[];
    let OgretmenGerekli!: unknown;
    await jest.isolateModulesAsync(async () => {
      sayfalar = [
        { ad: "library", fn: (await import("@/app/library/page")).default as () => Promise<{ type: unknown }> },
        { ad: "inceleme", fn: (await import("@/app/library/inceleme/page")).default as () => Promise<{ type: unknown }> },
        { ad: "qr", fn: (await import("@/app/qr-kutuphane/page")).default as () => Promise<{ type: unknown }> },
      ];
      OgretmenGerekli = (await import("@/components/OgretmenGerekli")).default;
    });
    for (const s of sayfalar) expect((await s.fn()).type).toBe(OgretmenGerekli);
    // Oturum varsa sayfa içeriği döner. Aynı izole kayıttaki depoda hesap açılır.
    await jest.isolateModulesAsync(async () => {
      const auth = await import("@/lib/auth");
      const authStore = await import("@/lib/authStore");
      const h = await auth.kayitOl(authStore.getAuthStore(), "ogretmen1", "gizli-sifre-1", undefined);
      if (!h.ok) throw new Error(h.error);
      belirtec = await auth.oturumAc(authStore.getAuthStore(), h.value);
      const qr = (await import("@/app/qr-kutuphane/page")).default as () => Promise<{ type: unknown }>;
      const OG = (await import("@/components/OgretmenGerekli")).default;
      expect((await qr()).type).not.toBe(OG);
    });
  });
});

describe("gece yedeği", () => {
  const anahtar = randomBytes(32);

  it("anahtarlar SCAN ile tekilleşir; değerler parçalı betikle okunur; arada silinen anahtar atlanır", async () => {
    const tumu = Array.from({ length: 23 }, (_, i) => `dersera:k${String(i).padStart(2, "0")}`);
    const { command, calls } = recordingCommand((a) => {
      if (a[0] === "SCAN") return a[1] === "0" ? ["7", tumu.slice(0, 15)] : ["0", [...tumu.slice(10), "dersera:k00"]];
      if (a[0] === "EVAL") {
        const n = Number(a[2]);
        return a.slice(3, 3 + n).map((k) => (k === "dersera:k05" ? ["none", -2, ""] : k === "dersera:k06" ? ["hash", -1, ["a", "1", "b", "2"]] : ["string", k === "dersera:k07" ? 5000 : -1, `deger-${k}`]));
      }
      return "OK";
    });
    expect(await anahtarlariTopla(command)).toEqual(tumu);
    const icerik = await yedekIcerigi(command, 123);
    const evaller = calls.filter((c) => c[0] === "EVAL");
    expect(evaller.map((c) => Number(c[2]))).toEqual([OKUMA_PARCASI, OKUMA_PARCASI, 3]);
    expect(evaller.every((c) => c[1].includes("redis.call('TYPE', k)"))).toBe(true);
    expect(icerik.kayitlar).toHaveLength(22);
    expect(icerik.kayitlar.find((k) => k.k === "dersera:k06")).toEqual({ k: "dersera:k06", t: "hash", pttl: -1, v: ["a", "1", "b", "2"] });
    expect(icerik.kayitlar.find((k) => k.k === "dersera:k07")?.pttl).toBe(5000);
    expect(icerik.kayitlar.some((k) => k.k === "dersera:k05")).toBe(false);
    // Yalnız okuma: yazma ya da silme komutu yok.
    expect(calls.every((c) => c[0] === "SCAN" || c[0] === "EVAL")).toBe(true);
  });

  it("şifreli dosya yalnız doğru anahtarla açılır; bozulan dosya reddedilir; anahtar 32 bayt olmalı", () => {
    const icerik: YedekIcerigi = { bicim: "DRSY1", tarih: 1, kayitlar: [{ k: "dersera:x", t: "string", pttl: -1, v: "gizli öğretmen verisi" }] };
    const dosya = yedekSifrele(icerik, anahtar);
    expect(dosya.subarray(0, 5).toString()).toBe("DRSY1");
    expect(dosya.includes(Buffer.from("gizli"))).toBe(false);
    expect(yedekCoz(dosya, anahtar)).toEqual(icerik);
    expect(() => yedekCoz(dosya, randomBytes(32))).toThrow();
    const bozuk = Buffer.from(dosya);
    bozuk[bozuk.length - 1] ^= 1;
    expect(() => yedekCoz(bozuk, anahtar)).toThrow();
    const geri = ortamiKoru();
    env.YEDEK_ANAHTARI = anahtar.toString("base64");
    expect(yedekAnahtari()?.equals(anahtar)).toBe(true);
    env.YEDEK_ANAHTARI = randomBytes(16).toString("base64");
    expect(yedekAnahtari()).toBeNull();
    delete env.YEDEK_ANAHTARI;
    expect(yedekAnahtari()).toBeNull();
    geri();
  });

  it("geri yükleme betiği aynı biçimi çözer; varsayılan kuru çalışma hiçbir şey yazmaz", () => {
    const icerik: YedekIcerigi = {
      bicim: "DRSY1",
      tarih: Date.UTC(2026, 8, 25),
      kayitlar: [
        { k: "dersera:a", t: "string", pttl: -1, v: "1" },
        { k: "dersera:b", t: "hash", pttl: -1, v: ["f", "v"] },
        { k: "dersera:c", t: "zset", pttl: 1000, v: ["uye", "3"] },
      ],
    };
    const dizin = mkdtempSync(join(tmpdir(), "dersera-yedek-"));
    const dosya = join(dizin, "yedek.bin");
    writeFileSync(dosya, yedekSifrele(icerik, anahtar));
    const cikti = execFileSync(process.execPath, ["scripts/yedek-geri-yukle.mjs", dosya], {
      env: { PATH: process.env.PATH, NODE_ENV: "test", YEDEK_ANAHTARI: anahtar.toString("base64") },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(JSON.parse(cikti.trim())).toEqual({ tarih: "2026-09-25T00:00:00.000Z", anahtarSayisi: 3, turler: { string: 1, hash: 1, zset: 1 } });
    expect(() =>
      execFileSync(process.execPath, ["scripts/yedek-geri-yukle.mjs", dosya], { env: { PATH: process.env.PATH, NODE_ENV: "test", YEDEK_ANAHTARI: randomBytes(32).toString("base64") }, stdio: "pipe" })
    ).toThrow();
  });

  it("yedek alma: şifreli dosya yedek/ altına yazılır, 14 günden eskiler silinir; anahtar yoksa alınmaz", async () => {
    const geri = ortamiKoru();
    const now = Date.UTC(2026, 8, 25, 1);
    const put = jest.fn(async (yol: string, veri: Buffer) => ({ url: `https://depo/${yol}`, veri }));
    const del = jest.fn(async () => {});
    const list = jest.fn(async () => ({
      blobs: [
        { url: "https://depo/yedek/eski", uploadedAt: new Date(now - 15 * 24 * 3600_000) },
        { url: "https://depo/yedek/yeni", uploadedAt: new Date(now - 2 * 24 * 3600_000) },
      ],
      hasMore: false,
    }));
    const { command } = recordingCommand((a) => (a[0] === "SCAN" ? ["0", ["dersera:x"]] : a[0] === "EVAL" ? [["string", -1, "v"]] : "OK"));
    let yedekDepo!: typeof import("@/lib/yedekDepo");
    await jest.isolateModulesAsync(async () => {
      jest.doMock("@vercel/blob", () => ({ put, list, del }));
      jest.doMock("@/lib/redis", () => ({ redisFromEnv: () => command }));
      yedekDepo = await import("@/lib/yedekDepo");
    });
    env.BLOB_READ_WRITE_TOKEN = "blob";
    delete env.YEDEK_ANAHTARI;
    await expect(yedekDepo.yedekAl(now)).rejects.toBeInstanceOf(yedekDepo.YedekYapilandirmaHatasi);
    expect(put).not.toHaveBeenCalled();

    env.YEDEK_ANAHTARI = anahtar.toString("base64");
    expect(await yedekDepo.yedekAl(now)).toMatchObject({ anahtarSayisi: 1, silinen: 1 });
    const [yol, veri] = put.mock.calls[0] as unknown as [string, Buffer];
    expect(yol).toBe("yedek/dersera-2026-09-25-01-00.bin");
    expect(yedekCoz(veri, anahtar).kayitlar).toEqual([{ k: "dersera:x", t: "string", pttl: -1, v: "v" }]);
    expect(del).toHaveBeenCalledWith(["https://depo/yedek/eski"]);
    geri();
    jest.dontMock("@vercel/blob");
    jest.dontMock("@/lib/redis");
  });

  it("yedek uç noktası: zamanlayıcı yalnız CRON_SECRET ile, elle yalnız platform yöneticisi", async () => {
    const geri = ortamiKoru();
    clearRedisEnv();
    const yedekAl = jest.fn(async () => ({ anahtarSayisi: 3, bayt: 99, silinen: 0 }));
    let route!: typeof import("@/app/api/yonetim/yedek/route");
    env.DERSERA_YONETICILER = "platform1";
    await jest.isolateModulesAsync(async () => {
      jest.doMock("@/lib/yedekDepo", () => ({ yedekAl, YedekYapilandirmaHatasi: class extends Error {} }));
      route = await import("@/app/api/yonetim/yedek/route");
    });
    const istek = (h: Record<string, string> = {}) => new Request("http://localhost/api/yonetim/yedek", { headers: h });
    delete env.CRON_SECRET;
    expect((await route.GET(istek({ authorization: "Bearer " }))).status).toBe(401);
    env.CRON_SECRET = "gizli-cron";
    expect((await route.GET(istek())).status).toBe(401);
    expect((await route.GET(istek({ authorization: "Bearer yanlis" }))).status).toBe(401);
    const r = await route.GET(istek({ authorization: "Bearer gizli-cron" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ anahtarSayisi: 3, bayt: 99, silinen: 0 });
    expect(yedekAl).toHaveBeenCalledTimes(1);
    // Elle: oturumsuz 401.
    expect((await route.POST(new Request("http://localhost/api/yonetim/yedek", { method: "POST" }))).status).toBe(401);
    jest.dontMock("@/lib/yedekDepo");
    geri();
  });
});

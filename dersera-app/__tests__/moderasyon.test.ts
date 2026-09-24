import { getUniteler } from "@/data/mufredat/programlar";
import type { GameDefinition } from "@/lib/composer/definition";
import { validationContext } from "@/lib/composer/service";
import { validateGame } from "@/lib/composer/validator";
import { yonetisimDegerlendir } from "@/lib/composer/yonetisim";
import { moderasyonGerekli } from "@/lib/moderasyon";
import { moderasyonaEkle } from "@/lib/moderasyonService";
import { createMemoryModerasyonStore } from "@/lib/moderasyonStore";
import { createMemoryYoneticiStore, yoneticiMi } from "@/lib/yonetici";
import { buildApi, cerezli, hesapAc, jsonRequest } from "./helpers/api";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";
import { clearRedisEnv } from "./helpers/fakeRedis";

const girdi = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const dersler = [{ ders: "fizik", konuId: getUniteler(10, "fizik")[0].id }];
const oyun = (degistir?: (d: GameDefinition) => void) => {
  const d = makeDefinition(girdi, 7);
  degistir?.(d);
  return d;
};
const KUMAR = (d: GameDefinition) => (d.duraklar[2].hikaye_metni = "Kumar masasına otur.");
const KUFUR = (d: GameDefinition) => (d.duraklar[2].hikaye_metni = "Siktir git dedi.");
const degerlendir = (d: GameDefinition) => yonetisimDegerlendir(d, validateGame(d, validationContext(girdi)));
const hesap = (id: string, kullaniciAdi: string) => ({ id, kullaniciAdi, sifreOzeti: "", surum: 1, olusturma: 1 });

afterEach(() => delete process.env.DERSERA_YONETICILER);

describe("yönetici rolü", () => {
  it("yalnız listedeki ad; ad ilk girişte hesaba bağlanır, sonra adı alan başka hesap yönetici olamaz", async () => {
    const s = createMemoryYoneticiStore();
    expect(await yoneticiMi(hesap("h1", "hakan"), s)).toBe(false);
    process.env.DERSERA_YONETICILER = " Hakan , ayse,";
    expect(await yoneticiMi(null, s)).toBe(false);
    expect(await yoneticiMi(hesap("h9", "baskasi"), s)).toBe(false);
    expect(await yoneticiMi(hesap("h1", "hakan"), s)).toBe(true);
    // Yönetici adını değiştirdi, ad boşa çıktı ve başka hesap aldı.
    expect(await yoneticiMi(hesap("h2", "hakan"), s)).toBe(false);
    expect(await yoneticiMi(hesap("h1", "hakan"), s)).toBe(true);
    expect(await yoneticiMi(hesap("h3", "ayse"), s)).toBe(true);
  });
});

describe("kuyruğa giriş kuralı", () => {
  it("yalnız içerik kapıları (çocuk güvenliği, benzerlik) kuyruğa sokar; pedagojik uyarı sokmaz", () => {
    expect(moderasyonGerekli(degerlendir(oyun()))).toBe(false);
    // Aynı soru iki durakta: öğrenme kalitesi uyarısı.
    const pedagojik = oyun((d) => (d.duraklar[1].gorev.soru = d.duraklar[0].gorev.soru));
    expect(degerlendir(pedagojik).karar).not.toBe("PASS");
    expect(moderasyonGerekli(degerlendir(pedagojik))).toBe(false);
    expect(moderasyonGerekli(degerlendir(oyun(KUMAR)))).toBe(true);
    const benzer = yonetisimDegerlendir(oyun(), validateGame(oyun(), validationContext(girdi)), undefined, [{ id: "x", baslik: null, oran: 0.5 }]);
    expect(moderasyonGerekli(benzer)).toBe(true);
  });

  it("tekillik: aynı sınıf oyunu bir kez; engellenen aynı içerik bir kez; IP sınırı", async () => {
    const store = createMemoryModerasyonStore();
    const d = oyun(KUMAR);
    const y = degerlendir(d);
    expect(await moderasyonaEkle({ tur: "sinif-yayini", yonetisim: y, definition: d, kod: "AAA-111", sahip: null }, store)).toBe(true);
    expect(await moderasyonaEkle({ tur: "sinif-yayini", yonetisim: y, definition: d, kod: "AAA-111", sahip: null }, store)).toBe(false);
    expect(await moderasyonaEkle({ tur: "sinif-yayini", yonetisim: y, definition: d, kod: "BBB-222", sahip: null }, store)).toBe(true);
    const k = oyun(KUFUR);
    expect(await moderasyonaEkle({ tur: "engellenen", yonetisim: degerlendir(k), definition: k, sahip: null }, store)).toBe(true);
    expect(await moderasyonaEkle({ tur: "engellenen", yonetisim: degerlendir(oyun(KUFUR)), definition: oyun(KUFUR), sahip: null }, store)).toBe(false);
    // Aynı IP'den saatte en çok 20 kayıt.
    let yazilan = 0;
    for (let i = 0; i < 25; i++) {
      const x = oyun((z) => (z.duraklar[2].hikaye_metni = `Kumar masasına otur ${i}.`));
      if (await moderasyonaEkle({ tur: "engellenen", yonetisim: degerlendir(x), definition: x, sahip: null, ip: "9.9.9.9" }, store)) yazilan++;
    }
    expect(yazilan).toBe(20);
    expect((await store.liste("bekliyor", 100)).length).toBe(3 + 20);
  });

  it("depo hatası yayını durdurmaz (false döner)", async () => {
    const store = { ...createMemoryModerasyonStore(), ekle: jest.fn().mockRejectedValue(new Error("redis")) };
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(await moderasyonaEkle({ tur: "engellenen", yonetisim: degerlendir(oyun(KUFUR)), definition: oyun(KUFUR), sahip: null }, store)).toBe(false);
    errSpy.mockRestore();
  });
});

describe("yayın kancaları ve yönetici uç noktaları", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  let yonetici: string;
  let ogretmen: string;
  beforeEach(async () => {
    clearRedisEnv();
    process.env.DERSERA_YONETICILER = "yonetici1";
    api = await buildApi();
    yonetici = await hesapAc(api, "yonetici1");
    ogretmen = await hesapAc(api, "ogretmen1");
  });

  const yayinla = (d: GameDefinition, ip = "1.2.3.4") => {
    const req = jsonRequest("/api/games", { composer: { definition: d, dersler } });
    req.headers.set("x-forwarded-for", ip);
    return api.games.POST(req);
  };
  const liste = async (c: string | null, durum = "bekliyor") => api.moderasyon.GET(cerezli(new Request(`http://localhost/api/moderasyon?durum=${durum}`), c));
  const kayitlar = async (durum = "bekliyor") => (await (await liste(yonetici, durum)).json()).kayitlar as { id: string; tur: string; kod?: string; bulgular: { kapi: string }[] }[];
  const karar = (id: string, body: unknown, c: string | null = yonetici) => api.moderasyonOge.POST(cerezli(jsonRequest(`/api/moderasyon/${id}`, body), c), api.idParams(id));
  const ben = async (c: string) => (await (await api.ben.GET(cerezli(new Request("http://localhost/api/auth/ben"), c))).json()).yonetici;

  it("yetki: oturumsuz 401, öğretmen 403, yönetici 200; ben yanıtı yönetici bilgisini taşır", async () => {
    expect((await liste(null)).status).toBe(401);
    expect((await liste(ogretmen)).status).toBe(403);
    expect((await liste(yonetici)).status).toBe(200);
    expect(await ben(ogretmen)).toBe(false);
    expect(await ben(yonetici)).toBe(true);
    expect((await karar("00000000-0000-0000-0000-000000000000", { karar: "temiz" }, ogretmen)).status).toBe(403);
  });

  it("uyarıyla yayınlanan sınıf oyunu kuyruğa girer; kaldır oyunu bitirir; ikinci karar 409", async () => {
    const res = await yayinla(oyun(KUMAR));
    expect(res.status).toBe(201);
    const kod = (await res.json()).game.code as string;
    const [k] = await kayitlar();
    expect(k).toMatchObject({ tur: "sinif-yayini", kod });
    expect(k.bulgular[0].kapi).toBe("cocuk-guvenligi");
    const detay = await (await api.moderasyonOge.GET(cerezli(new Request(`http://localhost/api/moderasyon/${k.id}`), yonetici), api.idParams(k.id))).json();
    expect(detay.kayit.definition.duraklar[2].hikaye_metni).toBe("Kumar masasına otur.");
    // Liste tanımı taşımaz.
    expect("definition" in k).toBe(false);

    expect((await karar(k.id, { karar: "sil" })).status).toBe(422);
    const r = await karar(k.id, { karar: "kaldir", not: "Kumar teması uygun değil." });
    expect(r.status).toBe(200);
    expect((await r.json()).kayit).toMatchObject({ durum: "kapatildi", sonuc: { karar: "kaldir", yonetici: "yonetici1", not: "Kumar teması uygun değil." } });
    expect((await (await api.game.GET(new Request("http://localhost"), api.params(kod))).json()).active).toBe(false);
    expect((await karar(k.id, { karar: "temiz" })).status).toBe(409);
    expect(await kayitlar()).toEqual([]);
    expect((await kayitlar("kapatildi")).map((x) => x.id)).toEqual([k.id]);
  });

  it("temiz kararı oyuna dokunmaz", async () => {
    const kod = (await (await yayinla(oyun(KUMAR))).json()).game.code as string;
    const [k] = await kayitlar();
    expect((await karar(k.id, { karar: "temiz" })).status).toBe(200);
    expect((await (await api.game.GET(new Request("http://localhost"), api.params(kod))).json()).active).toBe(true);
  });

  it("engellenen yayın kuyruğa bir kez girer, kaldırılamaz; temiz ve pedagojik yayın girmez", async () => {
    expect((await yayinla(oyun(KUFUR))).status).toBe(422);
    expect((await yayinla(oyun(KUFUR))).status).toBe(422);
    expect((await yayinla(oyun())).status).toBe(201);
    const k = await kayitlar();
    expect(k.map((x) => x.tur)).toEqual(["engellenen"]);
    expect((await karar(k[0].id, { karar: "kaldir" })).status).toBe(422);
  });

  it("klasik oyunda engellenen durak metni de kuyruğa girer", async () => {
    const { samplePublish } = await import("./helpers/api");
    const body = samplePublish();
    (body.stops as { hikaye: string }[])[0].hikaye = "Siktir git dedi.";
    expect((await api.games.POST(jsonRequest("/api/games", body))).status).toBe(422);
    expect((await kayitlar()).map((x) => x.tur)).toEqual(["engellenen"]);
  });

  it("kütüphaneden uyarıyla yeniden yayın kuyruğa girer (sahibiyle)", async () => {
    const id = (await (await api.library.POST(cerezli(jsonRequest("/api/library", { definition: oyun(KUMAR), dersler }), ogretmen))).json()).id as string;
    const res = await api.libraryPublish.POST(cerezli(jsonRequest(`/api/library/${id}/publish`, {}), ogretmen), api.idParams(id));
    expect(res.status).toBe(201);
    const [k] = await kayitlar();
    expect(k).toMatchObject({ tur: "sinif-yayini", kod: (await res.json()).game.code });
  });
});

describe("karar tutarlılığı ve kuyruk sınırı (inceleme bulguları)", () => {
  const girdiOf = (i: number) => {
    const d = oyun((z) => (z.duraklar[2].hikaye_metni = `Kumar masasına otur ${i}.`));
    return { tur: "sinif-yayini" as const, yonetisim: degerlendir(d), definition: d, kod: `K${i}`, sahip: null };
  };
  const oyunlar = () => {
    const bitenler: string[] = [];
    const games = {
      get: async (kod: string) => ({ code: kod, endedAt: null }),
      put: async (g: { code: string }) => void bitenler.push(g.code),
    } as never;
    return { games, bitenler, topluluk: {} as never };
  };

  it("çelişen eşzamanlı kararlar (kaldır + temiz): yalnız biri kazanır, kayıttaki sonuç ile yapılan eylem aynı", async () => {
    const { moderasyonKarari } = await import("@/lib/moderasyonService");
    for (let tur = 0; tur < 20; tur++) {
      const store = createMemoryModerasyonStore();
      await moderasyonaEkle(girdiOf(tur), store);
      const [k] = await store.liste("bekliyor", 10);
      const { games, bitenler, topluluk } = oyunlar();
      const sonuclar = await Promise.all(
        (tur % 2 ? (["kaldir", "temiz"] as const) : (["temiz", "kaldir"] as const)).map((karar) => moderasyonKarari(k.id, karar, "", "y", { store, games, topluluk }))
      );
      expect(sonuclar.filter((r) => r.ok)).toHaveLength(1);
      const son = await store.get(k.id);
      expect(son?.durum).toBe("kapatildi");
      expect(bitenler.length).toBe(son?.sonuc?.karar === "kaldir" ? 1 : 0);
    }
  });

  it("eylem başarısızsa kilit bırakılır; kayıt yeniden karar bekler ve tekrar denenebilir", async () => {
    const { moderasyonKarari } = await import("@/lib/moderasyonService");
    const store = createMemoryModerasyonStore();
    await moderasyonaEkle(girdiOf(1), store);
    const [k] = await store.liste("bekliyor", 10);
    const bozuk = { get: async () => ({ code: "K1", endedAt: null }), put: async () => Promise.reject(new Error("redis")) } as never;
    await expect(moderasyonKarari(k.id, "kaldir", "", "y", { store, games: bozuk, topluluk: {} as never })).rejects.toThrow("redis");
    expect((await store.get(k.id))?.durum).toBe("bekliyor");
    const { games, bitenler } = oyunlar();
    expect((await moderasyonKarari(k.id, "kaldir", "", "y", { store, games, topluluk: {} as never })).ok).toBe(true);
    expect(bitenler).toEqual(["K1"]);
  });

  it("sınırdan düşen kaydın tekilliği bırakılır: aynı oyun yeniden kuyruğa girebilir", async () => {
    const { MODERASYON } = await import("@/lib/moderasyon");
    const store = createMemoryModerasyonStore();
    for (let i = 0; i <= MODERASYON.enCokKayit; i++) await moderasyonaEkle({ ...girdiOf(i), now: i + 1 }, store);
    expect((await store.liste("bekliyor", 1_000)).length).toBe(MODERASYON.enCokKayit);
    // En eski (K0) düştü; aynı kod yeniden gelirse kuyruğa girer.
    expect(await moderasyonaEkle({ ...girdiOf(0), now: 10_000 }, store)).toBe(true);
  });

  it("IP sınırı yalnız engellenen kayıtlara: aynı IP'den uyarılı yayınlar sınırsız kuyruğa girer", async () => {
    const store = createMemoryModerasyonStore();
    let yazilan = 0;
    for (let i = 0; i < 25; i++) if (await moderasyonaEkle({ ...girdiOf(i), ip: "7.7.7.7" }, store)) yazilan++;
    expect(yazilan).toBe(25);
  });
});

describe("Redis moderasyon deposu: yarım yazımlar", () => {
  it("kilit varsa kayıt kapatılmış okunur; tekillik alınamazsa kayıt geri alınır; düşen kaydın tekilliği silinir", async () => {
    const { createRedisModerasyonStore } = await import("@/lib/moderasyonStore");
    const { recordingCommand } = await import("./helpers/fakeRedis");
    const kayit = { id: "i1", tur: "engellenen", tarih: 1, karar: "BLOCK", baslik: "B", sinif: 10, ders: "Fizik", sahip: null, bulgular: [], durum: "bekliyor", tekil: "engellenen:x" };
    const sonuc = { karar: "temiz", not: "", yonetici: "y", tarih: 2 };
    let tekilVar = false;
    const { command, calls } = recordingCommand((a) => {
      if (a[0] === "MGET") return a[1].includes(":karar:") ? [JSON.stringify(sonuc)] : [JSON.stringify(kayit)];
      if (a[0] === "SET" && a[1].includes(":tekil:")) return tekilVar ? null : "OK";
      if (a[0] === "ZRANGE") return ["eski1"];
      return "OK";
    });
    const store = createRedisModerasyonStore(command);
    const okunan = await store.get("i1");
    expect(okunan).toMatchObject({ durum: "kapatildi", sonuc });
    expect(okunan && "tekil" in okunan).toBe(false);

    tekilVar = true;
    expect(await store.ekle({ ...kayit, id: "i2" } as never, "engellenen:x")).toBe(false);
    expect(calls.at(-1)).toEqual(["DEL", "dersera:moderasyon:kayit:i2"]);

    tekilVar = false;
    calls.length = 0;
    expect(await store.ekle({ ...kayit, id: "i3" } as never, "engellenen:y")).toBe(true);
    expect(calls).toContainEqual(["ZREM", "dersera:moderasyon:bekleyen", "eski1"]);
    expect(calls).toContainEqual(["DEL", "dersera:moderasyon:kayit:eski1", "dersera:moderasyon:tekil:engellenen:x"]);
  });
});

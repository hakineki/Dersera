import { getUniteler } from "@/data/mufredat/programlar";
import type { ResolvedInput } from "@/lib/composer/input";
import { ayOf, KREDI_KURALLARI, olusturmaMaliyeti } from "@/lib/kredi";
import { askiDegeri, createMemoryKrediStore, createRedisKrediStore, HAREKET_SAKLAMA } from "@/lib/krediStore";
import { clearRedisEnv, recordingCommand } from "./helpers/fakeRedis";
import { jsonRequest } from "./helpers/api";
import { makeDefinition, toModelOutput } from "./helpers/composerFixtures";

describe("kredi kuralları", () => {
  it("oluşturma maliyeti 20/40/60 dk = 2/3/4; aylık hak 30", () => {
    expect([20, 40, 60].map((s) => olusturmaMaliyeti(s as 20 | 40 | 60))).toEqual([2, 3, 4]);
    expect(KREDI_KURALLARI.aylikHak).toBe(30);
    expect(KREDI_KURALLARI.guncelleme).toBe(1);
  });

  it("ay Türkiye saatine göre: UTC 30 Eylül 21:30 İstanbul'da Ekim'dir", () => {
    expect(ayOf(Date.UTC(2026, 8, 30, 20, 59))).toBe("2026-09");
    expect(ayOf(Date.UTC(2026, 8, 30, 21, 30))).toBe("2026-10");
  });
});

describe("bellek kredi deposu", () => {
  it("önce aylık haktan, sonra kazanılandan düşer ve askıya yazar; yetmezse hiçbir şey yazılmaz", async () => {
    const s = createMemoryKrediStore();
    await s.odul("h", 5, 1, "ödül");
    expect(await s.harca("h", "2026-09", 30, 28, 2, "a", 1000, "x1")).toEqual({ ok: true, aylik: 28, kazanilan: 0 });
    expect(await s.harca("h", "2026-09", 30, 4, 3, "b", 1000, "x2")).toEqual({ ok: true, aylik: 2, kazanilan: 2 });
    expect(await s.harca("h", "2026-09", 30, 4, 4, "c", 1000, "x3")).toEqual({ ok: false, aylikKalan: 0, kazanilan: 3 });
    const k = await s.oku("h", "2026-09", 10);
    expect(k).toMatchObject({ kullanilan: 30, kazanilan: 3 });
    expect(k.hareketler.map((h) => [h.tur, h.miktar, h.aylik, h.kazanilan])).toEqual([
      ["harcama", -4, 2, 2],
      ["harcama", -28, 28, 0],
      ["odul", 5, 0, 5],
    ]);
    expect((await s.askidakiler("h")).map((a) => [a.id, a.ham])).toEqual([["x1", askiDegeri("2026-09", 28, 0, 2)], ["x2", askiDegeri("2026-09", 2, 2, 3)]]);
    // Yeni ay: aylık hak yenilenir, kazanılan kalır.
    expect((await s.oku("h", "2026-10", 1)).kullanilan).toBe(0);
  });

  it("iade askıdaki kaydı sahiplenir: aynı paylarla bir kez; tamamlanan harcama iade edilemez", async () => {
    const s = createMemoryKrediStore();
    await s.odul("h", 3, 1, "ödül");
    await s.harca("h", "2026-09", 30, 29, 2, "a", 1000, "x1");
    expect(await s.harca("h", "2026-09", 30, 3, 3, "b", 1000, "x2")).toEqual({ ok: true, aylik: 1, kazanilan: 2 });
    const [x1, x2] = await s.askidakiler("h");
    expect(await s.tamamla("h", "x1")).toBe(true);
    expect(await s.iade("h", x1, 4, "iade", 1000)).toBe(false);
    expect(await s.iade("h", x2, 4, "iade", 1000)).toBe(true);
    expect(await s.iade("h", x2, 5, "iade", 1000)).toBe(false);
    expect(await s.oku("h", "2026-09", 1)).toMatchObject({ kullanilan: 29, kazanilan: 3, hareketler: [{ tur: "iade", miktar: 3, aylik: 1, kazanilan: 2 }] });
    expect(await s.askidakiler("h")).toEqual([]);
  });

  it(`hareket kaydı en çok ${HAREKET_SAKLAMA} satır tutar`, async () => {
    const s = createMemoryKrediStore();
    for (let i = 0; i < HAREKET_SAKLAMA + 5; i++) await s.odul("h", 1, i, `ödül ${i}`);
    const k = await s.oku("h", "2026-09", 1000);
    expect(k.hareketler).toHaveLength(HAREKET_SAKLAMA);
    expect(k.hareketler[0].aciklama).toBe(`ödül ${HAREKET_SAKLAMA + 4}`);
  });
});

describe("Redis kredi deposu", () => {
  it("harcama, iade, tamamlama ve ödül çağrı biçimleri; açıklama JSON olarak kaçırılır; askı değeri ayrıştırılır", async () => {
    let yanit: unknown = [1, 3, 0];
    const { command, calls } = recordingCommand((a) =>
      a[0] === "EVAL" ? yanit : a[0] === "MGET" ? ["7", "2"] : a[0] === "HGETALL" ? ["x1", "2026-09|3|0|99", "bozuk", "??"] : a[0] === "HDEL" ? 1 : a[0] === "LRANGE" ? ['{"tur":"odul","miktar":2,"aylik":0,"kazanilan":2,"tarih":1,"aciklama":"x"}'] : "OK"
    );
    const s = createRedisKrediStore(command);
    expect(await s.harca("h1", "2026-09", 30, 3, 99, 'Oyun "40" dk', 5000, "x1")).toEqual({ ok: true, aylik: 3, kazanilan: 0 });
    expect(calls[0][1]).toContain("HSET', KEYS[4]");
    expect(calls[0].slice(2)).toEqual([
      "4", "dersera:kredi:h1:aylik:2026-09", "dersera:kredi:h1:kazanilan", "dersera:kredi:h1:hareketler", "dersera:kredi:h1:aski",
      "30", "3", "5000", "99", '"Oyun \\"40\\" dk"', "x1", "2026-09",
    ]);
    yanit = [0, 1, 0];
    expect(await s.harca("h1", "2026-09", 30, 3, 99, "x", 5000, "x9")).toEqual({ ok: false, aylikKalan: 1, kazanilan: 0 });
    const aski = await s.askidakiler("h1");
    expect(aski).toEqual([{ id: "x1", ay: "2026-09", aylik: 3, kazanilan: 0, tarih: 99, ham: "2026-09|3|0|99" }]);
    yanit = 1;
    expect(await s.iade("h1", aski[0], 100, "iade", 5000)).toBe(true);
    expect(calls.at(-1)!.slice(2)).toEqual([
      "4", "dersera:kredi:h1:aylik:2026-09", "dersera:kredi:h1:kazanilan", "dersera:kredi:h1:hareketler", "dersera:kredi:h1:aski",
      "x1", "2026-09|3|0|99", "3", "0", "100", '"iade"', "5000",
    ]);
    expect(await s.tamamla("h1", "x1")).toBe(true);
    expect(calls.at(-1)).toEqual(["HDEL", "dersera:kredi:h1:aski", "x1"]);
    await s.odul("h1", 5, 101, "ödül");
    expect(calls.at(-1)![1]).toContain("INCRBY', KEYS[2]");
    expect(calls.at(-1)!.slice(2)).toEqual(["3", "-", "dersera:kredi:h1:kazanilan", "dersera:kredi:h1:hareketler", "5", "101", '"ödül"']);
    expect(await s.oku("h1", "2026-09", 10)).toEqual({ kullanilan: 7, kazanilan: 2, hareketler: [{ tur: "odul", miktar: 2, aylik: 0, kazanilan: 2, tarih: 1, aciklama: "x" }] });
  });
});

describe("askıdaki harcamaların kapatılması", () => {
  let servis: typeof import("@/lib/krediService");
  let depo: typeof import("@/lib/krediStore");
  beforeEach(async () => {
    clearRedisEnv();
    await jest.isolateModulesAsync(async () => {
      servis = await import("@/lib/krediService");
      depo = await import("@/lib/krediStore");
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it("işlev kesilirse (ne tamamlama ne iade): süre sonunda bir sonraki kredi işleminde kendiliğinden iade edilir, bir kez", async () => {
    const t0 = Date.UTC(2026, 8, 10, 9);
    expect(await servis.krediHarca("h", 3, "Oyun oluşturma (40 dk)", t0)).not.toBeNull();
    expect((await servis.krediDurumu("h", t0 + 60_000)).toplam).toBe(27);
    const sonra = t0 + servis.ASKI_SURESI_MS + 1000;
    expect((await servis.krediDurumu("h", sonra)).toplam).toBe(30);
    const d = await servis.krediDurumu("h", sonra + 1000);
    expect(d.toplam).toBe(30);
    expect(d.hareketler.map((h) => h.tur)).toEqual(["iade", "harcama"]);
  });

  it("tamamlanan harcama süre geçse de iade edilmez", async () => {
    const t0 = Date.UTC(2026, 8, 10, 9);
    const h = (await servis.krediHarca("h", 3, "x", t0))!;
    await servis.krediTamamla("h", h);
    expect((await servis.krediDurumu("h", t0 + servis.ASKI_SURESI_MS * 2)).toplam).toBe(27);
  });

  it("iade yazılamazsa false döner ve kredi askıda kalır; süre sonunda kendiliğinden iade edilir", async () => {
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    const t0 = Date.UTC(2026, 8, 10, 9);
    const h = (await servis.krediHarca("h", 4, "x", t0))!;
    const store = depo.getKrediStore();
    const iade = jest.spyOn(store, "iade").mockRejectedValue(new Error("redis kapalı"));
    expect(await servis.krediIade("h", h, "iade", t0 + 1000, 3)).toBe(false);
    expect(iade).toHaveBeenCalledTimes(3);
    iade.mockRestore();
    expect((await servis.krediDurumu("h", t0 + 2000)).toplam).toBe(26);
    expect((await servis.krediDurumu("h", t0 + servis.ASKI_SURESI_MS + 1000)).toplam).toBe(30);
    err.mockRestore();
  });

  it("ay değişiminde iade harcamanın düştüğü aya yapılır", async () => {
    const eylulSonu = Date.UTC(2026, 8, 30, 20, 58);
    const h = (await servis.krediHarca("h", 3, "x", eylulSonu))!;
    expect(h.ay).toBe("2026-09");
    await servis.krediIade("h", h, "iade", eylulSonu + 5 * 60_000);
    expect((await depo.getKrediStore().oku("h", "2026-09", 1)).kullanilan).toBe(0);
    expect((await servis.krediDurumu("h", eylulSonu + 5 * 60_000)).toplam).toBe(30);
  });
});

describe("oluşturmada kredi", () => {
  type ComposeRoute = typeof import("@/app/api/compose/route");
  let route: ComposeRoute;
  let anthropic: typeof import("@/lib/composer/anthropic");
  let krediRoute: typeof import("@/app/api/kredi/route");
  let krediStore: typeof import("@/lib/krediStore");
  let rateLimit: typeof import("@/lib/composer/rateLimit");
  let cerez = "";
  let hesapId = "";
  const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  afterAll(() => errSpy.mockRestore());

  beforeEach(async () => {
    clearRedisEnv();
    process.env.ANTHROPIC_API_KEY = "test-key";
    let auth!: typeof import("@/lib/auth");
    let authStore!: typeof import("@/lib/authStore");
    await jest.isolateModulesAsync(async () => {
      anthropic = await import("@/lib/composer/anthropic");
      route = await import("@/app/api/compose/route");
      krediRoute = await import("@/app/api/kredi/route");
      krediStore = await import("@/lib/krediStore");
      rateLimit = await import("@/lib/composer/rateLimit");
      auth = await import("@/lib/auth");
      authStore = await import("@/lib/authStore");
    });
    const store = authStore.getAuthStore();
    const h = await auth.kayitOl(store, "ogretmen1", "gizli-sifre-1", undefined);
    if (!h.ok) throw new Error(h.error);
    hesapId = h.value.id;
    cerez = `${auth.OTURUM_CEREZI}=${await auth.oturumAc(store, h.value)}`;
    jest.spyOn(anthropic, "composeGame").mockImplementation(async (input: ResolvedInput) => toModelOutput(makeDefinition(input, 7)));
  });
  afterEach(() => jest.restoreAllMocks());

  const olustur = (sure = 40) => {
    const req = jsonRequest("/api/compose", { sinif: 10, dersler: [{ ders: "fizik", konuId: getUniteler(10, "fizik")[0].id }], sure, deneyim: "dengeli", alan: "sinif" });
    req.headers.set("cookie", cerez);
    req.headers.set("x-forwarded-for", "9.9.9.9");
    return route.POST(req);
  };
  const oturumsuz = async () => krediRoute.GET(new Request("http://localhost/api/kredi"));
  const krediOku = async () => {
    const req = new Request("http://localhost/api/kredi");
    req.headers.set("cookie", cerez);
    return (await krediRoute.GET(req)).json();
  };

  it("başarılı oluşturma maliyeti düşer ve yanıtta güncel bakiye döner", async () => {
    const res = await olustur(40);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.kredi).toMatchObject({ aylikHak: 30, aylikKalan: 27, kazanilan: 0, toplam: 27 });
    expect(json.kredi.hareketler[0]).toMatchObject({ tur: "harcama", miktar: -3, aciklama: "Oyun oluşturma (40 dk)" });
    await olustur(60);
    expect((await krediOku()).toplam).toBe(23);
  });

  it("bakiye yetmezse 402, yapay zekâ çağrılmaz ve bakiye değişmez", async () => {
    await krediStore.getKrediStore().harca(hesapId, ayOf(Date.now()), 30, 29, Date.now(), "doldur", 1e9, "doldur");
    const res = await olustur(40);
    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json.error).toMatch(/3 kredi/);
    expect(json.kredi.toplam).toBe(1);
    expect(anthropic.composeGame).not.toHaveBeenCalled();
    expect((await krediOku()).toplam).toBe(1);
  });

  it("oluşturma başarısızsa kredi iade edilir (zaman aşımı ve model hatası)", async () => {
    (anthropic.composeGame as jest.Mock).mockRejectedValueOnce(new anthropic.ComposeError("timeout", "zaman aşımı"));
    expect((await olustur(40)).status).toBe(504);
    let k = await krediOku();
    expect(k.toplam).toBe(30);
    expect(k.hareketler.map((h: { tur: string }) => h.tur)).toEqual(["iade", "harcama"]);
    (anthropic.composeGame as jest.Mock).mockRejectedValueOnce(new Error("beklenmeyen"));
    expect((await olustur(20)).status).toBe(502);
    k = await krediOku();
    expect(k.toplam).toBe(30);
    // Başarılı oluşturma askıda kalmaz.
    await olustur(40);
    expect(await krediStore.getKrediStore().askidakiler(hesapId)).toEqual([]);
  });

  it("iade yazılamazsa öğretmene kredinin otomatik iade edileceği söylenir", async () => {
    (anthropic.composeGame as jest.Mock).mockRejectedValueOnce(new Error("beklenmeyen"));
    jest.spyOn(krediStore.getKrediStore(), "iade").mockRejectedValue(new Error("redis kapalı"));
    const res = await olustur(40);
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.krediNotu).toMatch(/otomatik olarak iade/);
    expect(json.error).toMatch(/otomatik olarak iade/);
    expect((await krediStore.getKrediStore().askidakiler(hesapId))).toHaveLength(1);
  });

  it("oran sınırına takılan istek kredi harcamaz", async () => {
    jest.spyOn(rateLimit, "checkComposeLimit").mockResolvedValue(false);
    expect((await olustur(40)).status).toBe(429);
    expect((await krediOku()).toplam).toBe(30);
  });

  it("kredi deposu okunamazsa oluşturma yapılmaz (503), yapay zekâ çağrılmaz", async () => {
    jest.spyOn(krediStore, "getKrediStore").mockImplementation(() => {
      throw new Error("redis kapalı");
    });
    expect((await olustur(40)).status).toBe(503);
    expect(anthropic.composeGame).not.toHaveBeenCalled();
  });

  it("eşzamanlı iki oluşturma bakiyeyi eksiye düşüremez", async () => {
    await krediStore.getKrediStore().harca(hesapId, ayOf(Date.now()), 30, 26, Date.now(), "doldur", 1e9, "doldur");
    const sonuclar = (await Promise.all([olustur(40), olustur(40)])).map((r) => r.status).sort();
    expect(sonuclar).toEqual([200, 402]);
    expect((await krediOku()).toplam).toBe(1);
  });

  it("GET /api/kredi oturum ister", async () => {
    expect((await oturumsuz()).status).toBe(401);
  });
});

describe("askı süresi ile oluşturma süre sınırı", () => {
  it("askıdaki harcama, oluşturma route'unun en uzun süresinden önce iade edilmez", async () => {
    const { ASKI_SURESI_MS } = await import("@/lib/krediService");
    const { maxDuration } = await import("@/app/api/compose/route");
    // En az bir dakika pay: uzun süren ama başarılı bir oluşturma, tamamlanmadan önce iade edilmesin.
    expect(ASKI_SURESI_MS).toBeGreaterThanOrEqual((maxDuration + 60) * 1000);
  });
});

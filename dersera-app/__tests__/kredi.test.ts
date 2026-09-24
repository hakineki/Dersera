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
    expect(await s.harca("h", "2026-09", 30, 28, 2, "a", 1000, "x1")).toEqual({ ok: true, aylik: 28, okul: 0, kazanilan: 0 });
    expect(await s.harca("h", "2026-09", 30, 4, 3, "b", 1000, "x2")).toEqual({ ok: true, aylik: 2, okul: 0, kazanilan: 2 });
    expect(await s.harca("h", "2026-09", 30, 4, 4, "c", 1000, "x3")).toEqual({ ok: false, aylikKalan: 0, okulKalan: 0, kazanilan: 3 });
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
    expect(await s.harca("h", "2026-09", 30, 3, 3, "b", 1000, "x2")).toEqual({ ok: true, aylik: 1, okul: 0, kazanilan: 2 });
    const [x1, x2] = await s.askidakiler("h");
    expect(await s.tamamla("h", "x1")).toBe(true);
    expect(await s.iade("h", x1, 4, "iade", 1000)).toBe(false);
    expect(await s.iade("h", x2, 4, "iade", 1000)).toBe(true);
    expect(await s.iade("h", x2, 5, "iade", 1000)).toBe(false);
    expect(await s.oku("h", "2026-09", 1)).toMatchObject({ kullanilan: 29, kazanilan: 3, hareketler: [{ tur: "iade", miktar: 3, aylik: 1, kazanilan: 2 }] });
    expect(await s.askidakiler("h")).toEqual([]);
  });

  it("okul havuzu: kişisel aylık → okul → kazanılan; öğretmen sınırı; okulsuz harcama havuzu görmez; iade ödeyen okula", async () => {
    const s = createMemoryKrediStore();
    const okul = "0b5e4d1c-8f7a-4c2e-9d3b-6a1f2e3d4c5b";
    await s.okulHakYaz(okul, 10);
    await s.okulSinirYaz(okul, 6);
    await s.odul("h", 4, 1, "ödül");
    expect(await s.harca("h", "2026-09", 30, 41, 2, "fazla", 1000, "x0", okul)).toEqual({ ok: false, aylikKalan: 30, okulKalan: 6, kazanilan: 4 });
    expect(await s.harca("h", "2026-09", 30, 33, 2, "a", 1000, "x1", okul)).toEqual({ ok: true, aylik: 30, okul: 3, kazanilan: 0 });
    expect(await s.harca("h", "2026-09", 30, 5, 3, "b", 1000, "x2", okul)).toEqual({ ok: true, aylik: 0, okul: 3, kazanilan: 2 });
    // Sınır (6) doldu: yalnız kazanılan (2) kaldı.
    expect(await s.harca("h", "2026-09", 30, 3, 4, "c", 1000, "x3", okul)).toEqual({ ok: false, aylikKalan: 0, okulKalan: 0, kazanilan: 2 });
    // Başka öğretmen: havuzda 4 kaldı.
    await s.harca("g", "2026-09", 30, 30, 5, "d", 1000, "y1", okul);
    expect(await s.harca("g", "2026-09", 30, 5, 6, "e", 1000, "y2", okul)).toEqual({ ok: false, aylikKalan: 0, okulKalan: 4, kazanilan: 0 });
    expect(await s.harca("g", "2026-09", 30, 4, 6, "e", 1000, "y3", okul)).toEqual({ ok: true, aylik: 0, okul: 4, kazanilan: 0 });
    expect(await s.harca("g", "2026-09", 30, 1, 7, "f", 1000, "y4")).toEqual({ ok: false, aylikKalan: 0, okulKalan: 0, kazanilan: 0 });
    expect(await s.okulHavuzu(okul, "2026-09")).toEqual({ hak: 10, sinir: 6, kullanilan: 10, ogretmenler: { h: 6, g: 4 } });
    // Yeni ay: havuz yenilenir.
    expect(await s.okulHavuzu(okul, "2026-10")).toEqual({ hak: 10, sinir: 6, kullanilan: 0, ogretmenler: {} });

    const x2 = (await s.askidakiler("h")).find((a) => a.id === "x2")!;
    expect(x2).toEqual({ id: "x2", ay: "2026-09", aylik: 0, okul: 3, kazanilan: 2, tarih: 3, okulId: okul, ham: askiDegeri("2026-09", 0, 2, 3, 3, okul) });
    expect(await s.iade("h", x2, 8, "iade", 1000)).toBe(true);
    expect(await s.okulHavuzu(okul, "2026-09")).toMatchObject({ kullanilan: 7, ogretmenler: { h: 3, g: 4 } });
    expect(await s.oku("h", "2026-09", 1)).toMatchObject({ kazanilan: 4, hareketler: [{ tur: "iade", miktar: 5, aylik: 0, okul: 3, kazanilan: 2 }] });

    expect(await s.okulHavuzlari("2026-09")).toEqual([{ okulId: okul, hak: 10, kullanilan: 7 }]);
    await s.okulHakYaz(okul, 0);
    expect(await s.okulHavuzlari("2026-09")).toEqual([]);
    expect(await s.harca("g", "2026-09", 30, 1, 9, "g", 1000, "y5", okul)).toEqual({ ok: false, aylikKalan: 0, okulKalan: 0, kazanilan: 0 });
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
    const okul = "0b5e4d1c-8f7a-4c2e-9d3b-6a1f2e3d4c5b";
    let yanit: unknown = [1, 3, 0, 0];
    const { command, calls } = recordingCommand((a) =>
      a[0] === "EVAL"
        ? yanit
        : a[0] === "MGET"
          ? ["7", "2"]
          : a[0] === "HGETALL"
            ? ["x1", "2026-09|3|0|99", "x2", `2026-09|1|1|98|2|${okul}`, "bozuk", "??", "okulsuz", "2026-09|1|0|98|2|"]
            : a[0] === "HDEL"
              ? 1
              : a[0] === "LRANGE"
                ? ['{"tur":"odul","miktar":2,"aylik":0,"kazanilan":2,"tarih":1,"aciklama":"x"}']
                : "OK"
    );
    const s = createRedisKrediStore(command);
    expect(await s.harca("h1", "2026-09", 30, 3, 99, 'Oyun "40" dk', 5000, "x1")).toEqual({ ok: true, aylik: 3, okul: 0, kazanilan: 0 });
    expect(calls[0][1]).toContain("HSET', KEYS[4]");
    // Okulsuz harcamada okul anahtarları yer tutucudur ve okul kimliği boştur (betik okul dalına girmez).
    expect(calls[0].slice(2)).toEqual([
      "8", "dersera:kredi:h1:aylik:2026-09", "dersera:kredi:h1:kazanilan", "dersera:kredi:h1:hareketler", "dersera:kredi:h1:aski", "-", "-", "-", "-",
      "30", "3", "5000", "99", '"Oyun \\"40\\" dk"', "x1", "2026-09", "h1", "",
    ]);
    yanit = [1, 0, 2, 1];
    expect(await s.harca("h1", "2026-09", 30, 3, 99, "x", 5000, "x2", okul)).toEqual({ ok: true, aylik: 0, okul: 2, kazanilan: 1 });
    expect(calls.at(-1)!.slice(2)).toEqual([
      "8", "dersera:kredi:h1:aylik:2026-09", "dersera:kredi:h1:kazanilan", "dersera:kredi:h1:hareketler", "dersera:kredi:h1:aski",
      `dersera:kredi:okul:${okul}:hak`, `dersera:kredi:okul:${okul}:sinir`, `dersera:kredi:okul:${okul}:aylik:2026-09`, `dersera:kredi:okul:${okul}:ogretmen:2026-09`,
      "30", "3", "5000", "99", '"x"', "x2", "2026-09", "h1", okul,
    ]);
    yanit = [0, 1, 0, 0];
    expect(await s.harca("h1", "2026-09", 30, 3, 99, "x", 5000, "x9")).toEqual({ ok: false, aylikKalan: 1, okulKalan: 0, kazanilan: 0 });
    // Eski biçim (okul havuzundan önce) okul payı 0 okunur; okul payı olup okulu olmayan kayıt bozuktur.
    const aski = await s.askidakiler("h1");
    expect(aski).toEqual([
      { id: "x1", ay: "2026-09", aylik: 3, okul: 0, kazanilan: 0, tarih: 99, okulId: null, ham: "2026-09|3|0|99" },
      { id: "x2", ay: "2026-09", aylik: 1, okul: 2, kazanilan: 1, tarih: 98, okulId: okul, ham: `2026-09|1|1|98|2|${okul}` },
    ]);
    yanit = 1;
    expect(await s.iade("h1", aski[0], 100, "iade", 5000)).toBe(true);
    expect(calls.at(-1)!.slice(2)).toEqual([
      "6", "dersera:kredi:h1:aylik:2026-09", "dersera:kredi:h1:kazanilan", "dersera:kredi:h1:hareketler", "dersera:kredi:h1:aski", "-", "-",
      "x1", "2026-09|3|0|99", "3", "0", "100", '"iade"', "5000", "0", "h1",
    ]);
    expect(await s.iade("h1", aski[1], 100, "iade", 5000)).toBe(true);
    expect(calls.at(-1)!.slice(2)).toEqual([
      "6", "dersera:kredi:h1:aylik:2026-09", "dersera:kredi:h1:kazanilan", "dersera:kredi:h1:hareketler", "dersera:kredi:h1:aski",
      `dersera:kredi:okul:${okul}:aylik:2026-09`, `dersera:kredi:okul:${okul}:ogretmen:2026-09`,
      "x2", `2026-09|1|1|98|2|${okul}`, "1", "1", "100", '"iade"', "5000", "2", "h1",
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

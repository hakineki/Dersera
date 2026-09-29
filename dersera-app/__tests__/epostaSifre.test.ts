import { epostaGonder, EpostaYapilandirilmadiError, siteAdresi, type Eposta } from "@/lib/eposta";
import { createRedisEpostaStore } from "@/lib/epostaStore";
import { adresOzeti, epostaNormal, SIFIRLAMA_ISTENDI } from "@/lib/epostaService";
import { buildApi, cerezli, hesapAc, jsonRequest, oturumCerezi } from "./helpers/api";
import { clearRedisEnv } from "./helpers/fakeRedis";
import { createLuaRedis } from "./helpers/luaRedis";

const SIFRE = "gizli-sifre-1";
const YENI = "yepyeni-sifre-7";
// Arka plan işi (sıfırlama e-postası) testte istek dışında hemen başlatılır; birkaç tur beklenir.
const bekle = async () => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r));
};
const belirtecOf = (e: Eposta) => /[?&]t=([A-Za-z0-9_-]+)/.exec(e.metin)![1];

describe("e-posta gönderimi ve yapılandırma", () => {
  it("Resend isteği; canlıda anahtar ya da site adresi yoksa gönderilmez", async () => {
    const cagrilar: [string, RequestInit][] = [];
    const sahteFetch = (async (url: string, init: RequestInit) => {
      cagrilar.push([url, init]);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    await epostaGonder({ kime: "a@b.tr", konu: "K", metin: "M" }, { RESEND_API_KEY: "re_x", EPOSTA_GONDEREN: "Dersera <b@d.tr>" }, sahteFetch);
    expect(cagrilar[0][0]).toBe("https://api.resend.com/emails");
    expect((cagrilar[0][1].headers as Record<string, string>).Authorization).toBe("Bearer re_x");
    expect(JSON.parse(cagrilar[0][1].body as string)).toEqual({ from: "Dersera <b@d.tr>", to: ["a@b.tr"], subject: "K", text: "M" });
    const hataliFetch = (async () => new Response("{}", { status: 422 })) as unknown as typeof fetch;
    await expect(epostaGonder({ kime: "a@b.tr", konu: "K", metin: "M" }, { RESEND_API_KEY: "re_x", EPOSTA_GONDEREN: "g@d.tr" }, hataliFetch)).rejects.toThrow("422");
    await expect(epostaGonder({ kime: "a@b.tr", konu: "K", metin: "M" }, { NODE_ENV: "production", RESEND_API_KEY: "re_x" })).rejects.toBeInstanceOf(EpostaYapilandirilmadiError);

    const req = new Request("https://kotu.example/api/x", { headers: { host: "kotu.example" } });
    expect(siteAdresi(req, { DERSERA_SITE_ADRESI: "https://dersera.vercel.app/" })).toBe("https://dersera.vercel.app");
    expect(() => siteAdresi(req, { NODE_ENV: "production" })).toThrow(EpostaYapilandirilmadiError);
    expect(siteAdresi(req, {})).toBe("https://kotu.example");
  });

  it("adres biçimi", () => {
    expect(epostaNormal("  Ayse.Yilmaz@Okul.K12.tr ")).toBe("ayse.yilmaz@okul.k12.tr");
    for (const kotu of ["ayse", "a@b", 'a"b@c.tr', "a b@c.tr", "a@b.c", "a\\b@c.tr", `${"a".repeat(250)}@c.tr`, 5]) expect(epostaNormal(kotu)).toBeNull();
  });

  it("Redis betikleri (mini-Redis): doğrulama dizini, kaldırma, tek kullanımlık belirteç", async () => {
    const { command, dizeler } = createLuaRedis();
    const s = createRedisEpostaStore(command);
    const adres = "ayse@okul.tr";
    await s.yaz("a", { adres, dogrulandi: false, zaman: 1 }, null);
    await s.yaz("b", { adres, dogrulandi: false, zaman: 1 }, null);
    expect(await s.dogrula("a", "baska@okul.tr", adresOzeti(adres), 2)).toBe("degisti");
    expect(await s.dogrula("a", adres, adresOzeti(adres), 2)).toBe("ok");
    expect(await s.dogrula("b", adres, adresOzeti(adres), 3)).toBe("alinmis");
    expect(dizeler.get(`dersera:eposta:adres:${adresOzeti(adres)}`)).toBe("a");
    await s.kaldir("b", adresOzeti(adres));
    expect(await s.adrestenHesap(adresOzeti(adres))).toBe("a");
    await s.kaldir("a", adresOzeti(adres));
    expect([await s.oku("a"), await s.adrestenHesap(adresOzeti(adres))]).toEqual([null, null]);
    await s.belirtecYaz("oz", { tur: "dogrulama", hesapId: "a", adres }, 1000);
    expect(await s.belirtecAl("oz")).toEqual({ tur: "dogrulama", hesapId: "a", adres });
    expect(await s.belirtecAl("oz")).toBeNull();
    expect([...dizeler.keys()].some((k) => k.includes(adres))).toBe(false);
  });
});

describe("e-posta ve şifre sıfırlama uçları", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  let ayse: string;
  let bora: string;
  let ayseId: string;
  let giden: Eposta[];
  const eskiYoneticiler = process.env.DERSERA_YONETICILER;

  beforeEach(async () => {
    clearRedisEnv();
    process.env.DERSERA_YONETICILER = "platform1";
    api = await buildApi();
    giden = [];
    jest.spyOn(api.epostaModul, "epostaGonder").mockImplementation(async (e: Eposta) => {
      giden.push(e);
    });
    ayse = await hesapAc(api, "ayse");
    bora = await hesapAc(api, "bora");
    ayseId = (await api.authStore.getAuthStore().idByAd("ayse"))!;
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => {
    if (eskiYoneticiler === undefined) delete process.env.DERSERA_YONETICILER;
    else process.env.DERSERA_YONETICILER = eskiYoneticiler;
  });

  const epostaEkle = (c: string | null, adres: string, sifre = SIFRE) => api.eposta.POST(cerezli(jsonRequest("/api/auth/eposta", { adres, sifre }), c));
  const durum = async (c: string) => (await (await api.eposta.GET(cerezli(new Request("http://localhost/api/auth/eposta"), c))).json()).eposta;
  const dogrula = (t: unknown) => api.epostaDogrula.POST(jsonRequest("/api/auth/eposta/dogrula", { t }));
  const iste = (girdi: string) => api.sifirlamaIste.POST(jsonRequest("/api/auth/sifre-sifirlama/iste", { girdi }));
  const sifirla = (t: string, yeniSifre: string) => api.sifreSifirla.POST(jsonRequest("/api/auth/sifre-sifirlama", { t, yeniSifre }));
  const ben = async (c: string) => (await (await api.ben.GET(cerezli(new Request("http://localhost/api/auth/ben"), c))).json()).hesap;
  const giris = (ad: string, sifre: string) => api.giris.POST(jsonRequest("/api/auth/giris", { kullaniciAdi: ad, sifre }));
  const dogrulanmisEkle = async (c: string, adres: string) => {
    expect((await epostaEkle(c, adres)).status).toBe(200);
    expect((await dogrula(belirtecOf(giden.at(-1)!))).status).toBe(200);
  };

  it("oturum, şifre ve köken ister; geçersiz adres 422", async () => {
    expect((await api.eposta.GET(new Request("http://localhost/api/auth/eposta"))).status).toBe(401);
    expect((await epostaEkle(null, "a@okul.tr")).status).toBe(401);
    expect((await epostaEkle(ayse, "a@okul.tr", "yanlis-sifre-9")).status).toBe(403);
    expect((await epostaEkle(ayse, "gecersiz")).status).toBe(422);
    const req = cerezli(jsonRequest("/api/auth/eposta", { adres: "a@okul.tr", sifre: SIFRE }), ayse);
    req.headers.set("sec-fetch-site", "cross-site");
    expect((await api.eposta.POST(req)).status).toBe(403);
    expect(giden).toEqual([]);
    expect(await durum(ayse)).toBeNull();
  });

  it("ekle → doğrulama e-postası → doğrula (tek kullanımlık); aynı adres başka hesapta doğrulanamaz", async () => {
    const r = await epostaEkle(ayse, " Ayse@Okul.tr ");
    expect(await r.json()).toEqual({ eposta: { adres: "ayse@okul.tr", dogrulandi: false } });
    expect(giden).toHaveLength(1);
    expect(giden[0]).toMatchObject({ kime: "ayse@okul.tr", konu: "Dersera: e-posta adresini doğrula" });
    expect(giden[0].metin).toMatch(/http:\/\/localhost\/eposta-dogrula\?t=/);
    const t = belirtecOf(giden[0]);
    expect((await dogrula("kisa")).status).toBe(400);
    expect((await dogrula(t)).status).toBe(200);
    expect(await durum(ayse)).toEqual({ adres: "ayse@okul.tr", dogrulandi: true });
    expect((await dogrula(t)).status).toBe(400);
    // Doğrulanmış aynı adres: e-posta gönderilmez.
    expect((await (await epostaEkle(ayse, "ayse@okul.tr")).json()).eposta.dogrulandi).toBe(true);
    expect(giden).toHaveLength(1);

    expect((await epostaEkle(bora, "ayse@okul.tr")).status).toBe(200);
    const r2 = await dogrula(belirtecOf(giden.at(-1)!));
    expect([r2.status, (await r2.json()).error]).toEqual([409, "Bu e-posta adresi başka bir hesapta doğrulanmış."]);
    expect(await durum(bora)).toEqual({ adres: "ayse@okul.tr", dogrulandi: false });
  });

  it("şifremi unuttum: yanıt her durumda aynı; e-posta yalnız doğrulanmış adrese", async () => {
    expect((await epostaEkle(bora, "bora@okul.tr")).status).toBe(200); // doğrulanmamış
    await dogrulanmisEkle(ayse, "ayse@okul.tr");
    giden = [];
    const yanitlar = [];
    for (const g of ["ayse", "AYSE@okul.tr", "bora", "bora@okul.tr", "olmayan", "olmayan@okul.tr", ""]) {
      const r = await iste(g);
      yanitlar.push([r.status, await r.json()]);
    }
    expect(new Set(yanitlar.map((y) => JSON.stringify(y)))).toEqual(new Set([JSON.stringify([200, { mesaj: SIFIRLAMA_ISTENDI }])]));
    await bekle();
    expect(giden.map((e) => [e.kime, e.konu])).toEqual([
      ["ayse@okul.tr", "Dersera: şifre sıfırlama"],
      ["ayse@okul.tr", "Dersera: şifre sıfırlama"],
    ]);
    expect(giden[0].metin).toMatch(/http:\/\/localhost\/sifre-sifirla\?t=/);
  });

  it("sıfırla: zayıf şifre belirteci harcamaz; başarıda oturumlar düşer, eski şifre geçmez; belirteç tek kullanımlık ve şifre değişince geçersiz", async () => {
    await dogrulanmisEkle(ayse, "ayse@okul.tr");
    await iste("ayse");
    await iste("ayse");
    await bekle();
    const [t1, t2] = giden.slice(-2).map(belirtecOf);
    expect((await sifirla(t1, "123")).status).toBe(422);
    const r = await sifirla(t1, YENI);
    expect(r.status).toBe(200);
    expect(await ben(ayse)).toBeNull();
    expect((await giris("ayse", SIFRE)).status).toBe(401);
    expect(await ben(oturumCerezi(await giris("ayse", YENI))!.split(";")[0])).toMatchObject({ kullaniciAdi: "ayse" });
    expect((await sifirla(t1, "baska-sifre-8")).status).toBe(400);
    // İkinci bağlantı ilk sıfırlamadan önce verilmişti: şifre sürümü değiştiği için geçersiz.
    expect((await sifirla(t2, "baska-sifre-8")).status).toBe(400);
    expect((await sifirla("x".repeat(43), "baska-sifre-8")).status).toBe(400);
  });

  it("kaldır ve değiştir: eski adres artık sıfırlama göndermez; hesap silinince e-posta ve dizin gider", async () => {
    await dogrulanmisEkle(ayse, "ayse@okul.tr");
    await dogrulanmisEkle(ayse, "yeni@okul.tr");
    giden = [];
    await iste("ayse@okul.tr");
    await iste("yeni@okul.tr");
    await bekle();
    expect(giden.map((e) => e.kime)).toEqual(["yeni@okul.tr"]);

    expect((await api.epostaKaldir.POST(cerezli(jsonRequest("/api/auth/eposta/kaldir", { sifre: "yanlis-sifre-9" }), ayse))).status).toBe(403);
    expect((await api.epostaKaldir.POST(cerezli(jsonRequest("/api/auth/eposta/kaldir", { sifre: SIFRE }), ayse))).status).toBe(200);
    expect(await durum(ayse)).toBeNull();
    giden = [];
    await iste("yeni@okul.tr");
    await iste("ayse");
    await bekle();
    expect(giden).toEqual([]);

    await dogrulanmisEkle(ayse, "son@okul.tr");
    expect((await api.hesapSil.POST(cerezli(jsonRequest("/api/auth/hesap-sil", { sifre: SIFRE }), ayse))).status).toBe(200);
    const es = api.epostaStore.getEpostaStore();
    expect([await es.oku(ayseId), await es.adrestenHesap(adresOzeti("son@okul.tr"))]).toEqual([null, null]);
  });

  it("hesap başına saatte en çok 5 e-posta", async () => {
    for (let i = 0; i < 5; i++) expect((await epostaEkle(ayse, `a${i}@okul.tr`)).status).toBe(200);
    expect((await epostaEkle(ayse, "a9@okul.tr")).status).toBe(429);
    expect(giden).toHaveLength(5);
  });

  it("canlıda yapılandırma yoksa açık hata (503), hesap bilgisi sızmaz", async () => {
    jest.restoreAllMocks();
    // Depolar önceden açılır (canlıda Redis vardır); eksik olan yalnız e-posta yapılandırması.
    expect(await durum(ayse)).toBeNull();
    const eski = process.env.NODE_ENV;
    const YAPILANDIRMA_YOK = [503, { error: "E-posta gönderimi şu anda kullanılamıyor. Platform yöneticisine yaz." }];
    try {
      (process.env as Record<string, string>).NODE_ENV = "production";
      const r = await epostaEkle(ayse, "ayse@okul.tr");
      expect([r.status, await r.json()]).toEqual(YAPILANDIRMA_YOK);
      for (const g of ["olmayan", "ayse"]) {
        const s = await iste(g);
        expect([s.status, await s.json()]).toEqual(YAPILANDIRMA_YOK);
      }
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = eski;
    }
  });

  it("yönetici sıfırlama bağlantısı: yetki, gerekçe, işlem kaydı; bağlantı çalışır; ayrıntıda yalnız e-posta var/yok", async () => {
    const yonetici = await hesapAc(api, "platform1");
    const uret = (c: string | null, id: string, neden: unknown) => api.ogretmenSifirlama.POST(cerezli(jsonRequest(`/api/yonetim/ogretmenler/${id}/sifirlama`, { neden }), c), api.idParams(id));
    expect((await uret(null, ayseId, "unuttu")).status).toBe(401);
    expect((await uret(bora, ayseId, "unuttu")).status).toBe(403);
    expect((await uret(yonetici, ayseId, "")).status).toBe(422);
    expect((await uret(yonetici, (await api.authStore.getAuthStore().idByAd("platform1"))!, "kendim")).status).toBe(409);

    const ayrinti = async () => (await api.ogretmen.GET(cerezli(new Request(`http://localhost/api/yonetim/ogretmenler/${ayseId}`), yonetici), api.idParams(ayseId))).json();
    expect((await ayrinti()).epostaDogrulanmis).toBe(false);
    const r = await uret(yonetici, ayseId, "Şifresini unuttu, e-postası yok");
    const { baglanti } = await r.json();
    expect(baglanti).toMatch(/^http:\/\/localhost\/sifre-sifirla\?t=[A-Za-z0-9_-]{40,}$/);
    expect(giden).toEqual([]);
    expect((await sifirla(new URL(baglanti).searchParams.get("t")!, YENI)).status).toBe(200);
    expect((await giris("ayse", YENI)).status).toBe(200);

    await dogrulanmisEkle(bora, "bora@okul.tr");
    const boraId = (await api.authStore.getAuthStore().idByAd("bora"))!;
    const b = await (await api.ogretmen.GET(cerezli(new Request(`http://localhost/api/yonetim/ogretmenler/${boraId}`), yonetici), api.idParams(boraId))).json();
    expect(b.epostaDogrulanmis).toBe(true);
    expect(JSON.stringify(b)).not.toContain("bora@okul.tr");

    const islemler = (await (await api.ogretmenler.GET(cerezli(new Request("http://localhost/api/yonetim/ogretmenler"), yonetici))).json()).islemler;
    expect(islemler[0]).toMatchObject({ islem: "sifirlama-baglantisi", hedef: "ayse", yonetici: "platform1" });
  });
});

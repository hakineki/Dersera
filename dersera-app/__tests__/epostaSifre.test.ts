import { epostaGonder, EpostaYapilandirilmadiError, siteAdresi, type Eposta } from "@/lib/eposta";
import { createMemoryEpostaStore, createRedisEpostaStore } from "@/lib/epostaStore";
import { adresOzeti, DOGRULAMA_SURESI_MS, EPOSTA_ISTENIR, epostaNormal, SIFIRLAMA_ISTENDI, SIFIRLAMA_SURESI_MS } from "@/lib/epostaService";
import { buildApi, cerezli, hesapAc, jsonRequest, oturumCerezi } from "./helpers/api";
import { clearRedisEnv } from "./helpers/fakeRedis";
import { createLuaRedis } from "./helpers/luaRedis";
import { existsSync } from "fs";
import { join } from "path";

const SIFRE = "gizli-sifre-1";
const YENI = "yepyeni-sifre-7";
const belirtecOf = (e: Eposta) => /#t=([A-Za-z0-9_-]+)/.exec(e.metin)![1];

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

  it("belirteç süresi: sınırda geçerli, sonra null", async () => {
    let t = 0;
    const s = createMemoryEpostaStore(() => t);
    const d = { tur: "dogrulama" as const, hesapId: "a", adres: "a@b.tr" };
    const sf = { tur: "sifirlama" as const, hesapId: "a", surum: 1 };
    await s.belirtecYaz("d1", d, DOGRULAMA_SURESI_MS);
    await s.belirtecYaz("d2", d, DOGRULAMA_SURESI_MS);
    await s.belirtecYaz("s1", sf, SIFIRLAMA_SURESI_MS);
    await s.belirtecYaz("s2", sf, SIFIRLAMA_SURESI_MS);
    t = SIFIRLAMA_SURESI_MS - 1;
    expect(await s.belirtecAl("s1")).toEqual(sf);
    t = SIFIRLAMA_SURESI_MS;
    expect(await s.belirtecAl("s2")).toBeNull();
    t = DOGRULAMA_SURESI_MS - 1;
    expect(await s.belirtecAl("d1")).toEqual(d);
    t = DOGRULAMA_SURESI_MS;
    expect(await s.belirtecAl("d2")).toBeNull();
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
  // Arka plan işi (sıfırlama e-postası) testte istek dışında hemen başlatılır; bitmesi beklenir.
  const bekle = async () => {
    while (api.epostaIstek.istekDisiIsler.size > 0) await Promise.all([...api.epostaIstek.istekDisiIsler]);
  };

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
    // Kayıtta verilen (doğrulanmamış) adreslere giden doğrulama e-postaları; testler kendi gönderimlerine bakar.
    giden = [];
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
  const kayit = (kullaniciAdi: string, eposta?: unknown) =>
    api.kayit.POST(jsonRequest("/api/auth/kayit", { kullaniciAdi, sifre: SIFRE, kosulOnayi: true, ...(eposta !== undefined && { eposta }) }));
  const yenidenGonder = (c: string | null) => api.epostaYenidenGonder.POST(cerezli(jsonRequest("/api/auth/eposta/yeniden-gonder", {}), c));
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
    // Kayıtta verilen adres değişmedi (doğrulanmamış).
    expect(await durum(ayse)).toEqual({ adres: "ayse@okul.test", dogrulandi: false });
  });

  it("kayıtta e-posta zorunlu: yoksa ya da geçersizse 422 ve hesap açılmaz", async () => {
    for (const eposta of [undefined, "", "gecersiz", 5, "a b@okul.tr"]) {
      const r = await kayit("cem", eposta);
      expect([r.status, (await r.json()).error, r.headers.get("set-cookie")]).toEqual([422, EPOSTA_ISTENIR, null]);
    }
    expect(await api.authStore.getAuthStore().idByAd("cem")).toBeNull();
    expect(giden).toEqual([]);
  });

  it("kayıt: adres doğrulanmamış yazılır, doğrulama bağlantısı gider; bağlantıyla doğrulanır", async () => {
    const r = await kayit("cem", " Cem@Okul.TR ");
    expect(r.status).toBe(201);
    expect((await r.json()).eposta).toEqual({ adres: "cem@okul.tr", dogrulandi: false, gonderildi: true });
    const cem = oturumCerezi(r)!;
    expect(giden.map((e) => [e.kime, e.konu])).toEqual([["cem@okul.tr", "Dersera: e-posta adresini doğrula"]]);
    expect(giden[0].metin).toContain("Merhaba cem");
    expect(await durum(cem)).toEqual({ adres: "cem@okul.tr", dogrulandi: false });
    expect((await dogrula(belirtecOf(giden[0]))).status).toBe(200);
    expect(await durum(cem)).toEqual({ adres: "cem@okul.tr", dogrulandi: true });
  });

  it("kayıt: doğrulama e-postası gönderilemese de hesap açılır, adres kalır; panelden yeniden gönderilir", async () => {
    jest.spyOn(api.epostaModul, "epostaGonder").mockRejectedValueOnce(new Error("Resend 500"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    const r = await kayit("cem", "cem@okul.tr");
    expect(r.status).toBe(201);
    expect((await r.json()).eposta).toEqual({ adres: "cem@okul.tr", dogrulandi: false, gonderildi: false });
    const cem = oturumCerezi(r)!;
    expect(await durum(cem)).toEqual({ adres: "cem@okul.tr", dogrulandi: false });
    expect(giden).toEqual([]);
    const y = await yenidenGonder(cem);
    expect([y.status, await y.json()]).toEqual([200, { adres: "cem@okul.tr" }]);
    expect(giden.map((e) => e.kime)).toEqual(["cem@okul.tr"]);
  });

  it("kayıt: e-posta deposu yazılamazsa da hesap açılır; yanıtta adres kaydedilmiş gibi görünmez, panel 'e-posta ekle' der", async () => {
    jest.spyOn(api.epostaStore.getEpostaStore(), "yaz").mockRejectedValueOnce(new Error("Redis yok"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    const r = await kayit("cem", "cem@okul.tr");
    expect([r.status, (await r.json()).eposta]).toEqual([201, null]);
    expect(await durum(oturumCerezi(r)!)).toBeNull();
    expect(giden).toEqual([]);
  });

  it("yeniden gönder: oturum ve köken ister; doğrulanmışa 409, e-postasız (eski) hesaba 404; sınır kayıttaki gönderimle ortak", async () => {
    expect((await yenidenGonder(null)).status).toBe(401);
    const capraz = cerezli(jsonRequest("/api/auth/eposta/yeniden-gonder", {}), ayse);
    capraz.headers.set("sec-fetch-site", "cross-site");
    expect((await api.epostaYenidenGonder.POST(capraz)).status).toBe(403);
    // Kayıttaki 1 gönderim + 4 yeniden gönderim = saatlik 5; altıncısı 429.
    for (let i = 0; i < 4; i++) expect((await yenidenGonder(ayse)).status).toBe(200);
    expect((await yenidenGonder(ayse)).status).toBe(429);
    expect(giden).toHaveLength(4);
    expect((await dogrula(belirtecOf(giden.at(-1)!))).status).toBe(200);
    expect((await yenidenGonder(ayse)).status).toBe(409);
    // E-posta zorunlu olmadan önce açılmış hesap: kayıt yok.
    await api.epostaStore.getEpostaStore().kaldir((await api.authStore.getAuthStore().idByAd("bora"))!, null);
    expect(await durum(bora)).toBeNull();
    expect((await yenidenGonder(bora)).status).toBe(404);
  });

  it("ekle → doğrulama e-postası → doğrula (tek kullanımlık); aynı adres başka hesapta doğrulanamaz", async () => {
    const r = await epostaEkle(ayse, " Ayse@Okul.tr ");
    expect(await r.json()).toEqual({ eposta: { adres: "ayse@okul.tr", dogrulandi: false } });
    expect(giden).toHaveLength(1);
    expect(giden[0]).toMatchObject({ kime: "ayse@okul.tr", konu: "Dersera: e-posta adresini doğrula" });
    expect(giden[0].metin).toMatch(/http:\/\/localhost\/eposta-dogrula#t=/);
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
    expect(giden[0].metin).toMatch(/http:\/\/localhost\/sifre-sifirla#t=/);
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

  it("değiştir: eski adres artık sıfırlama göndermez; kaldırma ucu yok; hesap silinince e-posta ve dizin gider", async () => {
    await dogrulanmisEkle(ayse, "ayse@okul.tr");
    await dogrulanmisEkle(ayse, "yeni@okul.tr");
    giden = [];
    await iste("ayse@okul.tr");
    await iste("yeni@okul.tr");
    await bekle();
    expect(giden.map((e) => e.kime)).toEqual(["yeni@okul.tr"]);

    // E-posta zorunlu: kaldırma ucu yok (adres yalnız değiştirilir).
    expect(existsSync(join(process.cwd(), "app/api/auth/eposta/kaldir"))).toBe(false);
    expect(await durum(ayse)).toEqual({ adres: "yeni@okul.tr", dogrulandi: true });

    await dogrulanmisEkle(ayse, "son@okul.tr");
    expect((await api.hesapSil.POST(cerezli(jsonRequest("/api/auth/hesap-sil", { sifre: SIFRE }), ayse))).status).toBe(200);
    const es = api.epostaStore.getEpostaStore();
    expect([await es.oku(ayseId), await es.adrestenHesap(adresOzeti("son@okul.tr"))]).toEqual([null, null]);
  });

  it("belirteç türleri karışmaz: doğrulama belirteci şifre sıfırlamaz, sıfırlama belirteci e-posta doğrulamaz", async () => {
    await dogrulanmisEkle(ayse, "ayse@okul.tr");
    expect((await epostaEkle(bora, "bora@okul.tr")).status).toBe(200);
    const dogrulamaBelirteci = belirtecOf(giden.at(-1)!);
    expect((await sifirla(dogrulamaBelirteci, YENI)).status).toBe(400);
    expect((await giris("bora", YENI)).status).toBe(401);
    await iste("ayse");
    await bekle();
    const sifirlamaBelirteci = belirtecOf(giden.at(-1)!);
    expect((await dogrula(sifirlamaBelirteci)).status).toBe(400);
  });

  it("askıdaki hesaba sıfırlama e-postası gitmez; sıfırlama isteklerinin sayacı doğrulama e-postalarından ayrıdır", async () => {
    await dogrulanmisEkle(ayse, "ayse@okul.tr");
    await dogrulanmisEkle(bora, "bora@okul.tr");
    await api.authStore.getAuthStore().askiYaz(ayseId, { askida: true, zaman: Date.now(), neden: "deneme" });
    giden = [];
    await iste("ayse");
    await bekle();
    expect(giden).toEqual([]);
    // Sıfırlama saatte 3 kez; sonra doğrulama e-postası yine gönderilebilir (sayaçlar ayrı).
    for (let i = 0; i < 4; i++) await iste("bora");
    await bekle();
    expect(giden.map((e) => e.konu)).toEqual(Array(3).fill("Dersera: şifre sıfırlama"));
    expect((await epostaEkle(bora, "bora2@okul.tr")).status).toBe(200);
    expect(giden).toHaveLength(4);
  });

  it("hesap başına saatte en çok 5 e-posta (kayıttaki doğrulama e-postası da sayılır)", async () => {
    for (let i = 0; i < 4; i++) expect((await epostaEkle(ayse, `a${i}@okul.tr`)).status).toBe(200);
    expect((await epostaEkle(ayse, "a9@okul.tr")).status).toBe(429);
    expect(giden).toHaveLength(4);
  });

  it("canlıda yapılandırma yoksa açık hata (503), hesap bilgisi sızmaz", async () => {
    jest.restoreAllMocks();
    // Depolar önceden açılır (canlıda Redis vardır); eksik olan yalnız e-posta yapılandırması.
    expect(await durum(ayse)).toEqual({ adres: "ayse@okul.test", dogrulandi: false });
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
      expect([(await yenidenGonder(ayse)).status]).toEqual([503]);
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = eski;
    }
  });

  it("yönetici sıfırlama bağlantısı: yetki, gerekçe, işlem kaydı; bağlantı çalışır; ayrıntıda yalnız e-posta var/yok", async () => {
    const yonetici = await hesapAc(api, "platform1");
    giden = [];
    const uret = (c: string | null, id: string, neden: unknown, sifre = SIFRE) => api.ogretmenSifirlama.POST(cerezli(jsonRequest(`/api/yonetim/ogretmenler/${id}/sifirlama`, { neden, sifre }), c), api.idParams(id));
    expect((await uret(null, ayseId, "unuttu")).status).toBe(401);
    expect((await uret(bora, ayseId, "unuttu")).status).toBe(403);
    expect((await uret(yonetici, ayseId, "unuttu", "yanlis-sifre-9")).status).toBe(403);
    expect((await uret(yonetici, ayseId, "")).status).toBe(422);
    expect((await uret(yonetici, (await api.authStore.getAuthStore().idByAd("platform1"))!, "kendim")).status).toBe(409);

    const ayrinti = async () => (await api.ogretmen.GET(cerezli(new Request(`http://localhost/api/yonetim/ogretmenler/${ayseId}`), yonetici), api.idParams(ayseId))).json();
    expect((await ayrinti()).epostaDogrulanmis).toBe(false);
    const r = await uret(yonetici, ayseId, "Şifresini unuttu, e-postası yok");
    const { baglanti, bildirildi } = await r.json();
    expect(baglanti).toMatch(/^http:\/\/localhost\/sifre-sifirla#t=[A-Za-z0-9_-]{40,}$/);
    // E-postası doğrulanmamış: bildirim gitmez.
    expect([bildirildi, giden]).toEqual([false, []]);
    expect((await sifirla(new URL(baglanti).hash.slice(3), YENI)).status).toBe(200);
    expect((await giris("ayse", YENI)).status).toBe(200);

    await dogrulanmisEkle(bora, "bora@okul.tr");
    const boraId = (await api.authStore.getAuthStore().idByAd("bora"))!;
    giden = [];
    const rb = await (await uret(yonetici, boraId, "E-postasına ulaşamıyor")).json();
    expect(rb.bildirildi).toBe(true);
    expect(giden.map((e) => [e.kime, e.konu])).toEqual([["bora@okul.tr", "Dersera: hesabın için şifre sıfırlama bağlantısı üretildi"]]);
    expect(giden[0].metin).not.toContain(rb.baglanti.split("#")[1]);
    const b = await (await api.ogretmen.GET(cerezli(new Request(`http://localhost/api/yonetim/ogretmenler/${boraId}`), yonetici), api.idParams(boraId))).json();
    expect(b.epostaDogrulanmis).toBe(true);
    expect(JSON.stringify(b)).not.toContain("bora@okul.tr");

    const islemler = (await (await api.ogretmenler.GET(cerezli(new Request("http://localhost/api/yonetim/ogretmenler"), yonetici))).json()).islemler;
    expect(islemler.slice(0, 2).map((i: { islem: string; hedef: string }) => [i.islem, i.hedef])).toEqual([
      ["sifirlama-baglantisi", "bora"],
      ["sifirlama-baglantisi", "ayse"],
    ]);
  });
});

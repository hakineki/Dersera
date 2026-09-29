import { getUniteler } from "@/data/mufredat/programlar";
import { ASKIDA, oturumAc, oturumHesabi } from "@/lib/auth";
import { createMemoryAuthStore, createRedisAuthStore } from "@/lib/authStore";
import { hashToken } from "@/lib/gamesService";
import { buildApi, cerezli, hesapAc, jsonRequest } from "./helpers/api";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";
import { clearRedisEnv } from "./helpers/fakeRedis";
import { createLuaRedis } from "./helpers/luaRedis";

const SIFRE = "gizli-sifre-1";
const girdi = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const dersler = [{ ders: "fizik" as const, konuId: getUniteler(10, "fizik")[0].id }];

describe("askı ve oturum", () => {
  it("askıdaki hesabın oturumu yok; askıdan önce açılan oturum geri açıldıktan sonra da geçersiz, yenisi geçerli", async () => {
    const s = createMemoryAuthStore();
    const h = { id: "a".repeat(24), kullaniciAdi: "ayse", sifreOzeti: "x", surum: 1, olusturma: 1 };
    await s.olustur(h);
    const eski = await oturumAc(s, h, 1_000);
    expect(await oturumHesabi(s, eski)).toMatchObject({ id: h.id });
    await s.askiYaz(h.id, { askida: true, zaman: 2_000, neden: "n" });
    expect(await oturumHesabi(s, eski)).toBeNull();
    await s.askiYaz(h.id, { askida: false, zaman: 2_000, neden: "" });
    expect(await oturumHesabi(s, eski)).toBeNull();
    const yeni = await oturumAc(s, (await s.hesap(h.id))!, 3_000);
    expect(await oturumHesabi(s, yeni)).toMatchObject({ id: h.id });
  });

  it("eski oturum (açılış zamanı yok): askı hiç olmadıysa geçerli, askı olduysa geri açılsa da geçersiz", async () => {
    const s = createMemoryAuthStore();
    const h = { id: "b".repeat(24), kullaniciAdi: "bora", sifreOzeti: "x", surum: 1, olusturma: 1 };
    await s.olustur(h);
    const belirtec = "eski-belirtec";
    await s.oturumYaz(await hashToken(belirtec), { id: h.id, surum: 1 }, 60_000);
    expect(await oturumHesabi(s, belirtec)).toMatchObject({ id: h.id });
    await s.askiYaz(h.id, { askida: false, zaman: 5, neden: "" });
    expect(await oturumHesabi(s, belirtec)).toBeNull();
  });

  it("Redis: askı betiği hesap yoksa yazmaz; liste tarama ve toplu okumayla", async () => {
    const { command } = createLuaRedis();
    const s = createRedisAuthStore(command);
    expect(await s.askiYaz("yok", { askida: true, zaman: 1, neden: "n" })).toBe(false);
    expect(await command(["GET", "dersera:hesap:yok:aski"])).toBeNull();
    await s.olustur({ id: "h1", kullaniciAdi: "ayse", sifreOzeti: "x", surum: 1, olusturma: 1 });
    await s.olustur({ id: "h2", kullaniciAdi: "bora", sifreOzeti: "y", surum: 1, olusturma: 2 });
    expect(await s.askiYaz("h2", { askida: true, zaman: 5, neden: "n" })).toBe(true);
    const liste = await s.hesaplar();
    expect([...liste].sort((a, b) => a.olusturma - b.olusturma)).toEqual([
      { id: "h1", kullaniciAdi: "ayse", olusturma: 1 },
      { id: "h2", kullaniciAdi: "bora", olusturma: 2, aski: { askida: true, zaman: 5, neden: "n" } },
    ]);
    expect(await s.hesapSil("h2", "bora")).toBe(true);
    expect(await command(["GET", "dersera:hesap:h2:aski"])).toBeNull();
  });
});

describe("öğretmen yönetimi uçları", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  let yonetici: string;
  let ayse: string;
  let bora: string;
  let ayseId: string;
  let boraId: string;
  let yoneticiId: string;
  const eskiYoneticiler = process.env.DERSERA_YONETICILER;

  beforeEach(async () => {
    clearRedisEnv();
    process.env.DERSERA_YONETICILER = "platform1";
    api = await buildApi();
    yonetici = await hesapAc(api, "platform1");
    ayse = await hesapAc(api, "ayse");
    bora = await hesapAc(api, "bora");
    const auth = api.authStore.getAuthStore();
    [ayseId, boraId, yoneticiId] = [(await auth.idByAd("ayse"))!, (await auth.idByAd("bora"))!, (await auth.idByAd("platform1"))!];
  });
  afterAll(() => {
    if (eskiYoneticiler === undefined) delete process.env.DERSERA_YONETICILER;
    else process.env.DERSERA_YONETICILER = eskiYoneticiler;
  });

  const liste = (c: string | null, q = "") => api.ogretmenler.GET(cerezli(new Request(`http://localhost/api/yonetim/ogretmenler${q ? `?q=${q}` : ""}`), c));
  const ayrinti = (c: string | null, id: string) => api.ogretmen.GET(cerezli(new Request(`http://localhost/api/yonetim/ogretmenler/${id}`), c), api.idParams(id));
  const aski = (c: string | null, id: string, govde: unknown) => api.ogretmenAski.POST(cerezli(jsonRequest(`/api/yonetim/ogretmenler/${id}/aski`, govde), c), api.idParams(id));
  const sil = (c: string | null, id: string, govde: Record<string, unknown>) =>
    api.ogretmenSil.POST(cerezli(jsonRequest(`/api/yonetim/ogretmenler/${id}/sil`, { sifre: SIFRE, neden: "KVKK talebi", ...govde }), c), api.idParams(id));
  const ben = async (c: string) => (await (await api.ben.GET(cerezli(new Request("http://localhost/api/auth/ben"), c))).json()).hesap;
  const giris = (ad: string, sifre = SIFRE) => api.giris.POST(jsonRequest("/api/auth/giris", { kullaniciAdi: ad, sifre }));

  it("yalnız platform yöneticisi: oturumsuz 401, öğretmen 403; başka kökenden yazma 403", async () => {
    for (const c of [null, ayse]) {
      const beklenen = c ? 403 : 401;
      expect((await liste(c)).status).toBe(beklenen);
      expect((await ayrinti(c, boraId)).status).toBe(beklenen);
      expect((await aski(c, boraId, { askida: true, neden: "deneme" })).status).toBe(beklenen);
      expect((await sil(c, boraId, { kullaniciAdi: "bora" })).status).toBe(beklenen);
    }
    const req = cerezli(jsonRequest(`/api/yonetim/ogretmenler/${boraId}/aski`, { askida: true, neden: "deneme" }), yonetici);
    req.headers.set("sec-fetch-site", "cross-site");
    expect((await api.ogretmenAski.POST(req, api.idParams(boraId))).status).toBe(403);
    expect(await ben(bora)).not.toBeNull();
  });

  it("liste ve arama; ayrıntıda okul, rol, kredi ve oyun sayısı; şifre özeti dönmez", async () => {
    const tum = await (await liste(yonetici)).json();
    expect(tum.toplam).toBe(3);
    expect(tum.ogretmenler.map((o: { kullaniciAdi: string }) => o.kullaniciAdi).sort()).toEqual(["ayse", "bora", "platform1"]);
    expect(JSON.stringify(tum)).not.toMatch(/sifreOzeti|scrypt/);
    const aranan = await (await liste(yonetici, "BOR")).json();
    expect([aranan.eslesen, aranan.ogretmenler[0].kullaniciAdi]).toEqual([1, "bora"]);

    expect((await api.okul.POST(cerezli(jsonRequest("/api/okul", { ad: "Deneme Lisesi" }), bora))).status).toBe(201);
    const a = await (await ayrinti(yonetici, boraId)).json();
    expect(a).toMatchObject({ kullaniciAdi: "bora", okul: { ad: "Deneme Lisesi", rol: "yonetici" }, kredi: { aylikKalan: 30, kazanilan: 0 }, oyunSayisi: 0, aski: null, platformYoneticisi: false });
    expect(JSON.stringify(a)).not.toMatch(/sifreOzeti|scrypt/);
    expect((await (await liste(yonetici, "bora")).json()).ogretmenler[0].okulAdi).toBe("Deneme Lisesi");
    expect((await ayrinti(yonetici, "f".repeat(24))).status).toBe(404);
    expect((await ayrinti(yonetici, "../x")).status).toBe(404);
  });

  it("askıya al: gerekçe zorunlu; oturumlar düşer, giriş 403 (yalnız doğru şifreyle); geri açınca eski oturum yine geçersiz, yeni giriş olur", async () => {
    expect((await aski(yonetici, ayseId, { askida: true, neden: "" })).status).toBe(422);
    expect((await aski(yonetici, ayseId, { askida: "evet", neden: "uygunsuz içerik" })).status).toBe(422);
    expect(await ben(ayse)).not.toBeNull();

    const r = await aski(yonetici, ayseId, { askida: true, neden: "uygunsuz içerik" });
    expect([r.status, await r.json()]).toEqual([200, { askida: true }]);
    expect(await ben(ayse)).toBeNull();
    const g = await giris("ayse");
    expect([g.status, (await g.json()).error]).toEqual([403, ASKIDA]);
    expect((await giris("ayse", "yanlis-sifre-9")).status).toBe(401);
    // Askıdayken doğru şifreyle denemeler kilitlemez: geri açılınca giriş yapılabilir.
    for (let i = 0; i < 12; i++) expect((await giris("ayse")).status).toBe(403);
    expect((await aski(yonetici, ayseId, { askida: true, neden: "tekrar" })).status).toBe(409);
    expect((await (await liste(yonetici, "ayse")).json()).ogretmenler[0].askida).toBe(true);
    expect(await (await ayrinti(yonetici, ayseId)).json()).toMatchObject({ aski: { askida: true, neden: "uygunsuz içerik" } });
    // Başka öğretmen etkilenmez.
    expect(await ben(bora)).toMatchObject({ kullaniciAdi: "bora" });

    expect((await aski(yonetici, ayseId, { askida: false })).status).toBe(200);
    expect((await aski(yonetici, ayseId, { askida: false })).status).toBe(409);
    expect(await ben(ayse)).toBeNull();
    const yeni = await giris("ayse");
    expect(yeni.status).toBe(200);
    expect(await ben(yeni.headers.get("set-cookie")!.split(";")[0])).toMatchObject({ kullaniciAdi: "ayse" });

    const islemler = (await (await liste(yonetici)).json()).islemler;
    expect(islemler.map((i: { islem: string; hedef: string; yonetici: string }) => [i.islem, i.hedef, i.yonetici])).toEqual([
      ["geri-ac", "ayse", "platform1"],
      ["askiya-al", "ayse", "platform1"],
    ]);
  });

  it("askıdaki okul yöneticisinin okulu ve üyeleri etkilenmez", async () => {
    const kod = (await (await api.okul.POST(cerezli(jsonRequest("/api/okul", { ad: "Deneme Lisesi" }), bora))).json()).okul.davetKodu;
    expect((await api.okulKatil.POST(cerezli(jsonRequest("/api/okul/katil", { kod }), ayse))).status).toBe(200);
    expect((await aski(yonetici, boraId, { askida: true, neden: "deneme askısı" })).status).toBe(200);
    expect(await ben(bora)).toBeNull();
    const okul = await api.okul.GET(cerezli(new Request("http://localhost/api/okul"), ayse));
    expect(okul.status).toBe(200);
    expect(JSON.stringify(await okul.json())).toContain("Deneme Lisesi");
  });

  it("kendisi ve başka platform yöneticisi askıya alınamaz, silinemez", async () => {
    process.env.DERSERA_YONETICILER = "platform1,bora";
    expect(await ben(bora)).not.toBeNull();
    expect((await aski(yonetici, yoneticiId, { askida: true, neden: "kendim" })).status).toBe(409);
    expect((await aski(yonetici, boraId, { askida: true, neden: "diğer yönetici" })).status).toBe(409);
    expect((await sil(yonetici, boraId, { kullaniciAdi: "bora" })).status).toBe(409);
    expect((await sil(yonetici, yoneticiId, { kullaniciAdi: "platform1" })).status).toBe(409);
    expect(await ben(bora)).not.toBeNull();
    expect(await ben(yonetici)).not.toBeNull();
  });

  it("sil: yönetici şifresi, gerekçe ve ad onayı ister; okul yöneticisi silinmez; silinince oturum düşer, ad boşa çıkar, kayıtta ad kalmaz", async () => {
    expect((await sil(yonetici, ayseId, { kullaniciAdi: "ayse", sifre: "yanlis-sifre-9" })).status).toBe(403);
    expect((await sil(yonetici, ayseId, { kullaniciAdi: "ayse", neden: "" })).status).toBe(422);
    expect((await sil(yonetici, ayseId, { kullaniciAdi: "bora" })).status).toBe(422);
    expect(await ben(ayse)).not.toBeNull();

    expect((await api.okul.POST(cerezli(jsonRequest("/api/okul", { ad: "Deneme Lisesi" }), bora))).status).toBe(201);
    const okulYoneticisi = await sil(yonetici, boraId, { kullaniciAdi: "bora" });
    expect([okulYoneticisi.status, (await okulYoneticisi.json()).error]).toEqual([409, "Bu öğretmen bir okulun yöneticisi: önce okulun yöneticiliğini devret ya da okulu kapat."]);

    const lib = await api.library.POST(cerezli(jsonRequest("/api/library", { definition: makeDefinition(girdi, 6), dersler }), ayse));
    expect(lib.status).toBe(201);
    const r = await sil(yonetici, ayseId, { kullaniciAdi: "  AYSE " });
    expect(r.status).toBe(200);
    expect(await ben(ayse)).toBeNull();
    expect(await api.authStore.getAuthStore().hesap(ayseId)).toBeNull();
    expect(await api.libraryStore.getLibraryStore().count(`hesap:${ayseId}`)).toBe(0);
    expect((await sil(yonetici, ayseId, { kullaniciAdi: "ayse" })).status).toBe(404);
    // Ad boşa çıktı; işlem kaydında silinen hesabın adı yok.
    await hesapAc(api, "ayse");
    const islemler = (await (await liste(yonetici)).json()).islemler;
    expect(islemler[0]).toMatchObject({ islem: "sil", hedef: null, yonetici: "platform1", neden: "KVKK talebi" });
    expect(JSON.stringify(await api.yonetimIslemKaydi.getYonetimIslemKaydiStore().son(10))).not.toMatch(/ayse/);
  });

  it("yöneticinin yanlış şifre denemeleri sınırlanır", async () => {
    for (let i = 0; i < 10; i++) expect((await sil(yonetici, ayseId, { kullaniciAdi: "ayse", sifre: "yanlis-sifre-9" })).status).toBe(403);
    expect((await sil(yonetici, ayseId, { kullaniciAdi: "ayse" })).status).toBe(429);
    expect(await ben(ayse)).not.toBeNull();
  });
});

import { getUniteler } from "@/data/mufredat/programlar";
import { createRedisOkulStore } from "@/lib/okulStore";
import { buildApi, cerezli, hesapAc, jsonRequest } from "./helpers/api";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";
import { clearRedisEnv } from "./helpers/fakeRedis";
import { createLuaRedis } from "./helpers/luaRedis";

const SIFRE = "gizli-sifre-1";
const girdi = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const dersler = [{ ders: "fizik" as const, konuId: getUniteler(10, "fizik")[0].id }];

describe("okul deposu Lua betikleri (mini-Redis)", () => {
  it("davet yenileme kaydın diğer alanlarını korur (devredilmiş yönetici geri dönmez)", async () => {
    const { command } = createLuaRedis();
    const s = createRedisOkulStore(command);
    const [y, o1] = ["a".repeat(24), "b".repeat(24)];
    const okul = { id: "11111111-2222-4333-8444-666666666666", ad: "Lise", olusturma: 1, olusturan: y, davetKodu: "KODKOD11" };
    await s.olustur(okul, { hesapId: y, rol: "yonetici", katilma: 1 });
    await s.katil(okul.id, { hesapId: o1, rol: "ogretmen", katilma: 2 });
    expect(await s.yoneticiDevret(okul.id, y, o1)).toBe(true);
    // Eski yöneticinin devirden önce okuduğu kayıtla yenileme: yalnız kod değişir, yönetici o1 kalır.
    expect(await s.davetYenile(okul, "KODKOD22")).toBe("ok");
    expect(await s.get(okul.id)).toEqual({ ...okul, olusturan: o1, davetKodu: "KODKOD22" });
    expect([await s.davettenOkul("KODKOD11"), await s.davettenOkul("KODKOD22")]).toEqual([null, okul.id]);
    expect(await s.davetYenile(okul, "KODKOD33")).toBe("degisti");
  });

  it("devir rolleri ve okul yöneticisini değiştirir, koşul tutmazsa yazmaz; kapatma kaydı işaretler, katılma ve paylaşma kapanır", async () => {
    const { command } = createLuaRedis();
    const s = createRedisOkulStore(command);
    const okul = { id: "11111111-2222-4333-8444-555555555555", ad: 'Atatürk "Fen" Lisesi', olusturma: 1, olusturan: "a".repeat(24), davetKodu: "ABCDEFGH" };
    const [y, o1, o2] = ["a".repeat(24), "b".repeat(24), "c".repeat(24)];
    expect(await s.olustur(okul, { hesapId: y, rol: "yonetici", katilma: 1 })).toBe(true);
    expect(await s.katil(okul.id, { hesapId: o1, rol: "ogretmen", katilma: 2 })).toBe("ok");
    expect(await s.okulIdleri()).toEqual([okul.id]);

    expect(await s.yoneticiDevret(okul.id, y, o2)).toBe(false);
    expect(await s.yoneticiDevret(okul.id, o1, y)).toBe(false);
    expect(await s.yoneticiDevret(okul.id, y, o1)).toBe(true);
    expect(Object.fromEntries((await s.uyeler(okul.id)).map((u) => [u.hesapId, u]))).toEqual({
      [y]: { hesapId: y, rol: "ogretmen", katilma: 1 },
      [o1]: { hesapId: o1, rol: "yonetici", katilma: 2 },
    });
    expect(await s.get(okul.id)).toEqual({ ...okul, olusturan: o1 });

    const guncel = (await s.get(okul.id))!;
    expect(await s.kapatmaBaslat(okul)).toBe(false);
    expect(await s.kapatmaBaslat(guncel)).toBe(true);
    expect(await s.kapatmaBaslat(guncel)).toBe(true);
    expect(await s.get(okul.id)).toEqual({ ...guncel, kapaniyor: true });
    expect(await s.davettenOkul(okul.davetKodu)).toBeNull();
    // Kapatmadan önce okunmuş kayıtla davet yenilemesi okulu yeniden açmaz ve kodu yazmaz.
    expect(await s.davetYenile(guncel, "YYYYYYYY")).toBe("yok");
    expect(await s.get(okul.id)).toEqual({ ...guncel, kapaniyor: true });
    expect(await s.davettenOkul("YYYYYYYY")).toBeNull();
    expect(await s.katil(okul.id, { hesapId: o2, rol: "ogretmen", katilma: 3 })).toBe("yok");
    const pay = { id: "p1", kaynak: `hesap:${o1}:k`, paylasan: o1, baslik: "B", sinif: 6, ders: "Fen", konu: "K", sure_dk: 40, tarih: 1, definition: makeDefinition(girdi, 6), dersler };
    expect(await s.paylas(okul.id, pay)).toBe("yok");
    await s.kapatmaBitir(okul.id);
    expect(await s.get(okul.id)).toBeNull();
    expect(await s.okulIdleri()).toEqual([]);
  });
});

describe("okul yönetimi uçları", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  let yonetici: string;
  let ayse: string;
  let bora: string;
  let ayseId: string;
  let boraId: string;
  let okulId: string;
  let davetKodu: string;
  const eskiYoneticiler = process.env.DERSERA_YONETICILER;

  beforeEach(async () => {
    clearRedisEnv();
    process.env.DERSERA_YONETICILER = "platform1";
    api = await buildApi();
    yonetici = await hesapAc(api, "platform1");
    ayse = await hesapAc(api, "ayse");
    bora = await hesapAc(api, "bora");
    const auth = api.authStore.getAuthStore();
    [ayseId, boraId] = [(await auth.idByAd("ayse"))!, (await auth.idByAd("bora"))!];
    davetKodu = (await (await api.okul.POST(cerezli(jsonRequest("/api/okul", { ad: "Deneme Lisesi" }), bora))).json()).okul.davetKodu;
    expect((await api.okulKatil.POST(cerezli(jsonRequest("/api/okul/katil", { kod: davetKodu }), ayse))).status).toBe(200);
    okulId = (await api.okulStore.getOkulStore().okulOf(boraId))!;
  });
  afterAll(() => {
    if (eskiYoneticiler === undefined) delete process.env.DERSERA_YONETICILER;
    else process.env.DERSERA_YONETICILER = eskiYoneticiler;
  });

  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const liste = (c: string | null) => api.okullar.GET(cerezli(new Request("http://localhost/api/yonetim/okullar"), c));
  const ayrinti = (c: string | null, id = okulId) => api.okulYonetim.GET(cerezli(new Request(`http://localhost/api/yonetim/okullar/${id}`), c), params(id));
  const devret = (c: string | null, govde: unknown, id = okulId) => api.okulDevret.POST(cerezli(jsonRequest(`/api/yonetim/okullar/${id}/devret`, govde), c), params(id));
  const kapat = (c: string | null, govde: Record<string, unknown>, id = okulId) =>
    api.okulKapat.POST(cerezli(jsonRequest(`/api/yonetim/okullar/${id}/kapat`, { okulAdi: "Deneme Lisesi", sifre: SIFRE, neden: "Okul talebi", ...govde }), c), params(id));
  const okulum = async (c: string) => (await api.okul.GET(cerezli(new Request("http://localhost/api/okul"), c))).json();
  const ogretmenSil = (id: string, kullaniciAdi: string) =>
    api.ogretmenSil.POST(cerezli(jsonRequest(`/api/yonetim/ogretmenler/${id}/sil`, { kullaniciAdi, sifre: SIFRE, neden: "Hesap kapatma" }), yonetici), api.idParams(id));

  it("yalnız platform yöneticisi: oturumsuz 401, öğretmen 403; başka kökenden yazma 403; bozuk kimlik 404", async () => {
    for (const c of [null, bora]) {
      const beklenen = c ? 403 : 401;
      expect((await liste(c)).status).toBe(beklenen);
      expect((await ayrinti(c)).status).toBe(beklenen);
      expect((await devret(c, { hesapId: ayseId, neden: "deneme" })).status).toBe(beklenen);
      expect((await kapat(c, {})).status).toBe(beklenen);
    }
    const req = cerezli(jsonRequest(`/api/yonetim/okullar/${okulId}/devret`, { hesapId: ayseId, neden: "deneme" }), yonetici);
    req.headers.set("sec-fetch-site", "cross-site");
    expect((await api.okulDevret.POST(req, params(okulId))).status).toBe(403);
    expect((await ayrinti(yonetici, "../x")).status).toBe(404);
    expect((await ayrinti(yonetici, "11111111-2222-4333-8444-555555555555")).status).toBe(404);
    expect((await okulum(bora)).rol).toBe("yonetici");
  });

  it("liste ve ayrıntı: yönetici, üyeler ve rolleri, paylaşım ve havuz", async () => {
    await api.krediStore.getKrediStore().okulHakYaz(okulId, 200);
    const l = await (await liste(yonetici)).json();
    expect(l.okullar).toEqual([expect.objectContaining({ id: okulId, ad: "Deneme Lisesi", yonetici: "bora", uyeSayisi: 2, paylasimSayisi: 0, kapaniyor: false, havuz: { hak: 200, kullanilan: 0 } })]);
    const a = await (await ayrinti(yonetici)).json();
    expect(a.uyeler.map((u: { kullaniciAdi: string; rol: string }) => [u.kullaniciAdi, u.rol])).toEqual([
      ["bora", "yonetici"],
      ["ayse", "ogretmen"],
    ]);
    expect(JSON.stringify(a)).not.toContain(davetKodu);
  });

  it("devret: gerekçe ve öğretmen üye ister; eski yönetici öğretmen kalır, yeni yönetici davet kodunu görür; eski yönetici artık silinebilir", async () => {
    expect((await ogretmenSil(boraId, "bora")).status).toBe(409);
    expect((await devret(yonetici, { hesapId: ayseId, neden: "" })).status).toBe(422);
    expect((await devret(yonetici, { hesapId: (await api.authStore.getAuthStore().idByAd("platform1"))!, neden: "üye değil" })).status).toBe(422);
    expect((await devret(yonetici, { hesapId: boraId, neden: "zaten yönetici" })).status).toBe(409);

    const r = await devret(yonetici, { hesapId: ayseId, neden: "Yönetici okuldan ayrıldı" });
    expect([r.status, await r.json()]).toEqual([200, { yonetici: "ayse" }]);
    expect(await okulum(ayse)).toMatchObject({ rol: "yonetici", okul: { ad: "Deneme Lisesi", davetKodu } });
    expect(await okulum(bora)).toMatchObject({ rol: "ogretmen" });
    expect((await okulum(bora)).okul.davetKodu).toBeUndefined();
    expect((await api.okulStore.getOkulStore().get(okulId))!.olusturan).toBe(ayseId);

    expect((await ogretmenSil(boraId, "bora")).status).toBe(200);
    expect((await ayrinti(yonetici)).status).toBe(200);
    const islemler = (await (await liste(yonetici)).json()).islemler;
    expect(islemler.map((i: { islem: string; hedef: string | null; okulAdi: string | null }) => [i.islem, i.hedef, i.okulAdi])).toEqual([
      ["sil", null, null],
      ["okul-devret", "ayse", "Deneme Lisesi"],
    ]);
  });

  it("kapat: şifre, gerekçe ve okul adı onayı; üyelikler, paylaşımlar, davet kodu ve havuz gider; hesaplar ve kütüphaneler kalır", async () => {
    const libId = (await (await api.library.POST(cerezli(jsonRequest("/api/library", { definition: makeDefinition(girdi, 6), dersler }), ayse))).json()).id as string;
    expect((await api.okulPaylasim.POST(cerezli(jsonRequest("/api/okul/paylasim", { kutuphaneId: libId }), ayse))).status).toBe(201);
    await api.krediStore.getKrediStore().okulHakYaz(okulId, 200);

    expect((await kapat(yonetici, { sifre: "yanlis-sifre-9" })).status).toBe(403);
    expect((await kapat(yonetici, { neden: "" })).status).toBe(422);
    expect((await kapat(yonetici, { okulAdi: "Başka Lise" })).status).toBe(422);
    expect((await okulum(bora)).okul).not.toBeNull();

    const r = await kapat(yonetici, { okulAdi: "  deneme lisesi " });
    expect([r.status, await r.json()]).toEqual([200, { uye: 2, paylasim: 1 }]);
    expect(await okulum(bora)).toEqual({ okul: null });
    expect(await okulum(ayse)).toEqual({ okul: null });
    const os = api.okulStore.getOkulStore();
    expect([await os.get(okulId), await os.davettenOkul(davetKodu), await os.paylasimlar(okulId), await os.hesabinPaylasimlari(ayseId)]).toEqual([null, null, [], []]);
    expect(await api.krediStore.getKrediStore().okulHavuzlari("2026-09")).toEqual([]);
    // Hesaplar ve kişisel kütüphane kalır; eski davet kodu çalışmaz; yeni okul açılabilir; eski yönetici silinebilir.
    expect(await api.libraryStore.getLibraryStore().count(`hesap:${ayseId}`)).toBe(1);
    expect((await api.okulKatil.POST(cerezli(jsonRequest("/api/okul/katil", { kod: davetKodu }), ayse))).status).toBe(404);
    expect((await api.okul.POST(cerezli(jsonRequest("/api/okul", { ad: "Yeni Okul" }), ayse))).status).toBe(201);
    expect((await ogretmenSil(boraId, "bora")).status).toBe(200);
    expect((await (await liste(yonetici)).json()).okullar.map((o: { ad: string }) => o.ad)).toEqual(["Yeni Okul"]);
    const islemler = (await (await liste(yonetici)).json()).islemler;
    expect(islemler[1]).toMatchObject({ islem: "okul-kapat", okulAdi: "Deneme Lisesi", neden: "Okul talebi", yonetici: "platform1" });
    expect((await kapat(yonetici, {})).status).toBe(404);
  });

  it("yarım kalan kapatma listede 'kapatılıyor' görünür; bu arada katılma, paylaşma ve okul uçları kapalıdır; yeniden çalıştırılınca tamamlanır", async () => {
    const os = api.okulStore.getOkulStore();
    expect(await os.kapatmaBaslat((await os.get(okulId))!)).toBe(true);
    expect((await (await liste(yonetici)).json()).okullar[0]).toMatchObject({ kapaniyor: true });
    expect(await okulum(bora)).toEqual({ okul: null });
    expect((await api.okulDavet.POST(cerezli(jsonRequest("/api/okul/davet", {}), bora))).status).toBe(404);
    expect((await devret(yonetici, { hesapId: ayseId, neden: "kapanıyor" })).status).toBe(404);
    const r = await kapat(yonetici, {});
    expect([r.status, await r.json()]).toEqual([200, { uye: 2, paylasim: 0 }]);
    expect(await os.get(okulId)).toBeNull();
    expect(await os.okulOf(ayseId)).toBeNull();
  });
});

import { ayOf, OKUL_HAVUZU } from "@/lib/kredi";
import { buildApi, cerezli, hesapAc, jsonRequest } from "./helpers/api";
import { clearRedisEnv } from "./helpers/fakeRedis";

// Okul kredi havuzu: platform yöneticisi havuz atar, okul yöneticisi öğretmen başına sınır koyar; harcama sırası
// kişisel aylık → okul havuzu → kazanılan.
describe("okul kredi havuzu", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  let platform: string;
  let yonetici: string;
  let ogretmen: string;
  let yabanci: string;
  let kod: string;
  const eskiYoneticiler = process.env.DERSERA_YONETICILER;

  beforeEach(async () => {
    clearRedisEnv();
    process.env.DERSERA_YONETICILER = "platform1";
    api = await buildApi();
    platform = await hesapAc(api, "platform1");
    yonetici = await hesapAc(api, "yonetici1");
    ogretmen = await hesapAc(api, "ogretmen1");
    yabanci = await hesapAc(api, "yabanci1");
    kod = (await (await api.okul.POST(cerezli(jsonRequest("/api/okul", { ad: "Atatürk Ortaokulu" }), yonetici))).json()).okul.davetKodu;
    expect((await api.okulKatil.POST(cerezli(jsonRequest("/api/okul/katil", { kod }), ogretmen))).status).toBe(200);
  });
  afterAll(() => {
    if (eskiYoneticiler === undefined) delete process.env.DERSERA_YONETICILER;
    else process.env.DERSERA_YONETICILER = eskiYoneticiler;
  });

  const istek = (method: string, body: unknown, c: string | null) =>
    cerezli(new Request("http://localhost/api/yonetim/okul-havuzu", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), c);
  const liste = (c: string | null) => api.yonetimHavuzu.GET(cerezli(new Request("http://localhost/api/yonetim/okul-havuzu"), c));
  const bul = (k: string, c: string | null = platform) => api.yonetimHavuzu.POST(istek("POST", { kod: k }, c));
  const ata = (okulId: unknown, hak: unknown, c: string | null = platform) => api.yonetimHavuzu.PUT(istek("PUT", { okulId, hak }, c));
  const sinirKoy = (sinir: unknown, c = yonetici) => api.okulKredi.POST(cerezli(jsonRequest("/api/okul/kredi", { sinir }), c));
  const pano = async () => (await api.okulPano.GET(cerezli(new Request("http://localhost/api/okul/pano"), yonetici))).json();
  const hesapId = async (ad: string) => (await api.authStore.getAuthStore().idByAd(ad))!;
  const okulId = async () => (await (await bul(kod)).json()).okul.okulId as string;
  const krediOku = async (c: string) => (await api.kredi.GET(cerezli(new Request("http://localhost/api/kredi"), c))).json();

  it("yalnız platform yöneticisi: oturumsuz 401, okul yöneticisi dahil diğerleri 403; başka kökenden yazma reddedilir", async () => {
    expect((await liste(null)).status).toBe(401);
    for (const c of [yonetici, ogretmen, yabanci]) {
      expect((await liste(c)).status).toBe(403);
      expect((await bul(kod, c)).status).toBe(403);
      expect((await ata("x", 5, c)).status).toBe(403);
    }
    const disaridan = istek("PUT", { okulId: await okulId(), hak: 5 }, platform);
    disaridan.headers.set("sec-fetch-site", "cross-site");
    expect((await api.yonetimHavuzu.PUT(disaridan)).status).toBe(403);
    expect((await (await liste(platform)).json()).okullar).toEqual([]);
  });

  it("davet koduyla okul bulunur, havuz atanır, listelenir ve kaldırılır; geçersiz değerler reddedilir", async () => {
    const r = await bul(kod.toLowerCase().replace(/^(.{4})/, "$1-"));
    expect(r.status).toBe(200);
    const { okul } = await r.json();
    expect(okul).toMatchObject({ ad: "Atatürk Ortaokulu", uyeSayisi: 2, hak: 0, kullanilan: 0 });
    expect((await bul("ZZZZZZZZ")).status).toBe(404);

    for (const hak of [-1, 1.5, "10", OKUL_HAVUZU.hakEnCok + 1, null]) expect((await ata(okul.okulId, hak)).status).toBe(422);
    expect((await ata("00000000-0000-0000-0000-000000000000", 5)).status).toBe(404);
    expect((await ata("../../x", 5)).status).toBe(404);

    const a = await ata(okul.okulId, 20);
    expect(a.status).toBe(200);
    expect((await a.json()).okul).toMatchObject({ okulId: okul.okulId, ad: "Atatürk Ortaokulu", hak: 20, kullanilan: 0 });
    expect(await (await liste(platform)).json()).toEqual({ ay: ayOf(Date.now()), okullar: [{ okulId: okul.okulId, ad: "Atatürk Ortaokulu", hak: 20, kullanilan: 0 }] });
    expect((await ata(okul.okulId, 0)).status).toBe(200);
    expect((await (await liste(platform)).json()).okullar).toEqual([]);
  });

  it("öğretmen sınırını yalnız okul yöneticisi koyar; üye olmayan 404; geçersiz değer 422", async () => {
    expect((await sinirKoy(5, ogretmen)).status).toBe(403);
    expect((await sinirKoy(5, yabanci)).status).toBe(404);
    for (const s of [-1, 2.5, "5", OKUL_HAVUZU.sinirEnCok + 1]) expect((await sinirKoy(s)).status).toBe(422);
    expect(await (await sinirKoy(5)).json()).toEqual({ sinir: 5 });
    expect(await (await sinirKoy(0)).json()).toEqual({ sinir: null });
  });

  it("harcama sırası kişisel aylık → okul havuzu → kazanılan; sınır ve havuz aşılamaz; pano ve bakiye havuzu gösterir", async () => {
    expect((await ata(await okulId(), 10)).status).toBe(200);
    expect((await sinirKoy(4)).status).toBe(200);
    const id = await hesapId("ogretmen1");
    const k = api.krediService;

    expect(await k.krediHarca(id, 30, "aylık")).toMatchObject({ aylik: 30, okul: 0, kazanilan: 0 });
    expect(await k.krediHarca(id, 3, "havuz")).toMatchObject({ aylik: 0, okul: 3, kazanilan: 0 });
    expect(await krediOku(ogretmen)).toMatchObject({
      aylikKalan: 0,
      okul: { havuzHak: 10, havuzKalan: 7, sinir: 4, kullandigin: 3, kalan: 1 },
      kazanilan: 0,
      toplam: 1,
    });
    // Sınırda 1 kaldı: 2 kredilik harcama yapılamaz, hiçbir şey düşmez.
    expect(await k.krediHarca(id, 2, "fazla")).toBeNull();
    await api.krediStore.getKrediStore().odul(id, 5, Date.now(), "ödül");
    expect(await k.krediHarca(id, 2, "karışık")).toMatchObject({ aylik: 0, okul: 1, kazanilan: 1 });

    const p = await pano();
    expect(p.havuz).toEqual({ ay: ayOf(Date.now()), hak: 10, kullanilan: 4, kalan: 6, sinir: 4 });
    expect(p.ogretmenler.find((o: { kullaniciAdi: string }) => o.kullaniciAdi === "ogretmen1").havuzdan).toBe(4);
    expect(p.ogretmenler.find((o: { kullaniciAdi: string }) => o.kullaniciAdi === "yonetici1").havuzdan).toBe(0);
    // Okul yöneticisi de havuzdan kullanır (kendi aylık hakkı bitince).
    expect((await krediOku(yonetici)).okul).toMatchObject({ kalan: 4 });
    // Üye olmayan havuzu görmez.
    expect((await krediOku(yabanci)).okul).toBeNull();
  });

  it("okuldan ayrılan öğretmen havuzu kullanamaz; askıdaki havuz harcaması ödeyen okula iade edilir", async () => {
    expect((await ata(await okulId(), 10)).status).toBe(200);
    const id = await hesapId("ogretmen1");
    const k = api.krediService;
    await k.krediHarca(id, 30, "aylık");
    const h = (await k.krediHarca(id, 3, "havuz"))!;
    expect(h.okul).toBe(3);
    expect((await api.okulAyril.POST(cerezli(jsonRequest("/api/okul/ayril", {}), ogretmen))).status).toBe(200);
    expect((await krediOku(ogretmen)).okul).toBeNull();
    expect(await k.krediHarca(id, 1, "ayrıldıktan sonra")).toBeNull();

    expect(await k.krediIade(id, h, "oluşturulamadı")).toBe(true);
    expect((await pano()).havuz).toMatchObject({ kullanilan: 0, kalan: 10 });
    expect((await krediOku(ogretmen)).hareketler[0]).toMatchObject({ tur: "iade", miktar: 3, okul: 3 });
  });

  it("eşzamanlı harcamalar öğretmen sınırını aşamaz", async () => {
    expect((await ata(await okulId(), 100)).status).toBe(200);
    expect((await sinirKoy(2)).status).toBe(200);
    const id = await hesapId("ogretmen1");
    await api.krediService.krediHarca(id, 30, "aylık");
    const sonuclar = await Promise.all(Array.from({ length: 5 }, () => api.krediService.krediHarca(id, 1, "eşzamanlı")));
    expect(sonuclar.filter(Boolean)).toHaveLength(2);
    expect((await pano()).havuz).toMatchObject({ kullanilan: 2 });
  });
});

import { getUniteler } from "@/data/mufredat/programlar";
import { splitAnswer } from "@/lib/composer/answers";
import { karistir, secenekleriKaristir } from "@/lib/karistir";
import { buildApi, cerezli, hesapAc, jsonRequest, toplulugaKoy } from "./helpers/api";
import { GUNLUK_ACMA } from "@/app/api/topluluk/[id]/route";
import { KOSUL_SURUMU } from "@/lib/kosullar";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";
import { clearRedisEnv } from "./helpers/fakeRedis";

describe("seçenek karıştırma", () => {
  const secenekler = ["Güneş", "Ay", "Mars", "Venüs", "Jüpiter"];

  it("aynı tohumla aynı sıra, farklı öğrencide farklı sıra; öğeler korunur", () => {
    const a = karistir(secenekler, "ABC-123:kartal:d1");
    expect(karistir(secenekler, "ABC-123:kartal:d1")).toEqual(a);
    expect([...a].sort()).toEqual([...secenekler].sort());
    const farkli = ["serce", "baykus", "kartal2", "atmaca", "sahin", "turna"].map((ad) => karistir(secenekler, `ABC-123:${ad}:d1`).join("|"));
    expect(new Set([a.join("|"), ...farkli]).size).toBeGreaterThan(3);
    expect(secenekler).toEqual(["Güneş", "Ay", "Mars", "Venüs", "Jüpiter"]);
  });

  it("sıralama görevi çözülmüş sırayla başlamaz; sayısal görevde seçenek değişmez", () => {
    const dogru = "1 | 2 | 3";
    for (let i = 0; i < 200; i++) {
      const k = secenekleriKaristir("siralama", ["1", "2", "3"], dogru, `t${i}`);
      expect(k).not.toEqual(splitAnswer(dogru));
      expect([...k].sort()).toEqual(["1", "2", "3"]);
    }
    expect(secenekleriKaristir("sayisal", [], "42", "t")).toEqual([]);
  });
});

describe("oyun içeriği yalnız katılana ve oyun sürerken", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  beforeEach(async () => {
    clearRedisEnv();
    api = await buildApi();
  });

  const yayinla = async () => {
    const girdi = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
    const def = makeDefinition(girdi, 7);
    const res = await api.games.POST(jsonRequest("/api/games", { composer: { definition: def, dersler: [{ ders: "fizik", konuId: getUniteler(10, "fizik")[0].id }] } }));
    expect(res.status).toBe(201);
    return (await res.json()) as { game: { code: string }; adminToken: string };
  };
  const oku = async (kod: string, oyuncu?: { ad: string; anahtar: string }) =>
    (
      await api.game.GET(
        new Request("http://localhost", oyuncu ? { headers: { "x-oyuncu-adi": encodeURIComponent(oyuncu.ad), "x-oyuncu-anahtari": oyuncu.anahtar } } : undefined),
        api.params(kod)
      )
    ).json();
  const katil = async (kod: string, ad: string) => ((await (await api.join.POST(jsonRequest("/join", { nickname: ad }), api.params(kod))).json()) as { playerToken: string }).playerToken;

  it("kod bilen ama katılmamış biri, yanlış anahtar ya da başka oyuncunun adı içerik alamaz; katılan alır", async () => {
    const { game } = await yayinla();
    const anon = await oku(game.code);
    expect(anon.game.definition).toBeUndefined();
    expect(anon.game.icerikKilitli).toBe(true);
    expect(JSON.stringify(anon)).not.toMatch(/dogru_cevap|ipucu/);

    const anahtar = await katil(game.code, "Şahin");
    expect((await oku(game.code, { ad: "Şahin", anahtar })).game.definition.duraklar.length).toBe(7);
    expect((await oku(game.code, { ad: "Şahin", anahtar: "yanlis" })).game.definition).toBeUndefined();
    expect((await oku(game.code, { ad: "Kartal", anahtar })).game.definition).toBeUndefined();
    // Başka oyunun anahtarı bu oyunda geçmez.
    const { game: baska } = await yayinla();
    expect((await oku(baska.code, { ad: "Şahin", anahtar })).game.definition).toBeUndefined();
  });

  it("oyun bitince katılmış oyuncuya da içerik gönderilmez", async () => {
    const { game, adminToken } = await yayinla();
    const anahtar = await katil(game.code, "Kartal");
    const bitir = await api.end.POST(
      new Request(`http://localhost/api/games/${game.code}/end`, { method: "POST", headers: { "Content-Type": "application/json", authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ adminToken }) }),
      api.params(game.code)
    );
    expect(bitir.status).toBeLessThan(300);
    const r = await oku(game.code, { ad: "Kartal", anahtar });
    expect(r.active).toBe(false);
    expect(r.game.definition).toBeUndefined();
  });
});

describe("öğretmen tarafı: koşul onayı, topluluk açma sınırı, kopya kaydı", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  const eskiYoneticiler = process.env.DERSERA_YONETICILER;
  beforeEach(async () => {
    clearRedisEnv();
    process.env.DERSERA_YONETICILER = "platform1";
    api = await buildApi();
  });
  afterAll(() => {
    if (eskiYoneticiler === undefined) delete process.env.DERSERA_YONETICILER;
    else process.env.DERSERA_YONETICILER = eskiYoneticiler;
  });
  const fizik = () => makeDefinition(resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" }), 7);
  const dersler = () => [{ ders: "fizik", konuId: getUniteler(10, "fizik")[0].id }];
  const ac = (id: string, c: string) => api.toplulukOyun.GET(cerezli(new Request(`http://localhost/api/topluluk/${id}`), c), api.idParams(id));

  it("kullanım koşulları onaylanmadan hesap açılmaz; onay sürümüyle kaydedilir", async () => {
    const r = await api.kayit.POST(jsonRequest("/api/auth/kayit", { kullaniciAdi: "ogretmen9", sifre: "gizli-sifre-1" }));
    expect(r.status).toBe(422);
    expect((await r.json()).error).toMatch(/kullanım koşullarını onaylaman/);
    expect((await api.kayit.POST(jsonRequest("/api/auth/kayit", { kullaniciAdi: "ogretmen9", sifre: "gizli-sifre-1", kosulOnayi: "evet" }))).status).toBe(422);
    const c = await hesapAc(api, "ogretmen9");
    expect(c).toBeTruthy();
    const id = (await api.authStore.getAuthStore().idByAd("ogretmen9"))!;
    expect(await api.denetimKaydi.getDenetimKaydiStore().kosulOnayi(id)).toMatchObject({ surum: KOSUL_SURUMU });
  });

  it(`başkasının topluluk oyunu günde en çok ${GUNLUK_ACMA} kez açılır ve her açılış kayda geçer; kendi oyunu sayılmaz`, async () => {
    const c = await hesapAc(api, "ogretmen1");
    const benimId = (await api.authStore.getAuthStore().idByAd("ogretmen1"))!;
    const baskasi = await toplulugaKoy(api, fizik(), dersler(), { olusturan: "hesap:baskasi" });
    const benim = await toplulugaKoy(api, { ...fizik(), hikaye_giris: "Kendi oyunum." }, dersler(), { olusturan: `hesap:${benimId}` });
    for (let i = 0; i < 25; i++) expect((await ac(benim, c)).status).toBe(200);
    for (let i = 0; i < GUNLUK_ACMA; i++) expect((await ac(baskasi, c)).status).toBe(200);
    const sinir = await ac(baskasi, c);
    expect(sinir.status).toBe(429);
    expect((await sinir.json()).error).toMatch(/Günde en çok 20/);
    const kayit = await api.denetimKaydi.getDenetimKaydiStore().kopyalar(100);
    expect(kayit).toHaveLength(GUNLUK_ACMA);
    expect(kayit[0]).toMatchObject({ hesapId: benimId, kullaniciAdi: "ogretmen1", tur: "topluluk", oyunId: baskasi });
  });

  it("kopya kaydı yalnız platform yöneticisine açık; öğretmen adına göre süzülür", async () => {
    const c = await hesapAc(api, "ogretmen1");
    const d = await hesapAc(api, "ogretmen2");
    const id = await toplulugaKoy(api, fizik(), dersler(), { olusturan: "hesap:baskasi" });
    await ac(id, c);
    await ac(id, d);
    const oku = async (cerez: string | null, q = "") => api.kopyaKaydi.GET(cerezli(new Request(`http://localhost/api/yonetim/kopya-kaydi${q}`), cerez));
    expect((await oku(null)).status).toBe(401);
    expect((await oku(c)).status).toBe(403);
    const yonetici = await hesapAc(api, "platform1");
    expect(((await (await oku(yonetici)).json()).kayitlar as unknown[]).length).toBe(2);
    const suz = (await (await oku(yonetici, "?ogretmen=OGRETMEN2")).json()).kayitlar as { kullaniciAdi: string }[];
    expect(suz.map((k) => k.kullaniciAdi)).toEqual(["ogretmen2"]);
  });
});

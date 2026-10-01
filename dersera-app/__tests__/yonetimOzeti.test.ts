import { saglikOf } from "@/lib/yonetimOzeti";
import { buildApi, cerezli, hesapAc, jsonRequest, toplulugaKoy } from "./helpers/api";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";
import { clearRedisEnv } from "./helpers/fakeRedis";
import { getUniteler } from "@/data/mufredat/programlar";

describe("yönetim genel bakışı", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  const eski = process.env.DERSERA_YONETICILER;
  beforeEach(async () => {
    clearRedisEnv();
    process.env.DERSERA_YONETICILER = "platform1";
    api = await buildApi();
  });
  afterAll(() => {
    if (eski === undefined) delete process.env.DERSERA_YONETICILER;
    else process.env.DERSERA_YONETICILER = eski;
  });

  const ozet = (c: string | null) => api.yonetimOzeti.GET(cerezli(new Request("http://localhost/api/yonetim/ozet"), c));

  it("yalnız platform yöneticisi görür: oturumsuz 401, öğretmen 403", async () => {
    expect((await ozet(null)).status).toBe(401);
    expect((await ozet(await hesapAc(api, "ogretmen1"))).status).toBe(403);
  });

  it("sayılar: öğretmen, okul, topluluk, moderasyon; ortam değişkeninin değeri değil yalnız varlığı döner", async () => {
    const platform = await hesapAc(api, "platform1");
    const ayse = await hesapAc(api, "ayse");
    await hesapAc(api, "bora");
    await api.okul.POST(cerezli(jsonRequest("/api/okul", { ad: "Deneme Lisesi" }), ayse));
    const girdi = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
    await toplulugaKoy(api, makeDefinition(girdi, 6), [{ ders: "fizik", konuId: getUniteler(10, "fizik")[0].id }]);
    const r = await ozet(platform);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const j = await r.json();
    expect(j.sayilar).toMatchObject({ ogretmen: 3, okul: 1, toplulukYayinda: 1, toplulukInceleme: 0, moderasyonBekleyen: 0, buAyUretim: 0 });
    expect(j.ay).toMatch(/^\d{4}-\d{2}$/);
    expect(Object.values(j.saglik).every((v) => typeof v === "boolean")).toBe(true);
    expect(JSON.stringify(j)).not.toMatch(/sk-|token/i);
  });

  it("sağlık: tanımlı/boş ortam değişkenleri, yapay zekâ için iki sağlayıcıdan biri yeter", () => {
    const eposta = { epostaAnahtari: false, epostaGonderen: false, siteAdresi: false };
    expect(saglikOf({}, false)).toEqual({ kaliciDepo: false, yapayZeka: false, gorselDepo: false, yedekAnahtari: false, zamanlayici: false, davetKodu: false, ...eposta });
    expect(saglikOf({ RESEND_API_KEY: "re", EPOSTA_GONDEREN: "g", DERSERA_SITE_ADRESI: " " }, false)).toMatchObject({ epostaAnahtari: true, epostaGonderen: true, siteAdresi: false });
    // Blob deposu: yeni bağlantıda yalnız BLOB_STORE_ID (OIDC), eskisinde BLOB_READ_WRITE_TOKEN; biri yeter.
    expect([saglikOf({ BLOB_STORE_ID: "store_x" }, true).gorselDepo, saglikOf({ BLOB_STORE_ID: " " }, true).gorselDepo]).toEqual([true, false]);
    expect(saglikOf({ ANTHROPIC_API_KEY: "x", BLOB_READ_WRITE_TOKEN: "y", YEDEK_ANAHTARI: "z", CRON_SECRET: "c", KAYIT_DAVET_KODU: "  " }, true)).toEqual({
      ...eposta,
      kaliciDepo: true,
      yapayZeka: true,
      gorselDepo: true,
      yedekAnahtari: true,
      zamanlayici: true,
      davetKodu: false,
    });
  });
});

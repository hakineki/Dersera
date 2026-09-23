import { getUniteler } from "@/data/mufredat/programlar";
import type { GameDefinition } from "@/lib/composer/definition";
import type { ResolvedInput } from "@/lib/composer/input";
import { clearRedisEnv } from "./helpers/fakeRedis";
import { buildApi, jsonRequest } from "./helpers/api";
import { makeDefinition, resolvedInput, toModelOutput } from "./helpers/composerFixtures";

type ComposeRoute = typeof import("@/app/api/compose/route");
type AnthropicMod = typeof import("@/lib/composer/anthropic");

// Route ve anthropic modülü aynı izole kayıttan yüklenir; spy ve hata sınıfı route'un gördüğüyle aynı olur.
async function loadCompose(): Promise<{ route: ComposeRoute; anthropic: AnthropicMod }> {
  let route!: ComposeRoute;
  let anthropic!: AnthropicMod;
  await jest.isolateModulesAsync(async () => {
    anthropic = await import("@/lib/composer/anthropic");
    route = await import("@/app/api/compose/route");
  });
  return { route, anthropic };
}

const body = (sinif: number, ders: string, sure: number, deneyim: string, alan: string, ip = "1.1.1.1") => {
  const konuId = getUniteler(sinif, ders).find((u) => u.ogrenmeCiktilari.length)!.id;
  const req = jsonRequest("/api/compose", { sinif, dersler: [{ ders, konuId }], sure, deneyim, alan });
  req.headers.set("x-forwarded-for", ip);
  return { req, konuId };
};

describe("POST /api/compose", () => {
  let route: ComposeRoute;
  let anthropic: AnthropicMod;
  let spy: jest.SpyInstance;
  const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(async () => {
    clearRedisEnv();
    process.env.ANTHROPIC_API_KEY = "test-key";
    ({ route, anthropic } = await loadCompose());
    spy = jest.spyOn(anthropic, "composeGame").mockImplementation(async (input: ResolvedInput) => toModelOutput(makeDefinition(input, input.sure === 20 ? 5 : input.sure === 40 ? 7 : 9)));
  });
  afterEach(() => spy.mockRestore());
  afterAll(() => errSpy.mockRestore());

  it.each([
    ["senaryo 1: 10 / Fizik / 40 / Dengeli / Tek Sınıf", 10, "fizik", 40, "dengeli", "sinif"],
    ["senaryo 2: 10 / Türk Dili / 20 / Ders / Tek Sınıf", 10, "turk-dili", 20, "ders", "sinif"],
    ["senaryo 3: 11 / Matematik / 60 / Macera / Okul", 11, "matematik", 60, "macera", "okul"],
  ])("%s", async (_l, sinif, ders, sure, deneyim, alan) => {
    const { req, konuId } = body(sinif as number, ders as string, sure as number, deneyim as string, alan as string);
    const res = await route.POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { definition: GameDefinition; validation: { gecerli: boolean }; dersler: { ders: string; konuId: string }[] };
    expect(json.validation.gecerli).toBe(true);
    expect(json.dersler).toEqual([{ ders, konuId }]);
    expect(json.definition.meta).toMatchObject({ sinif, sure_dk: sure, deneyim, alan });
    const qrDuraklar = json.definition.duraklar.filter((d) => d.mekan.tur === "qr");
    expect(qrDuraklar.length).toBe(alan === "okul" ? json.definition.duraklar.length : 0);
  });

  it("meta alanlarını modelden değil doğrulanmış girdiden alır", async () => {
    spy.mockImplementationOnce(async (input: ResolvedInput) => ({ ...toModelOutput(makeDefinition(input)), meta: { sinif: 12, konu: "Uydurma", sure_dk: 999 } }) as never);
    const res = await route.POST(body(10, "fizik", 40, "dengeli", "sinif").req);
    const json = (await res.json()) as { definition: GameDefinition };
    expect(json.definition.meta.sinif).toBe(10);
    expect(json.definition.meta.sure_dk).toBe(40);
    expect(json.definition.meta.konu).toBe(getUniteler(10, "fizik").find((u) => u.ogrenmeCiktilari.length)!.ad);
  });

  it("geçersiz konu Anthropic'e gitmeden reddedilir (senaryo 4)", async () => {
    const req = jsonRequest("/api/compose", { sinif: 10, dersler: [{ ders: "fizik", konuId: getUniteler(10, "kimya")[0].id }], sure: 40, deneyim: "dengeli", alan: "sinif" });
    expect((await route.POST(req)).status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
  });

  it("doğrulayıcı hatalarını yanıtta döndürür", async () => {
    spy.mockImplementationOnce(async (input: ResolvedInput) => {
      const d = toModelOutput(makeDefinition(input));
      d.duraklar[2].varsayilan_sonraki_durak_id = "yok";
      return d;
    });
    const json = (await (await route.POST(body(10, "fizik", 40, "dengeli", "sinif").req)).json()) as { validation: { gecerli: boolean; hatalar: { kod: string }[] } };
    expect(json.validation.gecerli).toBe(false);
    expect(json.validation.hatalar.map((h) => h.kod)).toContain("hedef-yok");
  });

  it("zaman aşımında 504 ve genel mesaj döner", async () => {
    spy.mockRejectedValueOnce(new anthropic.ComposeError("timeout", "iç ayrıntı"));
    const res = await route.POST(body(10, "fizik", 40, "dengeli", "sinif").req);
    expect(res.status).toBe(504);
    const json = await res.json();
    expect(json).toEqual({ error: "Oyun şu anda oluşturulamadı. Tekrar deneyin.", timeout: true });
  });

  it("Anthropic hatasında ayrıntı sızdırmadan 502 döner", async () => {
    spy.mockRejectedValueOnce(new anthropic.ComposeError("upstream", "Anthropic API hatası 529: overloaded sk-ant-gizli"));
    const res = await route.POST(body(10, "fizik", 40, "dengeli", "sinif").req);
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toMatch(/overloaded|sk-ant/);
  });

  it("anahtar yoksa yapılandırma hatası (503) döner", async () => {
    spy.mockRestore();
    delete process.env.ANTHROPIC_API_KEY;
    const res = await route.POST(body(10, "fizik", 40, "dengeli", "sinif", "9.9.9.9").req);
    expect(res.status).toBe(503);
  });

  it("aynı IP'den saatte 30'dan fazla isteği 429 ile keser", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await route.POST(body(10, "fizik", 40, "dengeli", "sinif", "5.5.5.5").req)).status);
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
    expect(spy).toHaveBeenCalledTimes(30);
    expect((await route.POST(body(10, "fizik", 40, "dengeli", "sinif", "6.6.6.6").req)).status).toBe(200);
  });

  it("production'da Redis yoksa oran sınırı belleğe düşmez; 503 döner ve Anthropic çağrılmaz", async () => {
    const env = process.env as Record<string, string | undefined>;
    const eski = env.NODE_ENV;
    env.NODE_ENV = "production";
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      ({ route, anthropic } = await loadCompose());
      spy = jest.spyOn(anthropic, "composeGame");
      const res = await route.POST(body(10, "fizik", 40, "dengeli", "sinif", "8.8.8.8").req);
      expect(res.status).toBe(503);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      env.NODE_ENV = eski;
      warn.mockRestore();
    }
  });

  it("bozuk JSON'a 400 döner", async () => {
    const res = await route.POST(new Request("http://localhost/api/compose", { method: "POST", body: "{" }));
    expect(res.status).toBe(400);
  });
});

describe("composer yayını (/api/games)", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  beforeEach(async () => {
    clearRedisEnv();
    api = await buildApi();
  });

  const input = () => {
    const konu = getUniteler(10, "fizik")[0];
    const girdi = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
    return { konu, dersler: [{ ders: "fizik", konuId: konu.id }], def: makeDefinition(girdi, 7) };
  };

  it("geçerli oyunu mevcut sistemle yayınlar; kod oluşur ve öğretmen/öğrenci aynı kaydı görür (senaryo 12)", async () => {
    const { dersler, def } = input();
    const res = await api.games.POST(jsonRequest("/api/games", { composer: { definition: def, dersler } }));
    expect(res.status).toBe(201);
    const pub = await res.json();
    expect(pub.game.code).toMatch(/^[A-Z]{3}-\d{3}$/);
    expect(typeof pub.adminToken).toBe("string");
    expect(pub.game.stops).toHaveLength(def.duraklar.length);
    expect(pub.game.definition.duraklar.map((d: { id: string }) => d.id)).toEqual(def.duraklar.map((d) => d.id));

    const got = await (await api.game.GET(new Request("http://localhost"), api.params(pub.game.code))).json();
    expect(got.active).toBe(true);
    expect(got.game.definition.meta.baslik).toBe(def.meta.baslik);
    expect((await api.join.POST(jsonRequest("/join", { nickname: "Kartal" }), api.params(pub.game.code))).status).toBe(201);
  });

  it("finale ulaşılamayan oyun yayınlanamaz (senaryo 7)", async () => {
    const { dersler, def } = input();
    def.duraklar[def.duraklar.length - 1].varsayilan_sonraki_durak_id = "d5";
    const res = await api.games.POST(jsonRequest("/api/games", { composer: { definition: def, dersler } }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.validation.hatalar.map((h: { kod: string }) => h.kod)).toContain("final-erisilemez");
  });

  it("düzenleme sonrası sunucu yeniden doğrular: istemci bozuk tanımı yayınlayamaz (senaryo 11)", async () => {
    const { dersler, def } = input();
    def.duraklar[0].gorev.dogru_cevap = "Seçeneklerde olmayan";
    const res = await api.games.POST(jsonRequest("/api/games", { composer: { definition: def, dersler } }));
    expect(res.status).toBe(422);
  });

  it("64 KB'tan büyük tanımı depoya yazmadan 413 ile reddeder", async () => {
    const { dersler, def } = input();
    def.hikaye_giris = "x".repeat(70 * 1024);
    const res = await api.games.POST(jsonRequest("/api/games", { composer: { definition: def, dersler } }));
    expect(res.status).toBe(413);
  });

  it("konu ile tanım uyuşmazsa ya da tanım şemaya uymazsa reddeder", async () => {
    const { def } = input();
    expect((await api.games.POST(jsonRequest("/api/games", { composer: { definition: def, dersler: [{ ders: "fizik", konuId: getUniteler(10, "fizik")[1].id }] } }))).status).toBe(422);
    expect((await api.games.POST(jsonRequest("/api/games", { composer: { definition: { meta: {} }, dersler: [{ ders: "fizik", konuId: "1" }] } }))).status).toBe(422);
  });

  it("klasik oyun yayını değişmeden çalışır (senaryo 13)", async () => {
    const { samplePublish } = await import("./helpers/api");
    const res = await api.games.POST(jsonRequest("/api/games", samplePublish()));
    expect(res.status).toBe(201);
    expect((await res.json()).game).not.toHaveProperty("definition");
  });
});

describe("çok dersli oyun", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  beforeEach(async () => {
    clearRedisEnv();
    api = await buildApi();
  });

  const coklu = () => resolvedInput({ sinif: 10, ders: ["fizik", "matematik"], sure: 40, deneyim: "dengeli", alan: "sinif" });
  const dersler = (g: ReturnType<typeof coklu>) => g.dersler.map((k) => ({ ders: k.ders, konuId: k.konuId }));

  it("her dersin çalışıldığı oyun yayınlanır; meta dersleri birlikte taşır", async () => {
    const g = coklu();
    const def = makeDefinition(g, 7);
    def.duraklar[0].gorev.ogrenme_hedefi = g.hedefDersleri.Matematik[0];
    def.meta.ders = g.dersAdi;
    const res = await api.games.POST(jsonRequest("/api/games", { composer: { definition: def, dersler: dersler(g) } }));
    expect(res.status).toBe(201);
    expect((await res.json()).game.definition.meta.ders).toBe("Fizik + Matematik");
  });

  it("seçilen bir ders hiçbir görevde çalışılmıyorsa yayınlanamaz", async () => {
    const g = coklu();
    const def = makeDefinition(g, 7);
    def.duraklar.forEach((d) => (d.gorev.ogrenme_hedefi = g.hedefDersleri.Fizik[0]));
    def.final.ogrenme_hedefleri = g.hedefDersleri.Fizik.slice(0, 2);
    def.ogrenme_hedefleri = g.hedefDersleri.Fizik.slice(0, 2);
    const res = await api.games.POST(jsonRequest("/api/games", { composer: { definition: def, dersler: dersler(g) } }));
    expect(res.status).toBe(422);
    const hatalar = (await res.json()).validation.hatalar as { kod: string; mesaj: string }[];
    expect(hatalar.map((h) => h.kod)).toContain("ders-eksik");
    expect(hatalar.find((h) => h.kod === "ders-eksik")?.mesaj).toContain("Matematik");
  });

  it("aynı ders iki kez seçilemez", async () => {
    const konuId = getUniteler(10, "fizik")[0].id;
    const req = jsonRequest("/api/compose", { sinif: 10, dersler: [{ ders: "fizik", konuId }, { ders: "fizik", konuId }], sure: 40, deneyim: "dengeli", alan: "sinif" });
    const { route } = await loadCompose();
    expect((await route.POST(req)).status).toBe(422);
  });
});

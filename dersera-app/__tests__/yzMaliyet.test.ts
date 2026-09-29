import { z } from "zod";
import { yapilandirilmisIstek, type ComposeClient } from "@/lib/composer/anthropic";
import { yapilandirilmisIstekOpenAI, type OpenAIComposeClient } from "@/lib/composer/openai";
import { openaiGorsel, type GorselIstemcisi } from "@/lib/gorselUretici";
import { ayOf } from "@/lib/kredi";
import { getOkulStore } from "@/lib/okulStore";
import { raporOf, tahminiDolar } from "@/lib/yzMaliyet";
import { hesapBagla, hesapIcin, yzKullanimKaydet, yzTuruIle } from "@/lib/yzMaliyetKaydi";
import { sonAylarListesi } from "@/lib/yzMaliyetRaporu";
import { createMemoryYzMaliyetStore, createRedisYzMaliyetStore, getYzMaliyetStore, MALIYET_SAKLAMA_MS } from "@/lib/yzMaliyetStore";
import { buildApi, cerezli, hesapAc, jsonRequest } from "./helpers/api";
import { clearRedisEnv } from "./helpers/fakeRedis";
import { createLuaRedis } from "./helpers/luaRedis";

const Sema = z.object({ a: z.string() });
const prompt = { ortak: "o", asama: "a" };
const ay = () => ayOf(Date.now());

describe("fiyat ve rapor", () => {
  it("tahmini dolar: token fiyatı, sürüm ekli model adı, görsel, bilinmeyen model", () => {
    expect(tahminiDolar({ model: "gpt-6-luna", giris: 1_000_000, cikis: 1_000_000 })).toBeCloseTo(0.6);
    expect(tahminiDolar({ model: "claude-sonnet-4-6-20260301", giris: 1_000_000, onbellek: 1_000_000 })).toBeCloseTo(3.3);
    expect(tahminiDolar({ model: "gpt-image-2", gorsel: 4, kalite: "low" })).toBeCloseTo(0.024);
    expect(tahminiDolar({ model: "gpt-image-2", gorsel: 1, kalite: "high" })).toBeNull();
    expect(tahminiDolar({ model: "bilinmeyen-model", giris: 10 })).toBeNull();
  });

  it("rapor: tür/model ve okul kırılımı, toplam; bilinmeyen tür 'diğer'", () => {
    const r = raporOf("2026-09", {
      "t|uretim|gpt-6-luna|cagri": 2,
      "t|uretim|gpt-6-luna|mikrodolar": 48_000,
      "t|garip|m|cagri": 1,
      "o|okul1|cagri": 2,
      "o|okul1|mikrodolar": 48_000,
      "o|yok|cagri": 1,
      "bozuk": 5,
    });
    expect(r.toplam).toMatchObject({ cagri: 3, mikrodolar: 48_000 });
    expect(r.turler.map((t) => `${t.tur}/${t.model}/${t.olculer.cagri}`)).toEqual(["uretim/gpt-6-luna/2", "diger/m/1"]);
    expect(r.okullar.map((o) => `${o.okulId}/${o.olculer.cagri}`)).toEqual(["okul1/2", "null/1"]);
  });

  it("ay listesi yıl dönümünde doğru", () => {
    expect(sonAylarListesi(Date.UTC(2027, 0, 15, 12), 3)).toEqual(["2027-01", "2026-12", "2026-11"]);
  });
});

describe("çağrı noktalarında kayıt", () => {
  let okulId: string;
  beforeAll(async () => {
    clearRedisEnv();
    okulId = "okul-maliyet";
    await getOkulStore().olustur({ id: okulId, ad: "Maliyet Lisesi", olusturma: 1, olusturan: "yonetici-m", davetKodu: "MALIYET1" }, { hesapId: "yonetici-m", rol: "yonetici", katilma: 1 });
    await getOkulStore().katil(okulId, { hesapId: "ogretmen-m", rol: "ogretmen", katilma: 2 });
  });
  const tablo = () => getYzMaliyetStore().tablo(ay());

  it("Anthropic: giriş/çıkış/önbellek token, tür ve öğretmenin okulu; kesik yanıt da (hata fırlatılsa da) kaydedilir", async () => {
    const yanit = (stop: string) =>
      ({ messages: { create: async () => ({ model: "claude-sonnet-4-6", stop_reason: stop, usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 200 }, content: [{ type: "text", text: '{"a":"x"}' }] }) } }) as unknown as ComposeClient;
    const once = await tablo();
    await hesapIcin("ogretmen-m", () => yzTuruIle("uretim", () => yapilandirilmisIstek(Sema, prompt, 100, yanit("end_turn"))));
    await expect(hesapIcin("ogretmen-m", () => yzTuruIle("uretim", () => yapilandirilmisIstek(Sema, prompt, 100, yanit("max_tokens"))))).rejects.toThrow(/max_tokens/);
    const t = await tablo();
    const fark = (k: string) => (t[k] ?? 0) - (once[k] ?? 0);
    expect(fark("t|uretim|claude-sonnet-4-6|cagri")).toBe(2);
    expect(fark("t|uretim|claude-sonnet-4-6|giris")).toBe(2000);
    expect(fark("t|uretim|claude-sonnet-4-6|cikis")).toBe(1000);
    expect(fark("t|uretim|claude-sonnet-4-6|onbellek")).toBe(400);
    // 2 × (1000×3 + 500×15 + 200×0,3) / 1e6 $ = 0,02112 $
    expect(fark("t|uretim|claude-sonnet-4-6|mikrodolar")).toBe(21_120);
    expect(fark(`o|${okulId}|cagri`)).toBe(2);
  });

  it("OpenAI: önbellekteki tokenlar girişten ayrılır; okulsuz öğretmen 'yok'a yazılır", async () => {
    const client = {
      chat: {
        completions: {
          create: async () => ({
            model: "gpt-6-luna",
            usage: { prompt_tokens: 1000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 400 } },
            choices: [{ finish_reason: "stop", message: { content: '{"a":"x"}', refusal: null } }],
          }),
        },
      },
    } as unknown as OpenAIComposeClient;
    const once = await tablo();
    await hesapIcin("okulsuz-ogretmen", () => yzTuruIle("guncelleme", () => yapilandirilmisIstekOpenAI(Sema, "s", prompt, 100, client)));
    const t = await tablo();
    const fark = (k: string) => (t[k] ?? 0) - (once[k] ?? 0);
    expect([fark("t|guncelleme|gpt-6-luna|giris"), fark("t|guncelleme|gpt-6-luna|onbellek"), fark("t|guncelleme|gpt-6-luna|cikis")]).toEqual([600, 400, 100]);
    expect(fark("o|yok|cagri")).toBe(1);
  });

  it("Görsel: görsel başına kalite fiyatıyla; görsel dönmezse kaydedilmez", async () => {
    const istemci = (veri: string | null): GorselIstemcisi => ({ images: { generate: async () => ({ data: veri ? [{ b64_json: veri }] : [] }) } });
    const once = await tablo();
    await hesapIcin("ogretmen-m", () => yzTuruIle("gorsel", () => openaiGorsel("istem", istemci(Buffer.from("x").toString("base64")))));
    await expect(hesapIcin("ogretmen-m", () => yzTuruIle("gorsel", () => openaiGorsel("istem", istemci(null))))).rejects.toThrow();
    const t = await tablo();
    const fark = (k: string) => (t[k] ?? 0) - (once[k] ?? 0);
    expect([fark("t|gorsel|gpt-image-2|cagri"), fark("t|gorsel|gpt-image-2|gorsel"), fark("t|gorsel|gpt-image-2|mikrodolar")]).toEqual([1, 1, 6000]);
    expect(fark(`o|${okulId}|gorsel`)).toBe(1);
  });

  it("eşzamanlı istekler karışmaz; bağlamsız çağrı 'diğer' ve okulsuz; uç noktada hesapBagla isteğin geri kalanına uygulanır", async () => {
    const store = createMemoryYzMaliyetStore();
    const kaydet = () => yzKullanimKaydet({ model: "gpt-6-luna", giris: 10 }, Date.now(), store);
    await Promise.all([
      hesapIcin("ogretmen-m", () => yzTuruIle("uretim", async () => (await new Promise((r) => setTimeout(r, 5)), kaydet()))),
      hesapIcin("okulsuz-2", () => yzTuruIle("denetim", kaydet)),
    ]);
    await kaydet();
    // Uç nokta: kendi bağlamında (her istek ayrı) hesapBagla, sonra servis türü.
    await yzTuruIle("diger", async () => {
      hesapBagla("ogretmen-m");
      await yzTuruIle("oneri", kaydet);
    });
    const t = await store.tablo(ay());
    expect(t["t|uretim|gpt-6-luna|cagri"]).toBe(1);
    expect(t["t|denetim|gpt-6-luna|cagri"]).toBe(1);
    expect(t["t|diger|gpt-6-luna|cagri"]).toBe(1);
    expect(t["t|oneri|gpt-6-luna|cagri"]).toBe(1);
    expect(t[`o|${okulId}|cagri`]).toBe(2);
    expect(t["o|yok|cagri"]).toBe(2);
  });

  it("kayıt hatası çağrıyı bozmaz", async () => {
    const bozuk = { artir: async () => Promise.reject(new Error("depo yok")), tablo: async () => ({}) };
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(yzKullanimKaydet({ model: "gpt-6-luna", giris: 1 }, Date.now(), bozuk)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("Redis deposu (Lua gerçekten çalışır)", () => {
  it("bütün alanlar tek betikte artar; sıfırlar yazılmaz; süre 400 gün", async () => {
    const r = createLuaRedis();
    const s = createRedisYzMaliyetStore(r.command);
    await s.artir("2026-09", { "t|uretim|m|cagri": 1, "t|uretim|m|giris": 100, "t|uretim|m|gorsel": 0 });
    await s.artir("2026-09", { "t|uretim|m|cagri": 1 });
    expect(await s.tablo("2026-09")).toEqual({ "t|uretim|m|cagri": 2, "t|uretim|m|giris": 100 });
    expect(MALIYET_SAKLAMA_MS).toBe(400 * 24 * 60 * 60 * 1000);
  });
});

describe("yönetim uç noktası", () => {
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
  const rapor = (c: string | null, qs = "") => api.yzMaliyet.GET(cerezli(new Request(`http://localhost/api/yonetim/yz-maliyet${qs}`), c));

  it("yalnız platform yöneticisi; geçersiz ay 422; okul adı ve varsayımlar döner", async () => {
    expect((await rapor(null)).status).toBe(401);
    const ogretmen = await hesapAc(api, "ogretmen1");
    expect((await rapor(ogretmen)).status).toBe(403);
    const platform = await hesapAc(api, "platform1");
    expect((await rapor(platform, "?ay=2026-13")).status).toBe(422);
    expect((await api.okul.POST(cerezli(jsonRequest("/api/okul", { ad: "Deneme Lisesi" }), ogretmen))).status).toBe(201);
    const okul = (await api.okulStore.getOkulStore().okulOf((await api.authStore.getAuthStore().idByAd("ogretmen1"))!))!;
    await api.yzMaliyetStore.getYzMaliyetStore().artir(ay(), { "t|uretim|gpt-6-luna|cagri": 1, "t|uretim|gpt-6-luna|mikrodolar": 24_000, [`o|${okul}|cagri`]: 1, [`o|${okul}|mikrodolar`]: 24_000 });
    const r = await rapor(platform);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.ay).toBe(ay());
    expect(j.toplam).toMatchObject({ cagri: 1, mikrodolar: 24_000 });
    expect(j.okullar).toEqual([expect.objectContaining({ okulId: okul, okulAdi: "Deneme Lisesi" })]);
    expect(j.aylar).toHaveLength(13);
    expect(j.varsayimlar.dolarKuru.tl).toBeGreaterThan(0);
    expect((await (await rapor(platform, "?ay=2020-01")).json()).toplam.cagri).toBe(0);
  });
});

describe("uç noktadan uca: oyun oluşturma öğretmenin okuluna ve 'oyun üretimi' türüne yazılır", () => {
  it("POST /api/compose", async () => {
    clearRedisEnv();
    process.env.ANTHROPIC_API_KEY = "test-key";
    let route!: typeof import("@/app/api/compose/route");
    let anthropic!: typeof import("@/lib/composer/anthropic");
    let yz!: typeof import("@/lib/composer/yzDenetimService");
    let kaydi!: typeof import("@/lib/yzMaliyetKaydi");
    let maliyet!: typeof import("@/lib/yzMaliyetStore");
    let okulStore!: typeof import("@/lib/okulStore");
    let auth!: typeof import("@/lib/auth");
    let authStore!: typeof import("@/lib/authStore");
    let krediStore!: typeof import("@/lib/krediStore");
    await jest.isolateModulesAsync(async () => {
      anthropic = await import("@/lib/composer/anthropic");
      route = await import("@/app/api/compose/route");
      yz = await import("@/lib/composer/yzDenetimService");
      kaydi = await import("@/lib/yzMaliyetKaydi");
      maliyet = await import("@/lib/yzMaliyetStore");
      okulStore = await import("@/lib/okulStore");
      auth = await import("@/lib/auth");
      authStore = await import("@/lib/authStore");
      krediStore = await import("@/lib/krediStore");
    });
    const store = authStore.getAuthStore();
    const h = await auth.kayitOl(store, "ogretmen1", "gizli-sifre-1", undefined);
    if (!h.ok) throw new Error(h.error);
    const cerez = `${auth.OTURUM_CEREZI}=${await auth.oturumAc(store, h.value)}`;
    await krediStore.getKrediStore().odul(h.value.id, 100, Date.now(), "test");
    await okulStore.getOkulStore().olustur({ id: "okul-uc", ad: "Uç Lisesi", olusturma: 1, olusturan: h.value.id, davetKodu: "UCUCUC12" }, { hesapId: h.value.id, rol: "yonetici", katilma: 1 });
    const { makeDefinition, resolvedInput: ri, toModelOutput } = await import("./helpers/composerFixtures");
    void ri;
    jest.spyOn(anthropic, "composeGame").mockImplementation(async (input) => {
      await kaydi.yzKullanimKaydet({ model: "gpt-6-luna", giris: 1000, cikis: 100 });
      return toModelOutput(makeDefinition(input, 7));
    });
    jest.spyOn(yz, "yzDenetle").mockResolvedValue({ durum: "tamam", bulgular: [] });
    const { getUniteler } = await import("@/data/mufredat/programlar");
    const konuId = getUniteler(10, "fizik").find((u) => u.ogrenmeCiktilari.length)!.id;
    const req = jsonRequest("/api/compose", { sinif: 10, dersler: [{ ders: "fizik", konuId }], sure: 40, deneyim: "dengeli", alan: "sinif" });
    req.headers.set("cookie", cerez);
    expect((await route.POST(req)).status).toBe(200);
    const t = await maliyet.getYzMaliyetStore().tablo(ay());
    expect(t["t|uretim|gpt-6-luna|cagri"]).toBe(1);
    expect(t["o|okul-uc|cagri"]).toBe(1);
    expect(t["o|yok|cagri"]).toBeUndefined();
    jest.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });
});

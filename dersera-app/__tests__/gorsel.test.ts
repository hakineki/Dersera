import { getUniteler } from "@/data/mufredat/programlar";
import { parseComposerDefinition } from "@/lib/composer/adapter";
import type { GameDefinition } from "@/lib/composer/definition";
import type { ResolvedInput } from "@/lib/composer/input";
import { gorselAdresi, gorselleriBirlestir, KAPAK } from "@/lib/gorsel";
import { gorselIstemleri, sahneDuraklari } from "@/lib/gorselIstem";
import { createMemoryGorselStore } from "@/lib/gorselStore";
import { geminiGorsel, GorselHatasi, webpYap } from "@/lib/gorselUretici";
import { jsonRequest } from "./helpers/api";
import { makeDefinition, resolvedInput, toModelOutput } from "./helpers/composerFixtures";
import { clearRedisEnv } from "./helpers/fakeRedis";

const girdi = resolvedInput({ sinif: 6, ders: "fen-bilimleri", sure: 40, deneyim: "dengeli", alan: "sinif" });
const dersler = [{ ders: "fen-bilimleri", konuId: getUniteler(6, "fen-bilimleri")[0].id }];
const IS = "0b5e4d1c-8f7a-4c2e-9d3b-6a1f2e3d4c5b";
const oyun = (n = 7) => makeDefinition(girdi, n);

describe("görsel kuralları", () => {
  it("birleştirme: aynı işin görselleriyle birleşir, sıra kapak + durak sırası, silinen durak düşer, değişiklik yoksa aynı nesne", () => {
    const d = oyun();
    const [a, b] = [d.duraklar[4].id, d.duraklar[1].id];
    const bir = gorselleriBirlestir(d, IS, [a]);
    expect(bir.gorseller).toEqual({ isId: IS, hedefler: [a] });
    // Sırasız gelen daha kısa yanıt önceki görseli düşürmez.
    const iki = gorselleriBirlestir(bir, IS, [KAPAK, b]);
    expect(iki.gorseller!.hedefler).toEqual([KAPAK, b, a]);
    expect(gorselleriBirlestir(iki, IS, [b])).toBe(iki);
    expect(gorselleriBirlestir(d, IS, [])).toBe(d);
    expect(gorselleriBirlestir(d, IS, ["yok"])).toBe(d);
    const baskaIs = gorselleriBirlestir(iki, "1b5e4d1c-8f7a-4c2e-9d3b-6a1f2e3d4c5b", [KAPAK]);
    expect(baskaIs.gorseller).toEqual({ isId: "1b5e4d1c-8f7a-4c2e-9d3b-6a1f2e3d4c5b", hedefler: [KAPAK] });
    expect(gorselAdresi(iki, KAPAK)).toBe(`/api/gorsel/dosya/${IS}/kapak`);
    expect(gorselAdresi(iki, d.duraklar[2].id)).toBeNull();
  });

  it("şema: görsel alanı iş kimliği ve hedef taşır; dışarıdan adres konamaz (atılır), geçersiz biçim reddedilir", () => {
    const d = oyun();
    const ok = parseComposerDefinition({ ...d, gorseller: { isId: IS, hedefler: [KAPAK, "d1"], url: "https://kotu.example/x.png" } }, dersler);
    expect(ok.ok && ok.definition.gorseller).toEqual({ isId: IS, hedefler: [KAPAK, "d1"] });
    for (const gorseller of [
      { isId: "https://kotu.example/x.png", hedefler: [KAPAK] },
      { isId: IS, hedefler: ["../x"] },
      { isId: IS, hedefler: ["https://kotu.example"] },
      { isId: IS, hedefler: [KAPAK, KAPAK] },
      { isId: IS, hedefler: [KAPAK, "d1", "d2", "d3", "d4"] },
    ]) {
      expect(parseComposerDefinition({ ...d, gorseller }, dersler)).toMatchObject({ ok: false, status: 422 });
    }
    // Görselsiz tanım aynen geçer.
    const yok = parseComposerDefinition(d, dersler);
    expect(yok.ok && yok.definition.gorseller).toBeUndefined();
  });

  it("istemler: kapak + 3 sahne; seçim sahnesi atlanır; içerik kuralları ve yaşa göre tarz her istemde", () => {
    const d = oyun(8);
    d.duraklar[0].sahne_turu = "secim";
    const sahneler = sahneDuraklari(d);
    expect(sahneler).toHaveLength(3);
    expect(sahneler.every((s) => s.sahne_turu !== "secim")).toBe(true);
    const istemler = gorselIstemleri(d);
    expect(istemler.map((i) => i.hedef)).toEqual([KAPAK, ...sahneler.map((s) => s.id)]);
    for (const i of istemler) {
      expect(i.istem).toMatch(/hiçbir yazı, harf, rakam, logo/);
      expect(i.istem).toMatch(/Gerçek ya da tanınmış kişiler/);
      expect(i.istem).toMatch(/canlı bir macera/); // 6. sınıf: ortaokul tarzı
      expect(i.istem.length).toBeLessThan(1500);
    }
    const kucuk: GameDefinition = { ...d, meta: { ...d.meta, sinif: 2 } };
    expect(gorselIstemleri(kucuk)[0].istem).toMatch(/sevimli ve renkli/);
    // Az duraklı oyunda olan kadar sahne.
    const iki: GameDefinition = { ...d, duraklar: d.duraklar.slice(1, 3) };
    expect(gorselIstemleri(iki).map((i) => i.hedef)).toEqual([KAPAK, ...iki.duraklar.map((x) => x.id)]);
  });
});

describe("Gemini görsel sağlayıcısı", () => {
  const eski = process.env.GEMINI_API_KEY;
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "gemini-test";
  });
  afterAll(() => {
    if (eski === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = eski;
  });
  const yanit = (body: unknown, status = 200) => jest.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  const neden = async (p: Promise<unknown>) => {
    try {
      await p;
      return "yok";
    } catch (err) {
      return err instanceof GorselHatasi ? err.neden : "beklenmeyen";
    }
  };

  it("istek biçimi: model, anahtar başlığı, yalnız görsel çıktısı ve 4:3; yanıttaki görsel çözülür", async () => {
    const f = yanit({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "not" }, { inlineData: { mimeType: "image/png", data: Buffer.from("PNG!").toString("base64") } }] } }] });
    expect((await geminiGorsel("istem", f)).toString()).toBe("PNG!");
    const [url, init] = (f as unknown as jest.Mock).mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-image:generateContent");
    expect(init.headers["x-goog-api-key"]).toBe("gemini-test");
    expect(JSON.parse(init.body)).toEqual({
      contents: [{ role: "user", parts: [{ text: "istem" }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:3" } },
    });
  });

  it("güvenlik engeli, boş yanıt, yetki ve zaman aşımı ayrı nedenlerle bildirilir", async () => {
    expect(await neden(geminiGorsel("x", yanit({ promptFeedback: { blockReason: "SAFETY" } })))).toBe("guvenlik");
    expect(await neden(geminiGorsel("x", yanit({ candidates: [{ finishReason: "IMAGE_SAFETY" }] })))).toBe("guvenlik");
    expect(await neden(geminiGorsel("x", yanit({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "yalnız metin" }] } }] })))).toBe("saglayici");
    expect(await neden(geminiGorsel("x", yanit({ error: {} }, 403)))).toBe("yapilandirma");
    expect(await neden(geminiGorsel("x", yanit({ error: {} }, 500)))).toBe("saglayici");
    const zaman = jest.fn(async () => {
      throw Object.assign(new Error("zaman"), { name: "TimeoutError" });
    }) as unknown as typeof fetch;
    expect(await neden(geminiGorsel("x", zaman))).toBe("zaman");
    delete process.env.GEMINI_API_KEY;
    expect(await neden(geminiGorsel("x", yanit({})))).toBe("yapilandirma");
  });

  it("görsel 1024 piksele sığdırılıp WebP'ye sıkıştırılır", async () => {
    const sharp = (await import("sharp")).default;
    const png = await sharp({ create: { width: 1536, height: 1152, channels: 3, background: { r: 200, g: 120, b: 40 } } }).png().toBuffer();
    const webp = await webpYap(png);
    expect(webp.subarray(0, 4).toString()).toBe("RIFF");
    expect(webp.subarray(8, 12).toString()).toBe("WEBP");
    const meta = await sharp(webp).metadata();
    expect([meta.width, meta.height]).toEqual([1024, 768]);
    expect(webp.length).toBeLessThan(png.length);
  });
});

describe("görsel iş deposu (bellek)", () => {
  it("hedefler sırayla ve bir kez sahiplenilir; bayat çalışan yeniden sahiplenilir; kredi kararı tek sefer", async () => {
    const s = createMemoryGorselStore();
    const harcama = { id: "h", ay: "2026-09", aylik: 1, okul: 0, kazanilan: 0 };
    await s.olustur({ isId: IS, sahip: "a", olusturma: 1, harcama, hedefler: [{ hedef: KAPAK, istem: "k" }, { hedef: "d1", istem: "1" }] }, 1000);
    expect(await s.sahiplen(IS, [KAPAK, "d1"], 100, 70_000)).toBe(KAPAK);
    expect(await s.sahiplen(IS, [KAPAK, "d1"], 100, 70_000)).toBe("d1");
    expect(await s.sahiplen(IS, [KAPAK, "d1"], 100, 70_000)).toBeNull();
    expect(await s.durumlar(IS)).toEqual({ [KAPAK]: "calisiyor", d1: "calisiyor" });
    // Yarıda kalan (bayat) hedef yeniden sahiplenilir.
    expect(await s.sahiplen(IS, [KAPAK, "d1"], 100 + 70_001, 70_000)).toBe(KAPAK);
    await s.bitir(IS, KAPAK, "https://depo/kapak.webp");
    await s.bitir(IS, "d1", null);
    expect(await s.durumlar(IS)).toEqual({ [KAPAK]: "hazir", d1: "hata" });
    expect(await s.dosya(IS, KAPAK)).toBe("https://depo/kapak.webp");
    expect(await s.dosya(IS, "d1")).toBeNull();
    expect(await s.sonuclandir(IS, 1000)).toBe(true);
    expect(await s.sonuclandir(IS, 1000)).toBe(false);
  });
});

describe("görsel zenginleştirme uçları", () => {
  let compose: typeof import("@/app/api/compose/route");
  let gorselRoute: typeof import("@/app/api/gorsel/[isId]/route");
  let dosyaRoute: typeof import("@/app/api/gorsel/dosya/[isId]/[hedef]/route");
  let anthropic: typeof import("@/lib/composer/anthropic");
  let uretici: typeof import("@/lib/gorselUretici");
  let yz: typeof import("@/lib/composer/yzDenetimService");
  let krediStore: typeof import("@/lib/krediStore");
  let kredi: typeof import("@/app/api/kredi/route");
  let cerezler: Record<string, string>;
  let hesapIdler: Record<string, string>;
  const env = { ...process.env };

  beforeEach(async () => {
    clearRedisEnv();
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.GEMINI_API_KEY = "gemini-test";
    process.env.BLOB_READ_WRITE_TOKEN = "blob-test";
    let auth!: typeof import("@/lib/auth");
    let authStore!: typeof import("@/lib/authStore");
    await jest.isolateModulesAsync(async () => {
      anthropic = await import("@/lib/composer/anthropic");
      uretici = await import("@/lib/gorselUretici");
      yz = await import("@/lib/composer/yzDenetimService");
      compose = await import("@/app/api/compose/route");
      gorselRoute = await import("@/app/api/gorsel/[isId]/route");
      dosyaRoute = await import("@/app/api/gorsel/dosya/[isId]/[hedef]/route");
      krediStore = await import("@/lib/krediStore");
      kredi = await import("@/app/api/kredi/route");
      auth = await import("@/lib/auth");
      authStore = await import("@/lib/authStore");
    });
    const store = authStore.getAuthStore();
    cerezler = {};
    hesapIdler = {};
    for (const ad of ["ogretmen1", "ogretmen2"]) {
      const h = await auth.kayitOl(store, ad, "gizli-sifre-1", undefined);
      if (!h.ok) throw new Error(h.error);
      hesapIdler[ad] = h.value.id;
      cerezler[ad] = `${auth.OTURUM_CEREZI}=${await auth.oturumAc(store, h.value)}`;
    }
    jest.spyOn(anthropic, "composeGame").mockImplementation(async (input: ResolvedInput) => toModelOutput(makeDefinition(input, 7)));
    jest.spyOn(yz, "yzDenetle").mockResolvedValue({ durum: "tamam", bulgular: [] });
    jest.spyOn(uretici, "gorselUretVeYaz").mockImplementation(async (isId, hedef) => `https://depo.example/gorsel/${isId}/${hedef}-abc.webp`);
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...env };
  });

  const olustur = (govde: Record<string, unknown>, c = cerezler.ogretmen1) => {
    const req = jsonRequest("/api/compose", { sinif: 6, dersler, sure: 40, deneyim: "dengeli", alan: "sinif", ...govde });
    req.headers.set("cookie", c);
    req.headers.set("x-forwarded-for", "9.9.9.9");
    return compose.POST(req);
  };
  const tetikle = (isId: string, c = cerezler.ogretmen1) =>
    gorselRoute.POST(Object.assign(new Request(`http://localhost/api/gorsel/${isId}`, { method: "POST", headers: { cookie: c } })), { params: Promise.resolve({ isId }) });
  const krediOku = async (c = cerezler.ogretmen1) => (await kredi.GET(new Request("http://localhost/api/kredi", { headers: { cookie: c } }))).json();
  const askida = () => krediStore.getKrediStore().askidakiler(hesapIdler.ogretmen1);

  it("oluşturma +1 kredi ve görsel işi; 4 tetikleme 4 görsel üretir, fazlası üretmez; kredi kesinleşir; dosya yönlenir", async () => {
    const res = await olustur({ gorsel: true });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.gorselIsi.hedefler).toHaveLength(4);
    expect(json.gorselIsi.hedefler[0]).toBe(KAPAK);
    expect(json.kredi.toplam).toBe(30 - 3 - 1);
    expect(json.kredi.hareketler.map((h: { aciklama: string }) => h.aciklama)).toEqual(["Görsel zenginleştirme (kapak + 3 sahne)", "Oyun oluşturma (40 dk)"]);
    // Tanımda görsel yok: görseller geldikçe istemci ekler.
    expect(json.definition.gorseller).toBeUndefined();
    const isId = json.gorselIsi.isId as string;

    const yanitlar = await Promise.all(Array.from({ length: 6 }, () => tetikle(isId).then((r) => r.json())));
    expect(uretici.gorselUretVeYaz).toHaveBeenCalledTimes(4);
    expect(yanitlar.filter((y) => y.hedef).map((y) => y.hedef).sort()).toEqual([...json.gorselIsi.hedefler].sort());
    const son = yanitlar.find((y) => y.durum.bitti);
    expect(son.durum).toMatchObject({ toplam: 4, hata: 0, bitti: true });
    // Kredi kesinleşti: askıda harcama kalmadı, bakiye 26.
    expect(await askida()).toEqual([]);
    expect((await krediOku()).toplam).toBe(26);

    const dosya = await dosyaRoute.GET(new Request("http://localhost/x"), { params: Promise.resolve({ isId, hedef: KAPAK }) });
    expect(dosya.status).toBe(302);
    expect(dosya.headers.get("location")).toBe(`https://depo.example/gorsel/${isId}/kapak-abc.webp`);
    expect(dosya.headers.get("cache-control")).toMatch(/immutable/);
    expect((await dosyaRoute.GET(new Request("http://localhost/x"), { params: Promise.resolve({ isId, hedef: "d99" }) })).status).toBe(404);
    expect((await dosyaRoute.GET(new Request("http://localhost/x"), { params: Promise.resolve({ isId: "../x", hedef: KAPAK }) })).status).toBe(404);
  });

  it("hiç görsel üretilemezse görsel kredisi iade edilir; kısmen üretilirse kesinleşir", async () => {
    (uretici.gorselUretVeYaz as jest.Mock).mockRejectedValue(new uretici.GorselHatasi("guvenlik", "engellendi"));
    const isId = (await (await olustur({ gorsel: true })).json()).gorselIsi.isId;
    for (let i = 0; i < 4; i++) await tetikle(isId);
    const k = await krediOku();
    expect(k.toplam).toBe(27);
    expect(k.hareketler[0]).toMatchObject({ tur: "iade", miktar: 1, aciklama: "Görseller üretilemedi: kredi iadesi" });

    (uretici.gorselUretVeYaz as jest.Mock).mockReset().mockRejectedValueOnce(new Error("x")).mockResolvedValue("https://depo.example/g.webp");
    const isId2 = (await (await olustur({ gorsel: true })).json()).gorselIsi.isId;
    for (let i = 0; i < 4; i++) await tetikle(isId2);
    expect((await (await gorselRoute.GET(new Request("http://localhost/x", { headers: { cookie: cerezler.ogretmen1 } }), { params: Promise.resolve({ isId: isId2 }) })).json()).durum).toMatchObject({ hata: 1, bitti: true });
    expect((await krediOku()).toplam).toBe(27 - 4);
    expect(await askida()).toEqual([]);
  });

  it("başka öğretmen işi göremez ve tetikleyemez; oturumsuz 401; başka kökenden tetikleme reddedilir", async () => {
    const isId = (await (await olustur({ gorsel: true })).json()).gorselIsi.isId;
    expect((await tetikle(isId, cerezler.ogretmen2)).status).toBe(404);
    expect((await gorselRoute.POST(new Request(`http://localhost/api/gorsel/${isId}`, { method: "POST" }), { params: Promise.resolve({ isId }) })).status).toBe(401);
    const disaridan = new Request(`http://localhost/api/gorsel/${isId}`, { method: "POST", headers: { cookie: cerezler.ogretmen1, "sec-fetch-site": "cross-site" } });
    expect((await gorselRoute.POST(disaridan, { params: Promise.resolve({ isId }) })).status).toBe(403);
    expect(uretici.gorselUretVeYaz).not.toHaveBeenCalled();
  });

  it("süresi geçen işte görsel üretilmez; bekleyenler kapanır ve kredi iade edilir", async () => {
    const t0 = Date.now();
    const isId = (await (await olustur({ gorsel: true })).json()).gorselIsi.isId;
    jest.spyOn(Date, "now").mockReturnValue(t0 + 6 * 60 * 1000);
    const y = await (await tetikle(isId)).json();
    expect(y.hedef).toBeNull();
    expect(y.durum).toMatchObject({ hazir: [], hata: 4, bitti: true });
    expect(uretici.gorselUretVeYaz).not.toHaveBeenCalled();
    expect(await askida()).toEqual([]);
  });

  it("bakiye toplamı yetmezse 402 (görseller dahil), hiçbir şey düşmez; yapılandırma yoksa 422", async () => {
    const s = krediStore.getKrediStore();
    const { ayOf } = await import("@/lib/kredi");
    await s.harca(hesapIdler.ogretmen1, ayOf(Date.now()), 30, 27, Date.now(), "doldur", 1e9, "doldur");
    const r = await olustur({ gorsel: true });
    expect(r.status).toBe(402);
    expect((await r.json()).error).toMatch(/4 kredi \(görseller dahil\)/);
    expect(anthropic.composeGame).not.toHaveBeenCalled();
    expect((await krediOku()).toplam).toBe(3);
    // Görselsiz aynı oyun olur.
    expect((await olustur({})).status).toBe(200);

    delete process.env.GEMINI_API_KEY;
    const y = await olustur({ gorsel: true });
    expect(y.status).toBe(422);
    expect((await y.json()).error).toMatch(/Görsel zenginleştirme şu anda kullanılamıyor/);
  });

  it("içerik denetimi engellerse görsel işi kurulmaz ve görsel kredisi düşmez", async () => {
    (yz.yzDenetle as jest.Mock).mockResolvedValue({
      durum: "tamam",
      bulgular: [{ yer: "d1", kategori: "diger", agirlik: "engelle", alinti: "x", aciklama: "uygunsuz" }],
    });
    const json = await (await olustur({ gorsel: true })).json();
    expect(json.gorselIsi).toBeUndefined();
    expect(json.gorselNotu).toMatch(/görseller oluşturulmadı; görsel kredisi düşülmedi/);
    expect(json.kredi.toplam).toBe(27);
  });

  it("görselsiz oluşturma değişmez: iş kurulmaz, ek kredi yok", async () => {
    const json = await (await olustur({})).json();
    expect(json.gorselIsi).toBeUndefined();
    expect(json.gorselNotu).toBeUndefined();
    expect(json.kredi.toplam).toBe(27);
  });
});

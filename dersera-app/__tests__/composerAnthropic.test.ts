import { composeGame, ComposeError, DEFAULT_MODEL, modelFromEnv } from "@/lib/composer/anthropic";
import { buildRecipe } from "@/lib/composer/recipe";
import { composeAndValidate, IZINLI_QR_IDLERI } from "@/lib/composer/service";
import { SYSTEM_PROMPT } from "@/lib/composer/prompt";
import { fakeClient, makeDefinition, resolvedInput, toModelOutput } from "./helpers/composerFixtures";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { hedefKodu, ModelOutputSchema, toDefinition } from "@/lib/composer/modelOutput";

const input = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const recipe = buildRecipe(40, "dengeli", "sinif");

describe("composeGame", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("model çıktısını API seviyesinde JSON Schema ile zorlar (senaryo 5)", async () => {
    const { client, calls } = fakeClient(toModelOutput(makeDefinition(input)));
    await composeGame(input, recipe, IZINLI_QR_IDLERI, client);
    const format = (calls[0].body.output_config as { format: { type: string; schema: Record<string, unknown> } }).format;
    expect(format.type).toBe("json_schema");
    expect(format.schema.additionalProperties).toBe(false);
    expect(Object.keys(format.schema.properties as object)).toEqual(
      expect.arrayContaining(["baslik", "duraklar", "final", "envanter", "ogrenme_hedefleri"])
    );
  });

  it("şemaya uymayan çıktıyı (parsed_output null) reddeder", async () => {
    const { client } = fakeClient(null);
    await expect(composeGame(input, recipe, IZINLI_QR_IDLERI, client)).rejects.toMatchObject({ reason: "invalid-output" });
  });

  it.each(["refusal", "max_tokens"])("stop_reason=%s çıktıyı kabul etmez", async (stop) => {
    const { client } = fakeClient(toModelOutput(makeDefinition(input)), stop);
    await expect(composeGame(input, recipe, IZINLI_QR_IDLERI, client)).rejects.toMatchObject({ reason: "invalid-output" });
  });

  it("modeli ANTHROPIC_MODEL'den okur, yoksa claude-sonnet-4-6 kullanır", async () => {
    delete process.env.ANTHROPIC_MODEL;
    expect(modelFromEnv()).toBe("claude-sonnet-4-6");
    expect(DEFAULT_MODEL).toBe("claude-sonnet-4-6");
    process.env.ANTHROPIC_MODEL = "claude-opus-5";
    const { client, calls } = fakeClient(toModelOutput(makeDefinition(input)));
    await composeGame(input, recipe, IZINLI_QR_IDLERI, client);
    expect(calls[0].body.model).toBe("claude-opus-5");
  });

  it("240 sn sınırını, yeniden denemesiz ve iptal sinyaliyle uygular", async () => {
    const { client, calls } = fakeClient(toModelOutput(makeDefinition(input)));
    await composeGame(input, recipe, IZINLI_QR_IDLERI, client);
    expect(calls[0].options).toMatchObject({ timeout: 240_000, maxRetries: 0 });
    expect(calls[0].options.signal).toBeInstanceOf(AbortSignal);
  });

  it("süre dolunca isteği iptal eder ve timeout hatası verir", async () => {
    let aborted = false;
    const client = {
      messages: {
        parse: ((_b: unknown, o: { signal: AbortSignal }) =>
          new Promise((_res, rej) => o.signal.addEventListener("abort", () => { aborted = true; rej(new Error("aborted")); }))) as never,
      },
    };
    await expect(composeGame(input, recipe, IZINLI_QR_IDLERI, client, 20)).rejects.toMatchObject({ reason: "timeout" });
    expect(aborted).toBe(true);
  });

  it("API anahtarı yoksa yapılandırma hatası verir", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(composeGame(input, recipe, IZINLI_QR_IDLERI)).rejects.toBeInstanceOf(ComposeError);
    await expect(composeGame(input, recipe, IZINLI_QR_IDLERI)).rejects.toMatchObject({ reason: "config" });
  });

  it("prompt yalnız müfredat ve seçimleri içerir; kişisel veri alanı yok", async () => {
    const { client, calls } = fakeClient(toModelOutput(makeDefinition(input)));
    await composeGame(input, recipe, IZINLI_QR_IDLERI, client);
    const user = (calls[0].body.messages as { content: string }[])[0].content;
    expect(calls[0].body.system).toBe(SYSTEM_PROMPT);
    for (const o of input.ogrenmeCiktilari) expect(user).toContain(o.kod);
    expect(user).toContain(input.dersler[0].unite.ad);
    expect(user).not.toMatch(/takma ad|e-?posta|telefon|nickname/i);
    expect(user).not.toContain("qr-1");
    expect(user).toMatch(/Metinleri kısa tut/);
    expect(calls[0].body.max_tokens).toBe(16000);
    expect(calls[0].body).not.toHaveProperty("thinking");
  });

  it("okul macerasında yalnız QR kütüphanesindeki id'leri verir", async () => {
    const okul = resolvedInput({ sinif: 11, ders: "matematik", sure: 60, deneyim: "macera", alan: "okul" });
    const { client, calls } = fakeClient(toModelOutput(makeDefinition(okul)));
    await composeGame(okul, buildRecipe(60, "macera", "okul"), IZINLI_QR_IDLERI, client);
    const user = (calls[0].body.messages as { content: string }[])[0].content;
    expect(user).toContain("qr-1, qr-2");
    expect(user).toContain("qr-20");
    expect(user).not.toContain("qr-21");
  });
});

// Anthropic yapılandırılmış çıktı şemasını dilbilgisine derler; iç içe nesne, anyOf ve enum dilbilgisini büyütür.
// Canlıda "The compiled grammar is too large" hatası alındıktan sonra şema düzleştirildi; bu test yeniden büyümesini engeller.
describe("model çıktı şeması karmaşıklığı", () => {
  const schema = (zodOutputFormat(ModelOutputSchema) as unknown as { schema: Record<string, unknown> }).schema;
  const nodes: Record<string, unknown>[] = [];
  const walk = (n: unknown) => {
    if (n && typeof n === "object") {
      nodes.push(n as Record<string, unknown>);
      Object.values(n).forEach(walk);
    }
  };
  walk(schema);

  it("en fazla 5 nesne tipi içerir", () => {
    expect(nodes.filter((n) => n.type === "object").length).toBeLessThanOrEqual(5);
  });

  it("anyOf/oneOf/allOf, enum, const ve null türü içermez", () => {
    const s = JSON.stringify(schema);
    for (const k of ["anyOf", "oneOf", "allOf", "enum", "const", '"null"']) expect(s).not.toContain(k);
  });
});

describe("toDefinition", () => {
  it("düz çıktıyı oyun tanımına çevirir; meta girdiden gelir, boş metin null olur", () => {
    const def = makeDefinition(input);
    const r = toDefinition(toModelOutput(def), input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.definition.duraklar).toEqual(def.duraklar);
    expect(r.definition.meta).toMatchObject({ sinif: 10, ders: "Fizik", sure_dk: 40, deneyim: "dengeli", alan: "sinif", konu: input.konuAdi });
    expect(r.definition.duraklar[0].gorev.odul_id).toBeNull();
    expect(r.definition.duraklar[r.definition.duraklar.length - 1].varsayilan_sonraki_durak_id).toBeNull();
  });

  it("okul macerasında QR id'sini taşır, tek sınıfta QR'ı yok sayar", () => {
    const okul = resolvedInput({ sinif: 11, ders: "matematik", sure: 60, deneyim: "macera", alan: "okul" });
    const r = toDefinition(toModelOutput(makeDefinition(okul)), okul);
    expect(r.ok && r.definition.duraklar[0].mekan).toEqual({ tur: "qr", qr_durak_id: "qr-1", sonraki_durak_tarifi: expect.any(String) });
    const out = toModelOutput(makeDefinition(input));
    out.duraklar[0].qr_durak_id = "qr-5";
    const s = toDefinition(out, input);
    expect(s.ok && s.definition.duraklar[0].mekan.qr_durak_id).toBeNull();
  });

  it.each([
    ["bilinmeyen görev türü", (o: ReturnType<typeof toModelOutput>) => (o.duraklar[0].gorev_turu = "bulmaca"), "duraklar.0.gorev.tur"],
    ["bilinmeyen sahne türü", (o: ReturnType<typeof toModelOutput>) => (o.duraklar[1].sahne_turu = "sahne"), "duraklar.1.sahne_turu"],
    ["bilinmeyen nesne türü", (o: ReturnType<typeof toModelOutput>) => (o.envanter[0].tur = "hazine"), "envanter.0.tur"],
  ])("izinsiz değeri reddeder: %s", (_l, mutate, yol) => {
    const out = toModelOutput(makeDefinition(input));
    mutate(out);
    const r = toDefinition(out, input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(yol);
  });

  it("izinsiz değer gelirse composeAndValidate invalid-output hatası verir", async () => {
    const { composeAndValidate } = await import("@/lib/composer/service");
    const out = toModelOutput(makeDefinition(input));
    out.duraklar[0].gorev_turu = "bulmaca";
    await expect(composeAndValidate(input, fakeClient(out).client)).rejects.toMatchObject({ reason: "invalid-output" });
  });
});

describe("çok dersli oyun prompt'u", () => {
  it("her dersi kendi konusu ve kodlarıyla listeler ve disiplinler arası kuralı ekler", async () => {
    const coklu = resolvedInput({ sinif: 10, ders: ["fizik", "matematik"], sure: 40, deneyim: "dengeli", alan: "sinif" });
    const { client, calls } = fakeClient(toModelOutput(makeDefinition(coklu)));
    await composeGame(coklu, recipe, IZINLI_QR_IDLERI, client);
    const user = (calls[0].body.messages as { content: string }[])[0].content;
    expect(user).toContain("Ders: Fizik");
    expect(user).toContain("Ders: Matematik");
    for (const k of coklu.dersler) expect(user).toContain(k.unite.ad);
    for (const o of coklu.ogrenmeCiktilari) expect(user).toContain(o.kod);
    expect(user).toMatch(/HER BİRİ en az bir ana görevde/);
  });

  it("tek derste disiplinler arası kuralı eklemez", async () => {
    const { client, calls } = fakeClient(toModelOutput(makeDefinition(input)));
    await composeGame(input, recipe, IZINLI_QR_IDLERI, client);
    expect((calls[0].body.messages as { content: string }[])[0].content).not.toMatch(/disiplinler arası/);
  });
});

describe("hedef kodu", () => {
  it.each([
    ["FEL.10.1.1: Felsefenin anlamını sorgulayabilme", "FEL.10.1.1"],
    ["FİZ.10.1.2 İvme", "FİZ.10.1.2"],
    [" MAT.9.1.1 ", "MAT.9.1.1"],
    ["(FEL.10.1.1)", "FEL.10.1.1"],
    ["FEL.10.1.1-Felsefe", "FEL.10.1.1"],
    ["", ""],
  ])("%s → %s", (girdi, kod) => {
    expect(hedefKodu(girdi)).toBe(kod);
  });

  it("açıklamalı hedeflerle gelen oyun hedef-disi almadan geçer", async () => {
    const def = makeDefinition(input, 7);
    const out = toModelOutput(def);
    const acikla = (k: string) => `${k}: açıklama metni`;
    out.ogrenme_hedefleri = out.ogrenme_hedefleri.map(acikla);
    out.final.ogrenme_hedefleri = out.final.ogrenme_hedefleri.map(acikla);
    out.duraklar.forEach((d) => (d.ogrenme_hedefi = acikla(d.ogrenme_hedefi)));
    const { validation } = await composeAndValidate(input, fakeClient(out).client);
    expect(validation.hatalar).toEqual([]);
  });
});

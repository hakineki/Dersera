import { composeGame, ComposeError, DEFAULT_MODEL, modelFromEnv } from "@/lib/composer/anthropic";
import { buildRecipe } from "@/lib/composer/recipe";
import { IZINLI_QR_IDLERI } from "@/lib/composer/service";
import { SYSTEM_PROMPT } from "@/lib/composer/prompt";
import { fakeClient, makeDefinition, resolvedInput } from "./helpers/composerFixtures";

const input = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const recipe = buildRecipe(40, "dengeli", "sinif");

describe("composeGame", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("model çıktısını API seviyesinde JSON Schema ile zorlar (senaryo 5)", async () => {
    const { client, calls } = fakeClient(makeDefinition(input));
    await composeGame(input, recipe, IZINLI_QR_IDLERI, client);
    const format = (calls[0].body.output_config as { format: { type: string; schema: Record<string, unknown> } }).format;
    expect(format.type).toBe("json_schema");
    expect(format.schema.additionalProperties).toBe(false);
    expect(Object.keys(format.schema.properties as object)).toEqual(
      expect.arrayContaining(["meta", "duraklar", "final", "envanter", "ogrenme_hedefleri"])
    );
  });

  it("şemaya uymayan çıktıyı (parsed_output null) reddeder", async () => {
    const { client } = fakeClient(null);
    await expect(composeGame(input, recipe, IZINLI_QR_IDLERI, client)).rejects.toMatchObject({ reason: "invalid-output" });
  });

  it.each(["refusal", "max_tokens"])("stop_reason=%s çıktıyı kabul etmez", async (stop) => {
    const { client } = fakeClient(makeDefinition(input), stop);
    await expect(composeGame(input, recipe, IZINLI_QR_IDLERI, client)).rejects.toMatchObject({ reason: "invalid-output" });
  });

  it("modeli ANTHROPIC_MODEL'den okur, yoksa claude-sonnet-4-6 kullanır", async () => {
    delete process.env.ANTHROPIC_MODEL;
    expect(modelFromEnv()).toBe("claude-sonnet-4-6");
    expect(DEFAULT_MODEL).toBe("claude-sonnet-4-6");
    process.env.ANTHROPIC_MODEL = "claude-opus-5";
    const { client, calls } = fakeClient(makeDefinition(input));
    await composeGame(input, recipe, IZINLI_QR_IDLERI, client);
    expect(calls[0].body.model).toBe("claude-opus-5");
  });

  it("30 sn sınırını, yeniden denemesiz ve iptal sinyaliyle uygular", async () => {
    const { client, calls } = fakeClient(makeDefinition(input));
    await composeGame(input, recipe, IZINLI_QR_IDLERI, client);
    expect(calls[0].options).toMatchObject({ timeout: 30_000, maxRetries: 0 });
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
    const { client, calls } = fakeClient(makeDefinition(input));
    await composeGame(input, recipe, IZINLI_QR_IDLERI, client);
    const user = (calls[0].body.messages as { content: string }[])[0].content;
    expect(calls[0].body.system).toBe(SYSTEM_PROMPT);
    for (const o of input.ogrenmeCiktilari) expect(user).toContain(o.kod);
    expect(user).toContain(input.unite.ad);
    expect(user).not.toMatch(/takma ad|e-?posta|telefon|nickname/i);
    expect(user).not.toContain("qr-1");
  });

  it("okul macerasında yalnız QR kütüphanesindeki id'leri verir", async () => {
    const okul = resolvedInput({ sinif: 11, ders: "matematik", sure: 60, deneyim: "macera", alan: "okul" });
    const { client, calls } = fakeClient(makeDefinition(okul));
    await composeGame(okul, buildRecipe(60, "macera", "okul"), IZINLI_QR_IDLERI, client);
    const user = (calls[0].body.messages as { content: string }[])[0].content;
    expect(user).toContain("qr-1, qr-2");
    expect(user).toContain("qr-20");
    expect(user).not.toContain("qr-21");
  });
});

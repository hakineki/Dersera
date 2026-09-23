import OpenAI from "openai";
import { composeGameOpenAI, DEFAULT_OPENAI_MODEL, openAIModelFromEnv, type OpenAIComposeClient } from "@/lib/composer/openai";
import { ModelOutputSchema, type ModelOutput } from "@/lib/composer/modelOutput";
import { buildRecipe } from "@/lib/composer/recipe";
import { SYSTEM_PROMPT } from "@/lib/composer/prompt";
import { composeAndValidate, IZINLI_QR_IDLERI, saglayiciFromEnv } from "@/lib/composer/service";
import { makeDefinition, resolvedInput, toModelOutput } from "./helpers/composerFixtures";

const input = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const recipe = buildRecipe(40, "dengeli", "sinif");

function fakeOpenAI(parsed: ModelOutput | null, extra: { refusal?: string; throws?: unknown; content?: string; finish?: string } = {}) {
  const calls: { body: Record<string, unknown>; options: Record<string, unknown> }[] = [];
  const client = {
    chat: {
      completions: {
        create: async (body: Record<string, unknown>, options: Record<string, unknown>) => {
          calls.push({ body, options });
          if (extra.throws) throw extra.throws;
          return {
            model: "test",
            usage: { completion_tokens: 10 },
            choices: [{ finish_reason: extra.finish ?? "stop", message: { content: extra.content ?? (parsed ? JSON.stringify(parsed) : ""), refusal: extra.refusal ?? null } }],
          };
        },
      },
    },
  } as unknown as OpenAIComposeClient;
  return { client, calls };
}

beforeEach(() => jest.spyOn(console, "info").mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

describe("OpenAI sağlayıcısı", () => {
  it("modeli AI_MODEL'den okur, yoksa gpt-6-luna kullanır", () => {
    delete process.env.AI_MODEL;
    expect(openAIModelFromEnv()).toBe("gpt-6-luna");
    expect(DEFAULT_OPENAI_MODEL).toBe("gpt-6-luna");
    process.env.AI_MODEL = "baska-model";
    expect(openAIModelFromEnv()).toBe("baska-model");
    delete process.env.AI_MODEL;
  });

  it("aynı şemayı strict JSON schema olarak, 16000 token sınırı ve sistem prompt'uyla gönderir", async () => {
    const out = toModelOutput(makeDefinition(input));
    const { client, calls } = fakeOpenAI(out);
    expect(await composeGameOpenAI(input, recipe, IZINLI_QR_IDLERI, client)).toEqual(out);
    const body = calls[0].body as { max_completion_tokens: number; messages: { role: string; content: string }[]; response_format: { type: string; json_schema: { strict: boolean; schema: { required: string[] } } } };
    expect(body.max_completion_tokens).toBe(16000);
    expect(body.messages[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema.required).toEqual(Object.keys(ModelOutputSchema.shape));
    expect(calls[0].options).toMatchObject({ timeout: 240_000, maxRetries: 0 });
  });

  it.each([
    ["401", new OpenAI.AuthenticationError(401, undefined, "bad key", new Headers()), "config"],
    ["sunucu hatası", new OpenAI.InternalServerError(500, undefined, "down", new Headers()), "upstream"],
    ["zaman aşımı", new OpenAI.APIConnectionTimeoutError(), "timeout"],
    ["izin yok", new OpenAI.PermissionDeniedError(403, undefined, "no", new Headers()), "config"],
    ["beklenmeyen", new TypeError("x"), "upstream"],
  ])("%s → %s", async (_l, throws, reason) => {
    const { client } = fakeOpenAI(null, { throws });
    await expect(composeGameOpenAI(input, recipe, IZINLI_QR_IDLERI, client)).rejects.toMatchObject({ reason });
  });

  it.each([
    ["kesik (length)", { finish: "length", content: '{"baslik":"Yar' }, "max_tokens"],
    ["içerik filtresi", { finish: "content_filter" }, "içerik filtresi"],
    ["bitiş 'stop' ama kesik JSON", { content: '{"baslik":"Yar' }, "JSON olarak çözümlenemedi"],
    ["şemaya uymayan JSON", { content: "{}" }, "şemaya uymadı"],
  ])("%s → invalid-output", async (_l, extra, mesaj) => {
    await expect(composeGameOpenAI(input, recipe, IZINLI_QR_IDLERI, fakeOpenAI(null, extra).client)).rejects.toMatchObject({
      reason: "invalid-output",
      message: expect.stringContaining(mesaj),
    });
  });

  it("ret ve boş çıktı invalid-output olur", async () => {
    await expect(composeGameOpenAI(input, recipe, IZINLI_QR_IDLERI, fakeOpenAI(null, { refusal: "hayır" }).client)).rejects.toMatchObject({ reason: "invalid-output" });
    await expect(composeGameOpenAI(input, recipe, IZINLI_QR_IDLERI, fakeOpenAI(null).client)).rejects.toMatchObject({ reason: "invalid-output" });
  });

  it("OPENAI_API_KEY yoksa config hatası verir", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(composeGameOpenAI(input, recipe, IZINLI_QR_IDLERI)).rejects.toMatchObject({ reason: "config" });
  });
});

describe("sağlayıcı seçimi", () => {
  it("OPENAI_API_KEY varken composeAndValidate OpenAI'ye gider ve geçerli oyun üretir", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const out = toModelOutput(makeDefinition(input, 6));
    const spy = jest.spyOn(OpenAI.Chat.Completions.prototype, "create").mockResolvedValue({
      model: "test",
      usage: { completion_tokens: 1 },
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(out), refusal: null } }],
    } as never);
    const { validation, definition } = await composeAndValidate(input);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(validation.gecerli).toBe(true);
    expect(definition.meta.ders).toBe("Fizik");
    delete process.env.OPENAI_API_KEY;
  });

  it("OPENAI_API_KEY varsa OpenAI, yoksa Anthropic yedeği", () => {
    delete process.env.OPENAI_API_KEY;
    expect(saglayiciFromEnv()).toBe("anthropic");
    process.env.OPENAI_API_KEY = "sk-test";
    expect(saglayiciFromEnv()).toBe("openai");
    delete process.env.OPENAI_API_KEY;
  });
});

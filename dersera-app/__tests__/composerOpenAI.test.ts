import OpenAI from "openai";
import { LengthFinishReasonError } from "openai/core/error";
import { composeGameOpenAI, DEFAULT_OPENAI_MODEL, openAIModelFromEnv, type OpenAIComposeClient } from "@/lib/composer/openai";
import { ModelOutputSchema, type ModelOutput } from "@/lib/composer/modelOutput";
import { buildRecipe } from "@/lib/composer/recipe";
import { SYSTEM_PROMPT } from "@/lib/composer/prompt";
import { IZINLI_QR_IDLERI, saglayiciFromEnv } from "@/lib/composer/service";
import { makeDefinition, resolvedInput, toModelOutput } from "./helpers/composerFixtures";

const input = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const recipe = buildRecipe(40, "dengeli", "sinif");

function fakeOpenAI(parsed: ModelOutput | null, extra: { refusal?: string; throws?: unknown } = {}) {
  const calls: { body: Record<string, unknown>; options: Record<string, unknown> }[] = [];
  const client = {
    chat: {
      completions: {
        parse: async (body: Record<string, unknown>, options: Record<string, unknown>) => {
          calls.push({ body, options });
          if (extra.throws) throw extra.throws;
          return {
            model: "test",
            usage: { completion_tokens: 10 },
            choices: [{ finish_reason: "stop", message: { parsed, refusal: extra.refusal ?? null } }],
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

  it("aynı şemayı strict JSON schema olarak, 8000 token sınırı ve sistem prompt'uyla gönderir", async () => {
    const out = toModelOutput(makeDefinition(input));
    const { client, calls } = fakeOpenAI(out);
    expect(await composeGameOpenAI(input, recipe, IZINLI_QR_IDLERI, client)).toEqual(out);
    const body = calls[0].body as { max_completion_tokens: number; messages: { role: string; content: string }[]; response_format: { type: string; json_schema: { strict: boolean; schema: { required: string[] } } } };
    expect(body.max_completion_tokens).toBe(8000);
    expect(body.messages[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema.required).toEqual(Object.keys(ModelOutputSchema.shape));
    expect(calls[0].options).toMatchObject({ timeout: 240_000, maxRetries: 0 });
  });

  it.each([
    ["kesik çıktı", new LengthFinishReasonError(), "invalid-output"],
    ["bozuk JSON", new SyntaxError("Unexpected end of JSON input"), "invalid-output"],
    ["401", new OpenAI.AuthenticationError(401, undefined, "bad key", new Headers()), "config"],
    ["sunucu hatası", new OpenAI.InternalServerError(500, undefined, "down", new Headers()), "upstream"],
  ])("%s → %s", async (_l, throws, reason) => {
    const { client } = fakeOpenAI(null, { throws });
    await expect(composeGameOpenAI(input, recipe, IZINLI_QR_IDLERI, client)).rejects.toMatchObject({ reason });
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
  it("OPENAI_API_KEY varsa OpenAI, yoksa Anthropic yedeği", () => {
    delete process.env.OPENAI_API_KEY;
    expect(saglayiciFromEnv()).toBe("anthropic");
    process.env.OPENAI_API_KEY = "sk-test";
    expect(saglayiciFromEnv()).toBe("openai");
    delete process.env.OPENAI_API_KEY;
  });
});

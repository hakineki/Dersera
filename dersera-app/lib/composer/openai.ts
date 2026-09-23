import OpenAI from "openai";
import { ContentFilterFinishReasonError, LengthFinishReasonError } from "openai/core/error";
import { zodResponseFormat } from "openai/helpers/zod";
import { $ZodError } from "zod/v4/core";
import { COMPOSE_TIMEOUT_MS, ComposeError } from "@/lib/composer/anthropic";
import { ModelOutputSchema, type ModelOutput } from "@/lib/composer/modelOutput";
import type { ResolvedInput } from "@/lib/composer/input";
import { buildUserPrompt, SYSTEM_PROMPT } from "@/lib/composer/prompt";
import type { Recipe } from "@/lib/composer/recipe";

// OpenAI uyumlu sağlayıcı. Aynı düz ModelOutputSchema kullanılır; GameDefinition'a dönüşüm değişmez.
export const DEFAULT_OPENAI_MODEL = "gpt-6-luna";
const MAX_TOKENS = 8_000;

// Sadece test için enjekte edilebilir; üretimde env'den kurulur.
export interface OpenAIComposeClient {
  chat: { completions: Pick<OpenAI["chat"]["completions"], "parse"> };
}

export function openAIModelFromEnv(): string {
  return process.env.AI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

function clientFromEnv(): OpenAIComposeClient {
  if (!process.env.OPENAI_API_KEY) {
    throw new ComposeError("config", "OPENAI_API_KEY tanımlı değil");
  }
  return new OpenAI({ maxRetries: 0 });
}

export async function composeGameOpenAI(
  input: ResolvedInput,
  recipe: Recipe,
  izinliQrIdleri: string[],
  client: OpenAIComposeClient = clientFromEnv(),
  timeoutMs = COMPOSE_TIMEOUT_MS
): Promise<ModelOutput> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const completion = await client.chat.completions.parse(
      {
        model: openAIModelFromEnv(),
        max_completion_tokens: MAX_TOKENS,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(input, recipe, izinliQrIdleri) },
        ],
        response_format: zodResponseFormat(ModelOutputSchema, "dersera_oyun"),
      },
      { signal: controller.signal, timeout: timeoutMs, maxRetries: 0 }
    );
    const choice = completion.choices[0];
    console.info(`[compose] model=${completion.model} stop=${choice?.finish_reason} output_tokens=${completion.usage?.completion_tokens}`);
    if (choice?.message.refusal) throw new ComposeError("invalid-output", "Model isteği reddetti");
    if (!choice?.message.parsed) throw new ComposeError("invalid-output", "Çıktı şemaya uymadı");
    return choice.message.parsed;
  } catch (err) {
    if (err instanceof ComposeError) throw err;
    if (err instanceof LengthFinishReasonError) {
      throw new ComposeError("invalid-output", `Çıktı max_tokens (${MAX_TOKENS}) sınırında kesildi`);
    }
    if (err instanceof ContentFilterFinishReasonError) throw new ComposeError("invalid-output", "Çıktı içerik filtresine takıldı");
    if (controller.signal.aborted || err instanceof OpenAI.APIConnectionTimeoutError || err instanceof OpenAI.APIUserAbortError) {
      throw new ComposeError("timeout", `Oyun oluşturma ${timeoutMs / 1000} saniyede tamamlanmadı`);
    }
    if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError) {
      throw new ComposeError("config", `OpenAI kimlik doğrulaması başarısız (${err.status})`);
    }
    if (err instanceof OpenAI.APIError) {
      throw new ComposeError("upstream", `OpenAI API hatası ${err.status ?? ""}: ${err.message}`);
    }
    if (err instanceof SyntaxError) {
      throw new ComposeError("invalid-output", `Çıktı JSON olarak çözümlenemedi: ${err.message}`);
    }
    // SDK çıktıyı şemayla doğrular; uymayan JSON bir Zod hatası fırlatır.
    if (err instanceof $ZodError) throw new ComposeError("invalid-output", "Çıktı şemaya uymadı");
    throw new ComposeError("upstream", err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

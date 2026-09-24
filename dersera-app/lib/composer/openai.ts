import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { COMPOSE_TIMEOUT_MS } from "@/lib/composer/anthropic";
import { ComposeError } from "@/lib/composer/errors";
import { parcaliUret } from "@/lib/composer/parcali";
import type { z } from "zod";
import { parseJsonText, type ModelOutput } from "@/lib/composer/modelOutput";
import type { ResolvedInput } from "@/lib/composer/input";
import { SYSTEM_PROMPT } from "@/lib/composer/prompt";
import type { Recipe } from "@/lib/composer/recipe";

// OpenAI uyumlu sağlayıcı. Aynı düz ModelOutputSchema kullanılır; GameDefinition'a dönüşüm değişmez.
export const DEFAULT_OPENAI_MODEL = "gpt-6-luna";

// Sadece test için enjekte edilebilir; üretimde env'den kurulur.
export interface OpenAIComposeClient {
  chat: { completions: Pick<OpenAI["chat"]["completions"], "create"> };
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
  client?: OpenAIComposeClient,
  timeoutMs = COMPOSE_TIMEOUT_MS
): Promise<ModelOutput> {
  return parcaliUret(input, recipe, izinliQrIdleri, (schema, ad, prompt, maxTokens, t) => yapilandirilmisIstekOpenAI(schema, ad, prompt, maxTokens, client, t), timeoutMs);
}

export async function yapilandirilmisIstekOpenAI<S extends z.ZodObject<z.ZodRawShape>>(
  schema: S,
  semaAdi: string,
  user: string,
  maxTokens: number,
  client: OpenAIComposeClient = clientFromEnv(),
  timeoutMs = COMPOSE_TIMEOUT_MS
): Promise<z.infer<S>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // parse() yerine create(): SDK kesik JSON'da bitiş nedenini loglamadan hata fırlatıyordu.
    const completion = await client.chat.completions.create(
      {
        model: openAIModelFromEnv(),
        max_completion_tokens: maxTokens,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: user },
        ],
        response_format: zodResponseFormat(schema, semaAdi),
      },
      { signal: controller.signal, timeout: timeoutMs, maxRetries: 0 }
    );
    const choice = completion.choices[0];
    console.info(`[compose] model=${completion.model} stop=${choice?.finish_reason} output_tokens=${completion.usage?.completion_tokens}`);
    if (choice?.message.refusal) throw new ComposeError("invalid-output", "Model isteği reddetti");
    if (choice?.finish_reason === "length") throw new ComposeError("invalid-output", `Çıktı max_tokens (${maxTokens}) sınırında kesildi`);
    if (choice?.finish_reason === "content_filter") throw new ComposeError("invalid-output", "Çıktı içerik filtresine takıldı");
    const parsed = parseJsonText(choice?.message.content ?? "", schema);
    if (!parsed.ok) throw new ComposeError("invalid-output", `${parsed.error} (stop=${choice?.finish_reason})`);
    return parsed.output;
  } catch (err) {
    if (err instanceof ComposeError) throw err;
    if (controller.signal.aborted || err instanceof OpenAI.APIConnectionTimeoutError || err instanceof OpenAI.APIUserAbortError) {
      throw new ComposeError("timeout", `Oyun oluşturma ${timeoutMs / 1000} saniyede tamamlanmadı`);
    }
    if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError) {
      throw new ComposeError("config", `OpenAI kimlik doğrulaması başarısız (${err.status})`);
    }
    if (err instanceof OpenAI.APIError) {
      throw new ComposeError("upstream", `OpenAI API hatası ${err.status ?? ""}: ${err.message}`);
    }
    throw new ComposeError("upstream", err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

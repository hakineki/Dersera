import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ModelOutputSchema, parseModelText, type ModelOutput } from "@/lib/composer/modelOutput";
import type { ResolvedInput } from "@/lib/composer/input";
import { buildUserPrompt, SYSTEM_PROMPT } from "@/lib/composer/prompt";
import type { Recipe } from "@/lib/composer/recipe";

export const DEFAULT_MODEL = "claude-sonnet-4-6";
export const COMPOSE_TIMEOUT_MS = 240_000; // tam oyun 8–16k token; model bunu 1,5–3 dakikada yazar
// Tam oyun 1,5–3 dakikada üretilir; çıktı kısa tutulur ve maliyet üst sınırı konur.
const MAX_TOKENS = 16_000; // 8k Sonnet 5 çıktısını kesiyordu

export type ComposeFailure = "config" | "timeout" | "upstream" | "invalid-output";

export class ComposeError extends Error {
  constructor(
    public readonly reason: ComposeFailure,
    message: string
  ) {
    super(message);
  }
}

// Sadece test için enjekte edilebilir; üretimde env'den kurulur.
export interface ComposeClient {
  messages: Pick<Anthropic["messages"], "create">;
}

export function modelFromEnv(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

function clientFromEnv(): ComposeClient {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ComposeError("config", "ANTHROPIC_API_KEY tanımlı değil");
  }
  // Yeniden deneme 240 sn'lik kesin sınırı aşar; tekrar denemeyi öğretmen yapar.
  return new Anthropic({ maxRetries: 0 });
}

export async function composeGame(
  input: ResolvedInput,
  recipe: Recipe,
  izinliQrIdleri: string[],
  client: ComposeClient = clientFromEnv(),
  timeoutMs = COMPOSE_TIMEOUT_MS
): Promise<ModelOutput> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // parse() yerine create(): SDK kesik JSON'da bitiş nedenini loglamadan hata fırlatıyordu.
    const response = await client.messages.create(
      {
        model: modelFromEnv(),
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(input, recipe, izinliQrIdleri) }],
        output_config: { format: zodOutputFormat(ModelOutputSchema) },
      },
      { signal: controller.signal, timeout: timeoutMs, maxRetries: 0 }
    );
    console.info(`[compose] model=${response.model} stop=${response.stop_reason} output_tokens=${response.usage?.output_tokens}`);
    if (response.stop_reason === "refusal") throw new ComposeError("invalid-output", "Model isteği reddetti");
    if (response.stop_reason === "max_tokens") throw new ComposeError("invalid-output", `Çıktı max_tokens (${MAX_TOKENS}) sınırında kesildi`);
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const parsed = parseModelText(text);
    if (!parsed.ok) throw new ComposeError("invalid-output", `${parsed.error} (stop=${response.stop_reason})`);
    return parsed.output;
  } catch (err) {
    if (err instanceof ComposeError) throw err;
    if (controller.signal.aborted || err instanceof Anthropic.APIConnectionTimeoutError || err instanceof Anthropic.APIUserAbortError) {
      throw new ComposeError("timeout", `Oyun oluşturma ${timeoutMs / 1000} saniyede tamamlanmadı`);
    }
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new ComposeError("config", `Anthropic kimlik doğrulaması başarısız (${err.status})`);
    }
    if (err instanceof Anthropic.APIError) {
      throw new ComposeError("upstream", `Anthropic API hatası ${err.status ?? ""}: ${err.message}`);
    }
    throw new ComposeError("upstream", err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

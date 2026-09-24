import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { ComposeError } from "@/lib/composer/errors";
import { parseJsonText, type ModelOutput } from "@/lib/composer/modelOutput";
import { parcaliUret } from "@/lib/composer/parcali";
import type { ResolvedInput } from "@/lib/composer/input";
import { SYSTEM_PROMPT } from "@/lib/composer/prompt";
import type { Recipe } from "@/lib/composer/recipe";

export const DEFAULT_MODEL = "claude-sonnet-4-6";
// Parçalı üretimin (iskelet + paralel görevler) toplam üst sınırı; düzeltme çağrısı kalan süreyle yapılır (service.ts).
export const COMPOSE_TIMEOUT_MS = 190_000;

export { ComposeError, type ComposeFailure } from "@/lib/composer/errors";

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
  client?: ComposeClient,
  timeoutMs = COMPOSE_TIMEOUT_MS
): Promise<ModelOutput> {
  return parcaliUret(input, recipe, izinliQrIdleri, (schema, _ad, prompt, maxTokens, t) => yapilandirilmisIstek(schema, prompt, maxTokens, client, t), timeoutMs);
}

// Sistem prompt'u + tek kullanıcı mesajı → şemaya uyan JSON. İskelet, görev doldurma ve durak düzeltmesi bunu kullanır.
export async function yapilandirilmisIstek<S extends z.ZodObject<z.ZodRawShape>>(
  schema: S,
  user: string,
  maxTokens: number,
  client: ComposeClient = clientFromEnv(),
  timeoutMs = COMPOSE_TIMEOUT_MS
): Promise<z.infer<S>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // parse() yerine create(): SDK kesik JSON'da bitiş nedenini loglamadan hata fırlatıyordu.
    const response = await client.messages.create(
      {
        model: modelFromEnv(),
        max_tokens: maxTokens,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: user }],
        output_config: { format: zodOutputFormat(schema) },
      },
      { signal: controller.signal, timeout: timeoutMs, maxRetries: 0 }
    );
    console.info(`[compose] model=${response.model} stop=${response.stop_reason} output_tokens=${response.usage?.output_tokens}`);
    if (response.stop_reason === "refusal") throw new ComposeError("invalid-output", "Model isteği reddetti");
    if (response.stop_reason === "max_tokens") throw new ComposeError("invalid-output", `Çıktı max_tokens (${maxTokens}) sınırında kesildi`);
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const parsed = parseJsonText(text, schema);
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

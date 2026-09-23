import { ComposeError, composeGame, type ComposeClient } from "@/lib/composer/anthropic";
import { toDefinition, type ModelOutput } from "@/lib/composer/modelOutput";
import { composeGameOpenAI } from "@/lib/composer/openai";
import type { Recipe } from "@/lib/composer/recipe";
import { onar } from "@/lib/composer/repair";
import type { GameDefinition } from "@/lib/composer/definition";
import { describeKonular, resolveKonular, type DersKonu, type ResolvedInput } from "@/lib/composer/input";
import { IZINLI_QR_IDLERI, validationContext } from "@/lib/composer/context";
import { buildRecipe } from "@/lib/composer/recipe";
import { validateGame, type ValidationResult } from "@/lib/composer/validator";

export { IZINLI_QR_IDLERI, validationContext };

export interface ComposeResult {
  definition: GameDefinition;
  validation: ValidationResult;
}

export type Saglayici = "openai" | "anthropic";

// OPENAI_API_KEY tanımlıysa OpenAI, değilse Anthropic kullanılır (Anthropic yedek sağlayıcıdır).
export function saglayiciFromEnv(): Saglayici {
  return process.env.OPENAI_API_KEY?.trim() ? "openai" : "anthropic";
}

function uret(input: ResolvedInput, recipe: Recipe, client?: ComposeClient): Promise<ModelOutput> {
  if (client) return composeGame(input, recipe, IZINLI_QR_IDLERI, client);
  return saglayiciFromEnv() === "openai"
    ? composeGameOpenAI(input, recipe, IZINLI_QR_IDLERI)
    : composeGame(input, recipe, IZINLI_QR_IDLERI);
}

export async function composeAndValidate(input: ResolvedInput, client?: ComposeClient): Promise<ComposeResult> {
  const recipe = buildRecipe(input.sure, input.deneyim, input.alan);
  const raw = await uret(input, recipe, client);
  const converted = toDefinition(raw, input);
  if (!converted.ok) throw new ComposeError("invalid-output", `Çıktı oyun şemasına uymadı: ${converted.error}`);
  const { definition, notlar } = onar(converted.definition);
  const validation = validateGame(definition, validationContext(input));
  validation.uyarilar.unshift(...notlar.map((mesaj) => ({ kod: "otomatik-duzeltme", mesaj })));
  return { definition, validation };
}

// Yayın ve düzenleme sonrası: tanımı müfredata göre yeniden doğrular (istemciye güvenmez).
export function revalidate(def: GameDefinition, dersler: DersKonu[]): ValidationResult | null {
  const r = resolveKonular(def.meta.sinif, dersler);
  if (!r.ok) return null;
  const d = describeKonular(r.konular);
  if (d.dersAdi !== def.meta.ders || d.konuAdi !== def.meta.konu) return null;
  return validateGame(
    def,
    validationContext({ alan: def.meta.alan, deneyim: def.meta.deneyim, sure: def.meta.sure_dk, ogrenmeCiktilari: d.ogrenmeCiktilari, hedefDersleri: d.hedefDersleri })
  );
}

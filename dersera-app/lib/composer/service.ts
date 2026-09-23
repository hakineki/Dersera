import { ComposeError, composeGame, type ComposeClient } from "@/lib/composer/anthropic";
import { toDefinition } from "@/lib/composer/modelOutput";
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

export async function composeAndValidate(input: ResolvedInput, client?: ComposeClient): Promise<ComposeResult> {
  const recipe = buildRecipe(input.sure, input.deneyim, input.alan);
  const raw = await composeGame(input, recipe, IZINLI_QR_IDLERI, client);
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

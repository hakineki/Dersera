import { PROGRAM_DERS_ADI, getUnite } from "@/data/mufredat/programlar";
import { composeGame, type ComposeClient } from "@/lib/composer/anthropic";
import type { GameDefinition } from "@/lib/composer/definition";
import type { ResolvedInput } from "@/lib/composer/input";
import { IZINLI_QR_IDLERI, validationContext } from "@/lib/composer/context";
import { buildRecipe } from "@/lib/composer/recipe";
import { validateGame, type ValidationResult } from "@/lib/composer/validator";

export { IZINLI_QR_IDLERI, validationContext };

export interface ComposeResult {
  definition: GameDefinition;
  validation: ValidationResult;
}

// meta alanları modelden değil, doğrulanmış girdiden gelir.
export function withTrustedMeta(def: GameDefinition, input: ResolvedInput): GameDefinition {
  return {
    ...def,
    meta: {
      baslik: def.meta.baslik,
      sinif: input.sinif,
      ders: PROGRAM_DERS_ADI[input.ders],
      konu: input.unite.ad,
      sure_dk: input.sure,
      deneyim: input.deneyim,
      alan: input.alan,
    },
  };
}

export async function composeAndValidate(input: ResolvedInput, client?: ComposeClient): Promise<ComposeResult> {
  const recipe = buildRecipe(input.sure, input.deneyim, input.alan);
  const raw = await composeGame(input, recipe, IZINLI_QR_IDLERI, client);
  const definition = withTrustedMeta(raw, input);
  return { definition, validation: validateGame(definition, validationContext(input)) };
}

// Yayın ve düzenleme sonrası: tanımı müfredata göre yeniden doğrular (istemciye güvenmez).
export function revalidate(def: GameDefinition, konuId: string): ValidationResult | null {
  const sinif = def.meta.sinif;
  const dersKey = Object.entries(PROGRAM_DERS_ADI).find(([, ad]) => ad === def.meta.ders)?.[0];
  const unite = dersKey ? getUnite(sinif, dersKey, konuId) : undefined;
  if (!unite || unite.ad !== def.meta.konu) return null;
  return validateGame(
    def,
    validationContext({ alan: def.meta.alan, deneyim: def.meta.deneyim, sure: def.meta.sure_dk, ogrenmeCiktilari: unite.ogrenmeCiktilari })
  );
}

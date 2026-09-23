import type { OgrenmeCiktisi } from "@/data/mufredat/programlar";
import type { Alan, Deneyim } from "@/lib/composer/input";
import { buildRecipe } from "@/lib/composer/recipe";
import type { ValidationContext } from "@/lib/composer/validator";
import { QR_COUNT, stopId } from "@/lib/games";

// Okul macerasında kullanılabilecek tek QR kümesi: mevcut sabit QR kütüphanesi.
export const IZINLI_QR_IDLERI = Array.from({ length: QR_COUNT }, (_, i) => stopId(i + 1));

// Sunucu ve tarayıcı (düzenleme sonrası yeniden doğrulama) aynı bağlamı kullanır.
export function validationContext(input: {
  alan: Alan;
  deneyim: Deneyim;
  sure: number;
  ogrenmeCiktilari: OgrenmeCiktisi[];
}): ValidationContext {
  return {
    izinliHedefler: input.ogrenmeCiktilari.map((o) => o.kod),
    alan: input.alan,
    deneyim: input.deneyim,
    izinliQrIdleri: IZINLI_QR_IDLERI,
    recipe: buildRecipe(input.sure, input.deneyim, input.alan),
  };
}

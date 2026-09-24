import { parseComposerDefinition } from "@/lib/composer/adapter";
import type { GameDefinition } from "@/lib/composer/definition";
import { describeKonular, resolveKonular, type DersKonu } from "@/lib/composer/input";

// Düzenleyicinin (composer önizlemesi) ihtiyaç duyduğu bağlam: öğrenme çıktıları ve güncel doğrulama.
// Kütüphane ve topluluk oyunları aynı biçimde açılır; müfredat verisi sunucuda kalır.
export function duzenlemeBaglami(sinif: number, dersler: DersKonu[], definition: GameDefinition) {
  const r = resolveKonular(sinif, dersler);
  const d = r.ok ? describeKonular(r.konular) : null;
  const dogrulama = parseComposerDefinition(definition, dersler);
  return {
    hedefler: d?.ogrenmeCiktilari ?? [],
    hedefDersleri: d?.hedefDersleri ?? {},
    validation: dogrulama.ok ? dogrulama.validation : null,
  };
}

import type { GameDefinition } from "@/lib/composer/definition";

// Görsel zenginleştirme (docs/URUN-BAGLAMI.md V2): tek onay kutusu, kapak + 3 ana sahne (ilerleme 0–4/4), asenkron;
// oyun görseller bitmeden de oynanır. Tanım yalnız iş kimliğini ve görseli hazır hedefleri taşır; görselin adresi
// sunucudaki eşlemeden gelir (/api/gorsel/dosya/...), böylece tanıma dışarıdan görsel adresi konamaz.
// Bu dosya istemci ile sunucunun ortak kurallarıdır: ağır modül içe aktarmamalı.

export const GORSEL = {
  sahne: 3,
  enCok: 4,
} as const;

export const KAPAK = "kapak";
export const GORSEL_IS_ID = /^[0-9a-f-]{36}$/;
export const GORSEL_HEDEF = /^[a-z0-9_-]{1,24}$/;

export const gorselYolu = (isId: string, hedef: string) => `/api/gorsel/dosya/${isId}/${hedef}`;

export function gorselAdresi(def: GameDefinition, hedef: string): string | null {
  const g = def.gorseller;
  return g && g.hedefler.includes(hedef) ? gorselYolu(g.isId, hedef) : null;
}

// Hazır görselleri tanıma ekler (aynı işin önceki görselleriyle birleşir; yanıtlar sırasız gelebilir). Öğretmen bu arada
// durak sildiyse o durağın görseli eklenmez. Sıra: kapak, sonra durak sırası. Değişiklik yoksa aynı nesne döner.
export function gorselleriBirlestir(def: GameDefinition, isId: string, hazir: string[]): GameDefinition {
  const eski = def.gorseller;
  const sira = (h: string) => (h === KAPAK ? -1 : def.duraklar.findIndex((d) => d.id === h));
  const hedefler = [...new Set([...(eski?.isId === isId ? eski.hedefler : []), ...hazir])]
    .filter((h) => sira(h) !== -1 || h === KAPAK)
    .sort((a, b) => sira(a) - sira(b))
    .slice(0, GORSEL.enCok);
  if (hedefler.length === 0) return def;
  if (eski && eski.isId === isId && eski.hedefler.length === hedefler.length && eski.hedefler.every((h, i) => h === hedefler[i])) return def;
  return { ...def, gorseller: { isId, hedefler } };
}

import type { Durak, GameDefinition } from "@/lib/composer/definition";
import type { GameProgress, SceneState } from "@/lib/gameState";
import type { Stop } from "@/data/stops";

// Sahne oynatıcısının saf durum makinesi. Yanlış cevap rotayı değiştirmez (ipucu → ipucu → destek görevin içindedir);
// rota yalnızca seçim sahnelerindeki oyuncu kararıyla değişir.

export const FINAL_ID = "final";

export type Step =
  | { tur: "gecis"; hedef: string; onceki: Durak | null }
  | { tur: "gorev"; durak: Durak }
  | { tur: "secim"; durak: Durak }
  | { tur: "final" }
  | { tur: "bitti" };

export function durakById(def: GameDefinition, id: string): Durak | undefined {
  return def.duraklar.find((d) => d.id === id);
}

export function currentStep(def: GameDefinition, state: SceneState, progress: GameProgress, bitti: boolean): Step {
  if (bitti) return { tur: "bitti" };
  const son = state.yol[state.yol.length - 1];
  if (son === FINAL_ID) return { tur: "final" };
  if (!son) return { tur: "gecis", hedef: state.hedef ?? def.duraklar[0].id, onceki: null };

  const durak = durakById(def, son);
  if (!durak) return { tur: "gecis", hedef: def.duraklar[0].id, onceki: null };
  // Geri dönüşlü rotada tamamlanmış sahneye yeniden gelinirse görev tekrarlanmaz.
  if (!progress[durak.id]) return { tur: "gorev", durak };
  if (state.hedef) return { tur: "gecis", hedef: state.hedef, onceki: durak };
  if (durak.sahne_turu === "secim") return { tur: "secim", durak };
  return { tur: "gecis", hedef: durak.varsayilan_sonraki_durak_id ?? FINAL_ID, onceki: durak };
}

export function choose(state: SceneState, hedef: string): SceneState {
  return { ...state, hedef };
}

export function arrive(state: SceneState, hedef: string): SceneState {
  return { yol: [...state.yol, hedef], hedef: null };
}

export function qrOf(def: GameDefinition, durakId: string): number | null {
  const q = durakById(def, durakId)?.mekan.qr_durak_id;
  return q ? Number(q.replace(/^qr-/, "")) : null;
}

// Okul macerasında hedefe varış, o durağın QR'ının taranmasıyla olur. Final ve tek sınıf sahneleri QR istemez.
export function needsScan(def: GameDefinition, hedef: string): boolean {
  return def.meta.alan === "okul" && hedef !== FINAL_ID && qrOf(def, hedef) !== null;
}

// Öğretmen panelinin sonuç tablosu için: sonuçlardaki durak anahtarları (d1, d2, ...) ile aynı kimlikler.
export function definitionPanelStops(def: GameDefinition): Stop[] {
  return def.duraklar.map((d, i) => ({
    id: d.id,
    order: i + 1,
    name: d.isim,
    emoji: d.sahne_turu === "secim" ? "🔀" : "🎬",
    subject: def.meta.ders,
    dersKey: "genel-kultur",
    nextStopId: d.varsayilan_sonraki_durak_id,
    nextClue: d.mekan.sonraki_durak_tarifi,
    hikaye: d.hikaye_metni,
  }));
}

export function inventory(def: GameDefinition, progress: GameProgress): string[] {
  return [...new Set(def.duraklar.filter((d) => progress[d.id] && d.gorev.odul_id).map((d) => d.gorev.odul_id as string))];
}

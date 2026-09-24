import type { GameDefinition } from "@/lib/composer/definition";

// Oyun sürümleme (docs/URUN-BAGLAMI.md §7): deterministik, yapay zekâ kullanmaz.
// Kaydedilen düzenleme anlamlı içeriğin en çok %30'unu değiştiriyorsa aynı oyunun yeni sürümüdür; daha fazlası ya da
// oyunun kimliğini (sınıf, ders, konu, alan, deneyim, süre) değiştiren düzenleme yeni bir varyant olarak ayrılır.
// Yayınlanmış oyun kodu yayın anındaki tanımı taşır: süren sınıf oturumu başladığı sürümle biter.

export const VARYANT_ESIGI = 0.3;

// Karşılaştırma birimleri: oyun girişi, her durak (kimliğiyle), envanter ve final.
function birimler(def: GameDefinition): Map<string, string> {
  const m = new Map<string, string>();
  m.set("giris", JSON.stringify([def.meta.baslik, def.hikaye_giris, def.oyun_amaci, def.ogrenme_hedefleri]));
  for (const d of def.duraklar) m.set(`durak:${d.id}`, JSON.stringify(d));
  m.set("envanter", JSON.stringify(def.envanter));
  m.set("final", JSON.stringify(def.final));
  return m;
}

// Değişen birimlerin oranı (0–1). Eklenen ya da silinen durak da değişmiş birim sayılır.
export function degisimOrani(eski: GameDefinition, yeni: GameDefinition): number {
  const a = birimler(eski);
  const b = birimler(yeni);
  const anahtarlar = new Set([...a.keys(), ...b.keys()]);
  let degisen = 0;
  for (const k of anahtarlar) if (a.get(k) !== b.get(k)) degisen++;
  return degisen / anahtarlar.size;
}

const KIMLIK_ALANLARI = ["sinif", "ders", "konu", "alan", "deneyim", "sure_dk"] as const;

export function kimlikDegisti(eski: GameDefinition, yeni: GameDefinition): boolean {
  return KIMLIK_ALANLARI.some((a) => eski.meta[a] !== yeni.meta[a]);
}

export type SurumKarari = { tur: "ayni" } | { tur: "surum"; oran: number } | { tur: "varyant"; oran: number; neden: "oran" | "kimlik" };

export function surumKarari(eski: GameDefinition, yeni: GameDefinition): SurumKarari {
  const oran = degisimOrani(eski, yeni);
  if (kimlikDegisti(eski, yeni)) return { tur: "varyant", oran, neden: "kimlik" };
  if (oran === 0) return { tur: "ayni" };
  return oran > VARYANT_ESIGI ? { tur: "varyant", oran, neden: "oran" } : { tur: "surum", oran };
}

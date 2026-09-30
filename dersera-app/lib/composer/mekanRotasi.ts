import type { GameDefinition } from "@/lib/composer/definition";
import type { GameProgress } from "@/lib/gameState";

// Mekân rotası kuralları (istemci ve sunucu). Duraklar okulun gerçek mekânlarındadır; oyuncu bir durağın görevini bitirince
// sıradaki durağın konum bilmecesini alır ve QR'ı bilmecenin anlattığı noktada bulur. Rota döngüseldir: her takım farklı
// bir duraktan başlar, sırayla hepsini dolaşır, sonra herkes aynı finale varır. Hikâye bu yüzden durak sırasına bağlı
// değildir; kanıtlar ve final birleştirir.

// Konum ipucunun ve yanlış mekânda taranan QR'ın süre cezası (saniye).
export const KONUM_IPUCU_CEZASI = 30;
export const YANLIS_QR_CEZASI = 30;

export const rotaMi = (def: GameDefinition): boolean => def.meta.rota === "mekan";

// Tarif: durak sayısına göre toplanacak kanıt (8 durakta 3).
export const kanitSayisi = (durak: number): number => Math.max(2, Math.round((durak * 3) / 8));

// Takımın başlangıç durağı: cihazda bir kez rastgele seçilir (takımlar farklı mekânlardan başlasın, kapıda yığılma olmasın).
export function baslangicSec(def: GameDefinition, rastgele: () => number = Math.random): string {
  return def.duraklar[Math.floor(rastgele() * def.duraklar.length) % def.duraklar.length].id;
}

// Döngüde verilen duraktan sonraki ilk tamamlanmamış durak; hepsi bittiyse null (final).
export function sonrakiRotaDuragi(def: GameDefinition, sonId: string, progress: GameProgress): string | null {
  const n = def.duraklar.length;
  const i = def.duraklar.findIndex((d) => d.id === sonId);
  for (let k = 1; k <= n; k++) {
    const d = def.duraklar[(i + k) % n];
    if (!progress[d.id]) return d.id;
  }
  return null;
}

// Taranan QR numarasının hangi durağa ait olduğu (yoksa null).
export function qrDuragi(def: GameDefinition, qr: number): string | null {
  return def.duraklar.find((d) => d.mekan.qr_durak_id === `qr-${qr}`)?.id ?? null;
}

// Sayfayı açan taramanın sonucu: hedefin QR'ı → varış; çözülmüş bir yerin QR'ı → uyarı (ceza yok); başka bir QR → yanlış
// yer ve bu hedef ile QR için ilk kezse ceza. anahtar, cezası kesilmiş taramaların listesine eklenir.
export type TaramaSonucu = { tur: "varis" } | { tur: "cozulmus" } | { tur: "yanlis"; ceza: boolean; anahtar: string };
export function taramaSonucu(def: GameDefinition, hedef: string, qr: number, progress: GameProgress, cezalilar: string[] = []): TaramaSonucu {
  const hedefQr = def.duraklar.find((d) => d.id === hedef)?.mekan.qr_durak_id;
  if (hedefQr === `qr-${qr}`) return { tur: "varis" };
  const qrDurak = qrDuragi(def, qr);
  if (qrDurak && progress[qrDurak]) return { tur: "cozulmus" };
  const anahtar = `${hedef}:${qr}`;
  return { tur: "yanlis", ceza: !cezalilar.includes(anahtar), anahtar };
}

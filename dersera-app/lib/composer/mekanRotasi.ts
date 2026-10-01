import type { GameDefinition } from "@/lib/composer/definition";
import type { GameProgress, SceneState } from "@/lib/gameState";

// Mekân rotası kuralları (istemci ve sunucu). Duraklar okulun gerçek mekânlarındadır; oyuncu bir durağın görevini bitirince
// sıradaki durağın konum bilmecesini alır ve QR'ı bilmecenin anlattığı noktada bulur. Rota döngüseldir: her takım farklı
// bir duraktan başlar, sırayla hepsini dolaşır, sonra herkes aynı finale varır. Hikâye bu yüzden durak sırasına bağlı
// değildir; kanıtlar ve final birleştirir.

// Konum ipucunun ve yanlış mekânda taranan QR'ın süre cezası (saniye).
export const KONUM_IPUCU_CEZASI = 30;
export const YANLIS_QR_CEZASI = 30;

export const rotaMi = (def: GameDefinition): boolean => def.meta.rota === "mekan";

// Öğretmenin yerleşim listesi ve basılı çıktısı: QR numarası sırasıyla her kartın yapıştırılacağı yer. Sıra dolaşma
// sırası değildir (takımlar farklı kartlardan başlar).
export interface YerlesimSatiri {
  durakId: string;
  qr: number;
  mekan: string;
  nokta: string;
}
export function yerlesimSatirlari(def: GameDefinition): YerlesimSatiri[] {
  return def.duraklar
    .flatMap((d) => {
      const qr = Number(d.mekan.qr_durak_id?.replace(/^qr-/, ""));
      return d.mekan.yer && Number.isInteger(qr) && qr > 0 ? [{ durakId: d.id, qr, mekan: d.mekan.yer.mekan_adi, nokta: d.mekan.yer.nokta }] : [];
    })
    .sort((a, b) => a.qr - b.qr);
}

// Tarif: durak sayısına göre toplanacak kanıt (8 durakta 3).
export const kanitSayisi = (durak: number): number => Math.max(2, Math.round((durak * 3) / 8));

// Takımın başlangıç durağı katılım sırasından dağıtılır (1. takım 1. durak, 2. takım 2. durak, …; durak sayısını aşınca
// başa döner): takımlar farklı mekânlardan başlar, kapıda yığılma olmaz. Sıra bilinmiyorsa (demo, eski katılım) rastgele.
export function baslangicSec(def: GameDefinition, sira: number | null, rastgele: () => number = Math.random): string {
  const n = def.duraklar.length;
  const i = sira !== null && sira > 0 ? (sira - 1) % n : Math.floor(rastgele() * n) % n;
  return def.duraklar[i].id;
}

// Açılıştaki kayıtta başlangıç henüz seçilmemişse bu açılış takımın katılımıdır: başlangıç burada seçilir ve katılımı
// açan başka bir QR taraması cezasız yok sayılır. Sonraki açılışlarda (başlangıç kayıtlı) yanlış QR cezalıdır.
export const katilimAcilisiMi = (def: GameDefinition, kayit: SceneState): boolean =>
  rotaMi(def) && kayit.yol.length === 0 && !kayit.hedef;

// Süreye eklenmiş konum cezaları (ipucu ve yanlış QR); öğretmenin yanlış cevap sayısından düşülür.
export function konumCezasi(s: SceneState): number {
  const ipucu = Object.values(s.ipucu ?? {}).reduce((a, b) => a + b, 0);
  return ipucu * KONUM_IPUCU_CEZASI + (s.yanlis?.length ?? 0) * YANLIS_QR_CEZASI;
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
// yer ve bu hedef ile QR için ilk kezse ceza. anahtar, cezası kesilmiş taramaların listesine eklenir. Başlangıçta (takım
// henüz ilk yerine varmadı) başka bir QR yok sayılır: oyuna QR okutarak katılan takım cezalandırılmaz.
export type TaramaSonucu = { tur: "varis" } | { tur: "cozulmus" } | { tur: "yoksay" } | { tur: "yanlis"; ceza: boolean; anahtar: string };
export function taramaSonucu(def: GameDefinition, hedef: string, qr: number, progress: GameProgress, cezalilar: string[] = [], baslangic = false): TaramaSonucu {
  const hedefQr = def.duraklar.find((d) => d.id === hedef)?.mekan.qr_durak_id;
  if (hedefQr === `qr-${qr}`) return { tur: "varis" };
  if (baslangic) return { tur: "yoksay" };
  const qrDurak = qrDuragi(def, qr);
  if (qrDurak && progress[qrDurak]) return { tur: "cozulmus" };
  const anahtar = `${hedef}:${qr}`;
  return { tur: "yanlis", ceza: !cezalilar.includes(anahtar), anahtar };
}

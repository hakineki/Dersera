import type { GameDefinition } from "@/lib/composer/definition";
import { metinBolumleri } from "@/lib/composer/yzDenetim";

// Benzerlik / kopya kapısı (docs/URUN-BAGLAMI.md §9): topluluğa gönderilen oyunun öğrenciye görünen metni, başka
// öğretmenlerin topluluktaki oyunlarıyla karşılaştırılır. Deterministiktir, yapay zekâ kullanmaz.
// Ölçü: kelime üçlülerinin örtüşme katsayısı |A∩B| / min(|A|,|B|). Sürüm izinden (lib/surum.ts) farklı olarak her
// durakta birkaç kelime değiştirmek ya da durak eklemek/silmek kopyayı gizlemez.

export const BENZERLIK = {
  // Bu oranda ve üstünde örtüşme kopya sayılır (BLOCK); inceleme eşiği ile arası türetilmiş oyun (REVIEW).
  kopyaEsigi: 0.7,
  incelemeEsigi: 0.4,
  // Daha az kelime üçlüsü olan oyun karşılaştırılmaz (oran anlamsızlaşır).
  enAzParca: 20,
  // Taranan en çok topluluk kaydı (yayındakiler en yeniden eskiye + inceleme kuyruğu). Aşılırsa eskiler taranmaz.
  taramaSiniri: 500,
  sayfa: 100,
  // Öğretmene gösterilen en çok benzer oyun.
  enCokGosterim: 3,
} as const;

export interface BenzerOyun {
  id: string;
  // Yayındaki oyunun başlığı herkese açıktır; incelemedeki oyunun başlığı gösterilmez.
  baslik: string | null;
  oran: number;
}

const kelimeler = (s: string) =>
  s
    .normalize("NFC")
    .toLocaleLowerCase("tr-TR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean);

// Satırlar "Etiket: değer" biçimindedir; etiket (ör. "Soru") her oyunda aynı olduğundan atılır. Üçlüler satır aşmaz.
export function metinParcalari(def: GameDefinition): Set<string> {
  const parcalar = new Set<string>();
  for (const b of metinBolumleri(def)) {
    for (const satir of b.metin.split("\n")) {
      const k = kelimeler(satir.slice(satir.indexOf(": ") + 2));
      for (let i = 0; i + 2 < k.length; i++) parcalar.add(`${k[i]} ${k[i + 1]} ${k[i + 2]}`);
    }
  }
  return parcalar;
}

export function benzerlikOrani(a: Set<string>, b: Set<string>): number | null {
  if (a.size < BENZERLIK.enAzParca || b.size < BENZERLIK.enAzParca) return null;
  const [kucuk, buyuk] = a.size <= b.size ? [a, b] : [b, a];
  let ortak = 0;
  for (const p of kucuk) if (buyuk.has(p)) ortak++;
  return ortak / kucuk.size;
}

export const dersleriOrtak = (a: string, b: string) => {
  const bs = new Set(b.split(" + "));
  return a.split(" + ").some((d) => bs.has(d));
};

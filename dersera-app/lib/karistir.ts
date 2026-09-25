import { splitAnswer } from "@/lib/composer/answers";

// Öğrenci başına kararlı karıştırma: aynı öğrenci sayfayı yenilese de sıra değişmez, başka öğrencide farklıdır. Böylece
// "cevap B" gibi paylaşılan sıralı bilgi işe yaramaz. Cevap denetimi değere bakar, sıraya bakmaz.

// FNV-1a ile tohumdan 32 bit sayı, mulberry32 ile sözde rastgele dizi.
function tohumSayisi(tohum: string): number {
  let h = 2166136261;
  for (const c of tohum) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function karistir<T>(dizi: readonly T[], tohum: string): T[] {
  let a = tohumSayisi(tohum);
  const rastgele = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...dizi];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rastgele() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Görevin seçeneklerini öğrenciye göre karıştırır. Sıralama görevi çözülmüş sırayla başlamaz; sayısal görevin
// seçeneği yoktur.
export function secenekleriKaristir(tur: string, secenekler: readonly string[], dogruCevap: string, tohum: string): string[] {
  if (tur === "sayisal") return [...secenekler];
  const k = karistir(secenekler, tohum);
  if (tur === "siralama" || tur === "surukle_birak") {
    const dogru = splitAnswer(dogruCevap);
    if (k.length > 1 && k.every((x, i) => x === dogru[i])) return [...k.slice(1), k[0]];
  }
  return k;
}

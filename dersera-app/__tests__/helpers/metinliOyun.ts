import type { GameDefinition } from "@/lib/composer/definition";

// Benzerlik testleri için: fixture oyunun kısa metinlerini tohuma özgü uzun metinlerle doldurur. Aynı tohum aynı
// metni, farklı tohum ortak kelimesi olmayan metni üretir.
export function metinli(def: GameDefinition, tohum: string): GameDefinition {
  const cumle = (yer: string, n: number) => Array.from({ length: n }, (_, j) => `${tohum}${yer}w${j}`).join(" ");
  def.hikaye_giris = cumle("giris", 12);
  def.duraklar.forEach((d, i) => {
    d.hikaye_metni = cumle(`h${i}`, 12);
    d.gorev.soru = cumle(`s${i}`, 8);
  });
  def.final.hikaye_metni = cumle("final", 10);
  return def;
}

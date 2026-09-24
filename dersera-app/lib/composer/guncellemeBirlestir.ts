import type { GameDefinition } from "@/lib/composer/definition";

// Güncelleme sürerken öğretmen oyunu elle düzenlediyse düzenleme ezilmez: yalnız güncellenen duraklar mevcut tanıma
// yerleştirilir. İstemci kullanır; ağır modül içe aktarmaz.
export function guncellemeyiBirlestir(mevcut: GameDefinition, guncel: GameDefinition, guncellenen: string[]): GameDefinition {
  const yeni = new Map(guncel.duraklar.filter((d) => guncellenen.includes(d.id)).map((d) => [d.id, d]));
  return { ...mevcut, duraklar: mevcut.duraklar.map((d) => yeni.get(d.id) ?? d) };
}

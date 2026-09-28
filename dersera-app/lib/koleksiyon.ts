import { gorunmezleriAt } from "@/lib/composer/kaynak";

// Öğretmen koleksiyonları (Topluluk Kütüphanesi 2.0): öğretmenin topluluk oyunlarını kendi listelerinde toplaması
// (ör. "Favoriler", "3. ünite tekrarı"). Liste yalnız oyun kimliği tutar; oyunun kendisine dokunmaz, koleksiyonu
// silmek yalnız bu listeyi siler.

export const KOLEKSIYON = {
  enCok: 20,
  oyunEnCok: 100,
  adEnAz: 1,
  adEnCok: 60,
} as const;

export interface KoleksiyonBilgisi {
  id: string;
  ad: string;
  olusturma: number;
}

export interface Koleksiyon extends KoleksiyonBilgisi {
  // Topluluk oyun kimlikleri, en son eklenen önce.
  oyunlar: string[];
}

export const KOLEKSIYON_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Görünmez karakterler atılır, boşluklar sadeleşir; sınır dışıysa null.
export function koleksiyonAdi(ham: unknown): string | null {
  if (typeof ham !== "string") return null;
  const ad = gorunmezleriAt(ham).replace(/\s+/g, " ").trim();
  return ad.length >= KOLEKSIYON.adEnAz && ad.length <= KOLEKSIYON.adEnCok ? ad : null;
}

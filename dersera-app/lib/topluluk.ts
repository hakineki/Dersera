import type { GameDefinition } from "@/lib/composer/definition";
import type { DersKonu } from "@/lib/composer/input";

// Topluluk kütüphanesi: yayınlanan composer oyunlarının herkese açık listesi.
// Liste yalnız özet taşır (cevaplar yok); tam oyun yalnız öğretmen oturumuyla okunur.

export const TOPLULUK_SAYFA = 20;

export interface ToplulukOzeti {
  oyun_id: string;
  baslik: string;
  ders: string;
  konu: string;
  sinif: number;
  sure_dk: number;
  alan: GameDefinition["meta"]["alan"];
  deneyim: GameDefinition["meta"]["deneyim"];
  yayin_tarihi: number;
  oynanma_sayisi: number;
  // Puanlama sonraki turda; alanlar şimdiden sözleşmede.
  puan_ortalama: number | null;
  puan_sayisi: number;
  aktif: boolean;
}

// Depodaki tam kayıt. oluşturan: öğretmen hesabının kütüphane sahibi kimliği ya da "anonim"; herkese açık yanıtlara girmez.
export interface ToplulukKaydi extends Omit<ToplulukOzeti, "oynanma_sayisi"> {
  olusturan: string;
  definition: GameDefinition;
  dersler: DersKonu[];
}

export interface ToplulukFiltresi {
  ders?: string; // ders adı, ör. "Fizik"
  sinif?: number;
  alan?: GameDefinition["meta"]["alan"];
  deneyim?: GameDefinition["meta"]["deneyim"];
  q?: string;
}

const norm = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();

export function filtredenGecer(o: ToplulukOzeti, f: ToplulukFiltresi): boolean {
  if (!o.aktif || o.oynanma_sayisi < 0) return false;
  if (f.ders && !o.ders.split(" + ").includes(f.ders)) return false;
  if (f.sinif && o.sinif !== f.sinif) return false;
  if (f.alan && o.alan !== f.alan) return false;
  if (f.deneyim && o.deneyim !== f.deneyim) return false;
  if (f.q) {
    const q = norm(f.q);
    if (![o.baslik, o.ders, o.konu].some((alan) => norm(alan).includes(q))) return false;
  }
  return true;
}

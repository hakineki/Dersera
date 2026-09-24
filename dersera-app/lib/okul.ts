import type { GameDefinition } from "@/lib/composer/definition";
import type { DersKonu } from "@/lib/composer/input";

// Okul katmanı (docs/URUN-BAGLAMI.md V2 "school/organization layer"): bir öğretmen okul açar ve okul yöneticisi olur;
// diğer öğretmenler davet koduyla katılır (öğretmen başına tek okul). Üyeler kütüphanelerindeki oyunları okulla
// paylaşır; paylaşım topluluk incelemesinden geçmez (okul içi güven) ama içerik kapıları uygulanır.

export const OKUL = {
  adEnAz: 3,
  adEnCok: 80,
  enCokUye: 200,
  enCokPaylasim: 300,
} as const;

export type OkulRolu = "yonetici" | "ogretmen";

export interface Okul {
  id: string;
  ad: string;
  olusturma: number;
  // Okulu açan hesap: okul yöneticisi.
  olusturan: string;
  davetKodu: string;
}

export interface OkulUyesi {
  hesapId: string;
  rol: OkulRolu;
  katilma: number;
}

// Paylaşım anında kütüphane kaydının kopyası: sonraki düzenlemeler okuldakini değiştirmez (yeniden paylaşılınca güncellenir).
export interface OkulPaylasimi {
  id: string;
  // "hesap:<id>:<kutuphaneId>": aynı oyunun yeniden paylaşımı öncekinin yerine geçer.
  kaynak: string;
  paylasan: string;
  baslik: string;
  sinif: number;
  ders: string;
  konu: string;
  sure_dk: number;
  tarih: number;
  definition: GameDefinition;
  dersler: DersKonu[];
}

export type PaylasimOzeti = Omit<OkulPaylasimi, "definition" | "dersler" | "kaynak">;
export const paylasimOzetiOf = (p: OkulPaylasimi): PaylasimOzeti => ({
  id: p.id,
  paylasan: p.paylasan,
  baslik: p.baslik,
  sinif: p.sinif,
  ders: p.ders,
  konu: p.konu,
  sure_dk: p.sure_dk,
  tarih: p.tarih,
});

// Karışması kolay karakterler (0/O, 1/I/L) yok. Kod sunucuda üretilir (lib/okulService.ts).
export const DAVET_ALFABE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const DAVET_UZUNLUK = 8;

// Öğretmen kodu boşluk ya da tireyle, küçük harfle yazabilir.
export function davetKoduNormal(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const k = v.toLocaleUpperCase("tr-TR").replace(/[\s-]/g, "").replace(/İ/g, "I");
  return new RegExp(`^[${DAVET_ALFABE}]{${DAVET_UZUNLUK}}$`).test(k) ? k : null;
}

export function okulAdiNormal(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const ad = v.replace(/\s+/g, " ").trim();
  return ad.length >= OKUL.adEnAz && ad.length <= OKUL.adEnCok ? ad : null;
}

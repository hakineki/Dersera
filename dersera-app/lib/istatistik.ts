// Kütüphane ve topluluk istatistiklerinin ortak hesapları (istemci ve sunucu kullanabilir).

export const PUAN_MIN = 1;
export const PUAN_MAX = 5;
// k-anonimlik: bu kadar oy birikmeden ortalama gösterilmez; aksi hâlde öğretmen her bitirişten sonra
// ortalamadaki değişimden tek tek puanları çıkarabilir.
export const ORTALAMA_EN_AZ_OY = 5;

export const gecerliPuan = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= PUAN_MIN && (v as number) <= PUAN_MAX;

export function gosterilecekOrtalama(toplam: number, sayi: number): number | null {
  return sayi >= ORTALAMA_EN_AZ_OY ? Math.round((toplam / sayi) * 10) / 10 : null;
}

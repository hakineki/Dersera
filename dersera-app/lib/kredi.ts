// Kredi ekonomisi (docs/URUN-BAGLAMI.md §6): deterministik, yapay zekâ kullanmaz. Değerler yalnız burada tanımlıdır.
// Öğrencinin oynaması, yayın, yeniden yayın, elle düzenleme, önizleme ve QR kullanımı ücretsizdir.
// Nakit ödeme yoktur; kazanılan kredi ileride abonelik indirimi/ücretsiz kullanım için ayrı tutulur.

export const KREDI_KURALLARI = {
  aylikHak: 30,
  olusturma: { 20: 2, 40: 3, 60: 4 },
  // Gerçek (yapay zekâ ile) oyun güncellemesi (lib/composer/guncelleme.ts); elle düzenleme ücretsizdir.
  guncelleme: 1,
  // Topluluk incelemesinden geçen oyunun sahibine verilen kredi.
  toplulukKabulOdulu: 5,
} as const;

export type OyunSuresi = keyof typeof KREDI_KURALLARI.olusturma;
export const olusturmaMaliyeti = (sure: OyunSuresi): number => KREDI_KURALLARI.olusturma[sure];

export type HareketTuru = "harcama" | "iade" | "odul";

export interface KrediHareketi {
  tur: HareketTuru;
  // Bakiyeye etkisi: harcamada eksi, iade ve ödülde artı.
  miktar: number;
  // Harcama/iadenin aylık haktan ve kazanılandan payı.
  aylik: number;
  kazanilan: number;
  tarih: number;
  aciklama: string;
}

export interface KrediDurumu {
  ay: string;
  aylikHak: number;
  aylikKalan: number;
  kazanilan: number;
  toplam: number;
  hareketler: KrediHareketi[];
}

// Aylık hak Türkiye saatine göre takvim ayı başında yenilenir.
export function ayOf(now: number): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit" }).formatToParts(new Date(now));
  return `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}`;
}

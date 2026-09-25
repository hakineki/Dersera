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
  // Öğretmenin kaynağından (PDF ya da yapıştırılan metin) oluşturma: süre maliyetine eklenir.
  kaynakEki: 1,
  // Görsel zenginleştirme (kapak + 3 sahne): oyun oluştuktan sonra ayrı düşer; hiç görsel üretilemezse iade edilir.
  gorsel: 1,
} as const;

// Okul kredi havuzu: platform yöneticisi okula aylık havuz atar; okul yöneticisi öğretmen başına aylık sınır koyabilir.
// Harcama sırası: kişisel aylık hak → okul havuzu → kazanılan kredi.
export const OKUL_HAVUZU = {
  hakEnCok: 10_000,
  sinirEnCok: 1_000,
} as const;

export type OyunSuresi = keyof typeof KREDI_KURALLARI.olusturma;
export const olusturmaMaliyeti = (sure: OyunSuresi, kaynakli = false): number => KREDI_KURALLARI.olusturma[sure] + (kaynakli ? KREDI_KURALLARI.kaynakEki : 0);

export type HareketTuru = "harcama" | "iade" | "odul";

export interface KrediHareketi {
  tur: HareketTuru;
  // Bakiyeye etkisi: harcamada eksi, iade ve ödülde artı.
  miktar: number;
  // Harcama/iadenin aylık haktan, okul havuzundan ve kazanılandan payı (okul payı, havuzdan önceki kayıtlarda yok).
  aylik: number;
  okul?: number;
  kazanilan: number;
  tarih: number;
  aciklama: string;
}

// Okulun bu ayki havuz durumu. sinir 0: öğretmen başına sınır yok.
export interface OkulHavuzu {
  hak: number;
  sinir: number;
  kullanilan: number;
  // Öğretmenin bu ay havuzdan kullandığı (hesap kimliği → kredi).
  ogretmenler: Record<string, number>;
}

export interface OkulKredisi {
  havuzHak: number;
  havuzKalan: number;
  sinir: number | null;
  kullandigin: number;
  // Öğretmenin bu ay havuzdan daha kullanabileceği: havuz kalanı ile kendi sınırından kalanın küçüğü.
  kalan: number;
}

// Harcama betiği (lib/krediStore.ts) aynı hesabı yapar.
export function okulKredisiOf(h: OkulHavuzu, hesapId: string): OkulKredisi {
  const havuzKalan = Math.max(0, h.hak - h.kullanilan);
  const kullandigin = h.ogretmenler[hesapId] ?? 0;
  return {
    havuzHak: h.hak,
    havuzKalan,
    sinir: h.sinir > 0 ? h.sinir : null,
    kullandigin,
    kalan: h.sinir > 0 ? Math.min(havuzKalan, Math.max(0, h.sinir - kullandigin)) : havuzKalan,
  };
}

export interface KrediDurumu {
  ay: string;
  aylikHak: number;
  aylikKalan: number;
  kazanilan: number;
  // Öğretmen bir okulun üyesiyse ve okula havuz atanmışsa.
  okul: OkulKredisi | null;
  toplam: number;
  hareketler: KrediHareketi[];
}

// Aylık hak Türkiye saatine göre takvim ayı başında yenilenir.
export function ayOf(now: number): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit" }).formatToParts(new Date(now));
  return `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}`;
}

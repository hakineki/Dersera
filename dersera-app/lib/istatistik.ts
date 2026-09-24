// Kütüphane ve topluluk istatistiklerinin ortak hesapları (istemci ve sunucu kullanabilir).

export const PUAN_MIN = 1;
export const PUAN_MAX = 5;
// k-anonimlik: gösterilen ortalama ve oy sayısı yalnız her PUAN_KOVASI oyda bir güncellenir. Böylece öğretmen iki
// ekran arasındaki farktan tek bir öğrencinin puanını değil, en az PUAN_KOVASI oyun toplamını öğrenebilir.
export const PUAN_KOVASI = 5;

export const gecerliPuan = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= PUAN_MIN && (v as number) <= PUAN_MAX;

// Canlı sayaçlar ve son tamamlanan kovadaki anlık görüntü (gösterilen değerler).
export interface PuanSayaci {
  toplam: number;
  sayi: number;
  gosterToplam: number;
  gosterSayi: number;
}

export const BOS_PUAN_SAYACI: PuanSayaci = { toplam: 0, sayi: 0, gosterToplam: 0, gosterSayi: 0 };

// Bellek depoları için: Redis betiğindeki kova mantığının aynısı.
export function kovaliPuanEkle(p: PuanSayaci, puan: number): PuanSayaci {
  const toplam = p.toplam + puan;
  const sayi = p.sayi + 1;
  return sayi % PUAN_KOVASI === 0 ? { toplam, sayi, gosterToplam: toplam, gosterSayi: sayi } : { ...p, toplam, sayi };
}

// Redis depoları için aynı mantık (Lua parçası). KEYS[k..k+3]: canlı toplam, canlı sayı, gösterim toplamı,
// gösterim sayısı. ARGV[p]: puan, ARGV[p+1]: kova. Sayı kovanın katına geldiğinde anlık görüntü yazılır.
export function kovaliPuanLua(k: number, p: number) {
  return `local t = redis.call('INCRBY', KEYS[${k}], ARGV[${p}])
local n = redis.call('INCR', KEYS[${k + 1}])
if n % tonumber(ARGV[${p + 1}]) == 0 then redis.call('MSET', KEYS[${k + 2}], t, KEYS[${k + 3}], n) end`;
}

// Anlık görüntüden gösterilecek ortalama; ilk kova dolmadan null.
export function gosterilecekOrtalama(toplam: number, sayi: number): number | null {
  return sayi >= PUAN_KOVASI ? Math.round((toplam / sayi) * 10) / 10 : null;
}

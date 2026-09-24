// İstemci ile sunucunun paylaştığı sınırlar. Bu dosya ağır modül (müfredat verisi, zod şemaları) içe aktarmamalı:
// istemci bileşenleri buradan okur ve paketleri küçük kalır.
export const SERBEST_NOT_MAX = 500;

// Yapay zekâyla güncelleme sınırları (lib/composer/guncelleme.ts); istemci paneli de kullanır.
export const GUNCELLEME = {
  enCokDurak: 3,
  talimatEnAz: 5,
  talimatEnCok: 300,
} as const;

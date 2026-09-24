// İstemci ile sunucunun paylaştığı sınırlar. Bu dosya ağır modül (müfredat verisi, zod şemaları) içe aktarmamalı:
// istemci bileşenleri buradan okur ve paketleri küçük kalır.
export const SERBEST_NOT_MAX = 500;

import { createHash } from "crypto";
import { mekanBilmeceleri } from "@/data/konumBilmeceleri";
import { MEKANLAR, mekanOf } from "@/data/mekanlar";
import type { KonumYeri } from "@/lib/composer/definition";

// Sunucu tarafı: mekân rotasında her durağa okul mekânı ve o mekânın konum bilmecelerinden biri atanır. Model mekânı
// listeden seçer; geçersiz ya da tekrarlanan mekân listedeki ilk boş mekânla değiştirilir. Bilmece, oyun başlığı ve
// durak kimliğinden türeyen bir sırayla seçilir (aynı oyun için her seferinde aynı).

function sira(anahtar: string, n: number): number {
  return parseInt(createHash("sha256").update(anahtar).digest("hex").slice(0, 8), 16) % n;
}

export function mekanlariAta(istenen: string[]): string[] {
  const kullanilan = new Set<string>();
  const secilen = istenen.map((id) => {
    const m = mekanOf(id.trim());
    if (!m || kullanilan.has(m.id)) return null;
    kullanilan.add(m.id);
    return m.id;
  });
  return secilen.map((id) => {
    if (id) return id;
    const bos = MEKANLAR.find((m) => !kullanilan.has(m.id))!;
    kullanilan.add(bos.id);
    return bos.id;
  });
}

export function konumYeri(mekanId: string, anahtar: string): KonumYeri {
  const m = mekanOf(mekanId);
  const bilmeceler = mekanBilmeceleri(mekanId);
  if (!m || bilmeceler.length === 0) throw new Error(`Bilinmeyen mekân: ${mekanId}`);
  const b = bilmeceler[sira(anahtar, bilmeceler.length)];
  return { mekan_id: m.id, mekan_adi: m.ad, nokta: b.nokta, bilmece: b.bilmece, ipucu_1: b.ipucu1, ipucu_2: b.ipucu2 };
}

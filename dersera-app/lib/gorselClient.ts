// Görsel zenginleştirme istemcisi (lib/gorselService.ts). Hata durumunda null: ilerleme son bilinen değerde kalır.

export interface GorselDurumuYaniti {
  hazir: string[];
  hata: number;
  toplam: number;
  bitti: boolean;
}

async function iste(isId: string, method: "GET" | "POST"): Promise<GorselDurumuYaniti | null> {
  try {
    const res = await fetch(`/api/gorsel/${encodeURIComponent(isId)}`, { method, cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as { durum: GorselDurumuYaniti }).durum;
  } catch {
    return null;
  }
}

// Sıradaki görseli üretir (yaklaşık 10–40 sn).
export const gorselTetikle = (isId: string) => iste(isId, "POST");
export const gorselDurumuGetir = (isId: string) => iste(isId, "GET");

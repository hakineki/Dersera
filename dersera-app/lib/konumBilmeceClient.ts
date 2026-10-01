import type { KonumBilmecesi } from "@/lib/mekan";

export type HazirBilmece = Omit<KonumBilmecesi, "mekanId">;

// Öğretmenin düzenleyicisi için bir mekânın hazır konum bilmeceleri (oturum gerekir); okunamazsa null.
export async function konumBilmeceleriGetir(mekanId: string): Promise<HazirBilmece[] | null> {
  try {
    const res = await fetch(`/api/compose/konum-bilmeceleri?mekan=${encodeURIComponent(mekanId)}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { bilmeceler?: HazirBilmece[] };
    return Array.isArray(json.bilmeceler) ? json.bilmeceler : null;
  } catch {
    return null;
  }
}

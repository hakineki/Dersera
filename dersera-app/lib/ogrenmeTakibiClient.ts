import type { TakipRaporu } from "@/lib/ogrenmeTakibi";

// Öğretmenin öğrenme takibi raporu (ay verilmezse bu ay); oturum yoksa ya da okunamazsa null.
export async function takipRaporuGetir(ay: string | null): Promise<TakipRaporu | null> {
  try {
    const res = await fetch(`/api/ogrenme-takibi${ay ? `?ay=${encodeURIComponent(ay)}` : ""}`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as TakipRaporu) : null;
  } catch {
    return null;
  }
}

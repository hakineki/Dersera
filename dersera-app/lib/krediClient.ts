import type { KrediDurumu } from "@/lib/kredi";

// Öğretmenin kredi bakiyesi (oturum yoksa ya da okunamazsa null).
export async function krediDurumuGetir(): Promise<KrediDurumu | null> {
  try {
    const res = await fetch("/api/kredi");
    return res.ok ? ((await res.json()) as KrediDurumu) : null;
  } catch {
    return null;
  }
}

export const krediMetni = (k: KrediDurumu) =>
  `${k.toplam} kredi (bu ay ${k.aylikKalan}/${k.aylikHak}${k.kazanilan > 0 ? ` + ${k.kazanilan} kazanılmış` : ""})`;

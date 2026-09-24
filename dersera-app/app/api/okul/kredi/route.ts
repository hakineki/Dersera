import { okulIslemi } from "@/lib/okulIstek";
import { okulKrediSiniri } from "@/lib/okulService";

// Okul yöneticisi öğretmen başına aylık havuz sınırını ayarlar: { sinir } (0: sınır yok).
export async function POST(req: Request) {
  return okulIslemi(
    req,
    async (hesap, d) => {
      const body = (await req.json().catch(() => null)) as { sinir?: unknown } | null;
      return okulKrediSiniri(d, hesap, body?.sinir);
    },
    { yazma: true }
  );
}

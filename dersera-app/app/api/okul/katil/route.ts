import { okulIslemi } from "@/lib/okulIstek";
import { okulaKatil } from "@/lib/okulService";

// Davet koduyla okula katıl: { kod }. Öğretmen başına tek okul.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { kod?: unknown } | null;
  return okulIslemi(req, (hesap, d) => okulaKatil(d, hesap, body?.kod), { yazma: true });
}

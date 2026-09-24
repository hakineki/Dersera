import { okulIslemi } from "@/lib/okulIstek";
import { okulOlustur, okulum } from "@/lib/okulService";

// Öğretmenin okulu (yoksa okul: null); davet kodu yalnız okul yöneticisine döner.
export async function GET(req: Request) {
  return okulIslemi(req, async (hesap, d) => ({ ok: true, ...(await okulum(d, hesap)) }));
}

// Okul oluştur: { ad }. Oluşturan okul yöneticisi olur.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { ad?: unknown } | null;
  return okulIslemi(req, (hesap, d) => okulOlustur(d, hesap, body?.ad), { yazma: true, basari: 201 });
}

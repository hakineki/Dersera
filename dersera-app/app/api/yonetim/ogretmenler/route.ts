import { ogretmenListesi } from "@/lib/ogretmenYonetimi";
import { ogretmenYonetimiIslemi } from "@/lib/ogretmenYonetimiIstek";

// Öğretmen listesi (yalnız platform yöneticisi): ?q= kullanıcı adında arar; son yönetim işlemleriyle.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q");
  return ogretmenYonetimiIslemi(req, async (_y, d) => ({ ok: true as const, value: await ogretmenListesi(d, q) }));
}

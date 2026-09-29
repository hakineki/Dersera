import { yonetimIslemi } from "@/lib/ogretmenYonetimiIstek";
import { okulListesi } from "@/lib/okulYonetimi";

// Okul listesi (yalnız platform yöneticisi): yönetici, üye ve paylaşım sayısı, bu ayın havuzu; son yönetim işlemleri.
export async function GET(req: Request) {
  return yonetimIslemi(req, async (_y, d) => ({ ok: true as const, value: await okulListesi(d) }));
}

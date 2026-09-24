import { okulIslemi } from "@/lib/okulIstek";
import { davetYenile } from "@/lib/okulService";

// Okul yöneticisi davet kodunu yeniler; eski kod geçersiz olur.
export async function POST(req: Request) {
  return okulIslemi(req, (hesap, d) => davetYenile(d, hesap), { yazma: true });
}

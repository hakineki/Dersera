import { okulIslemi } from "@/lib/okulIstek";
import { okuldanAyril } from "@/lib/okulService";

// Öğretmen okuldan ayrılır; okul yöneticisi ayrılamaz.
export async function POST(req: Request) {
  return okulIslemi(req, (hesap, d) => okuldanAyril(d, hesap), { yazma: true });
}

import { okulIslemi } from "@/lib/okulIstek";
import { okulPanosu } from "@/lib/okulService";

// Okul yöneticisi panosu: öğretmenler, kütüphane/paylaşım sayıları, bitiren öğrenci ve öğrenci puanı.
export async function GET(req: Request) {
  return okulIslemi(req, (hesap, d) => okulPanosu(d, hesap));
}

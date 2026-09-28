import { koleksiyonIslemi } from "@/lib/koleksiyonIstek";
import { koleksiyonlarim, koleksiyonOlustur } from "@/lib/koleksiyonService";

// Öğretmenin koleksiyonları (oyun kimlikleriyle).
export async function GET(req: Request) {
  return koleksiyonIslemi(req, (hesap, d) => koleksiyonlarim(d, hesap));
}

// Yeni koleksiyon: { ad }.
export async function POST(req: Request) {
  return koleksiyonIslemi(req, (hesap, d, body) => koleksiyonOlustur(d, hesap, body), { yazma: true, basari: 201 });
}

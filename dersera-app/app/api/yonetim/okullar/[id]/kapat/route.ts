import { OKUL_ID } from "@/lib/okul";
import { yonetimIslemi } from "@/lib/ogretmenYonetimiIstek";
import { okulKapat } from "@/lib/okulYonetimi";

// Okulu kapat: { okulAdi (onay), sifre (yöneticinin), neden }. Şifre denemesi giriş gibi sınırlı.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return yonetimIslemi(
    req,
    async (y, d, b) => (OKUL_ID.test(id) ? okulKapat(d, y, id, b.okulAdi, b.sifre, b.neden) : { ok: false as const, status: 404, error: "Okul bulunamadı." }),
    { yazma: true, sifreli: true }
  );
}

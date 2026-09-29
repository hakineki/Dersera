import { ogretmenSil } from "@/lib/ogretmenYonetimi";
import { HESAP_ID, yonetimIslemi } from "@/lib/ogretmenYonetimiIstek";

// Öğretmen hesabını kalıcı sil: { kullaniciAdi (onay), sifre (yöneticinin), neden }. Şifre denemesi giriş gibi sınırlı.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return yonetimIslemi(
    req,
    async (y, d, b) => (HESAP_ID.test(id) ? ogretmenSil(d, y, id, b.kullaniciAdi, b.sifre, b.neden) : { ok: false as const, status: 404, error: "Öğretmen bulunamadı." }),
    { yazma: true, sifreli: true }
  );
}

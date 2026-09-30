import { siteAdresi } from "@/lib/eposta";
import { sifirlamaBaglantisiUret } from "@/lib/ogretmenYonetimi";
import { HESAP_ID, yonetimIslemi } from "@/lib/ogretmenYonetimiIstek";

// Şifre sıfırlama bağlantısı üret: { neden, sifre (yöneticinin) }. Bağlantı yalnız yanıtta döner; 1 saat geçerli, tek kullanımlık.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return yonetimIslemi(
    req,
    async (y, d, b) => (HESAP_ID.test(id) ? sifirlamaBaglantisiUret(d, y, id, b.neden, b.sifre, siteAdresi(req)) : { ok: false as const, status: 404, error: "Öğretmen bulunamadı." }),
    { yazma: true, sifreli: true }
  );
}

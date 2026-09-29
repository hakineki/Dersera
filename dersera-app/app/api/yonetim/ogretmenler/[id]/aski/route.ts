import { askiDegistir } from "@/lib/ogretmenYonetimi";
import { HESAP_ID, yonetimIslemi } from "@/lib/ogretmenYonetimiIstek";

// Askıya al / geri aç: { askida: boolean, neden: string } (askıya almada gerekçe zorunlu).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return yonetimIslemi(
    req,
    async (y, d, b) => (HESAP_ID.test(id) ? askiDegistir(d, y, id, b.askida, b.neden) : { ok: false as const, status: 404, error: "Öğretmen bulunamadı." }),
    { yazma: true }
  );
}

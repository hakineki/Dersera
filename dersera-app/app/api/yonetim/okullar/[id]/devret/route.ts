import { OKUL_ID } from "@/lib/okul";
import { yonetimIslemi } from "@/lib/ogretmenYonetimiIstek";
import { yoneticiDevret } from "@/lib/okulYonetimi";

// Okul yöneticiliğini devret: { hesapId (okulun öğretmen üyesi), neden }.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return yonetimIslemi(
    req,
    async (y, d, b) => (OKUL_ID.test(id) ? yoneticiDevret(d, y, id, b.hesapId, b.neden) : { ok: false as const, status: 404, error: "Okul bulunamadı." }),
    { yazma: true }
  );
}

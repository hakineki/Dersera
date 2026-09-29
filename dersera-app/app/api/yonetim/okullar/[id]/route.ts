import { OKUL_ID } from "@/lib/okul";
import { yonetimIslemi } from "@/lib/ogretmenYonetimiIstek";
import { okulAyrintisi } from "@/lib/okulYonetimi";

const YOK = { ok: false as const, status: 404, error: "Okul bulunamadı." };

// Okul ayrıntısı: üyeler ve rolleri, paylaşım sayısı, havuz.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return yonetimIslemi(req, async (_y, d) => (OKUL_ID.test(id) ? okulAyrintisi(d, id) : YOK));
}

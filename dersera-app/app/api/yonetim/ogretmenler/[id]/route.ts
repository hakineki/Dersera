import { ogretmenAyrintisi } from "@/lib/ogretmenYonetimi";
import { HESAP_ID, ogretmenYonetimiIslemi } from "@/lib/ogretmenYonetimiIstek";

const YOK = { ok: false as const, status: 404, error: "Öğretmen bulunamadı." };

// Öğretmen ayrıntısı: okul, kredi, oyun sayısı, askı durumu.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return ogretmenYonetimiIslemi(req, async (_y, d) => (HESAP_ID.test(id) ? ogretmenAyrintisi(d, id) : YOK));
}

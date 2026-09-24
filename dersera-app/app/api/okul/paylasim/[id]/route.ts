import { okulIslemi } from "@/lib/okulIstek";
import { okulPaylasimDetayi, okulPaylasimKaldir } from "@/lib/okulService";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// "Kullan": tam oyun yalnız aynı okulun üyesine (composer'da kopya olarak açılır).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return okulIslemi(req, async (hesap, d) => (UUID.test(id) ? okulPaylasimDetayi(d, hesap, id) : { ok: false as const, status: 404, error: "Oyun bulunamadı." }));
}

// Paylaşımı kaldır: paylaşan öğretmen ya da okul yöneticisi.
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return okulIslemi(req, async (hesap, d) => (UUID.test(id) ? okulPaylasimKaldir(d, hesap, id) : { ok: false as const, status: 404, error: "Oyun bulunamadı." }), { yazma: true, govdesiz: true });
}

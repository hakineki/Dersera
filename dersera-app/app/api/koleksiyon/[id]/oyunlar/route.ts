import { koleksiyonIslemi } from "@/lib/koleksiyonIstek";
import { koleksiyonaEkle } from "@/lib/koleksiyonService";

// Koleksiyona topluluk oyunu ekle: { oyunId }.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return koleksiyonIslemi(req, (hesap, d, body) => koleksiyonaEkle(d, hesap, id, body), { yazma: true, basari: 201 });
}

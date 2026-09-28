import { koleksiyonIslemi } from "@/lib/koleksiyonIstek";
import { koleksiyondanCikar } from "@/lib/koleksiyonService";

// Oyunu koleksiyondan çıkar.
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; oyunId: string }> }) {
  const { id, oyunId } = await ctx.params;
  return koleksiyonIslemi(req, (hesap, d) => koleksiyondanCikar(d, hesap, id, oyunId), { yazma: true, govdesiz: true });
}

import { koleksiyonIslemi } from "@/lib/koleksiyonIstek";
import { koleksiyonAdDegistir, koleksiyonDetayi, koleksiyonSil } from "@/lib/koleksiyonService";

type Ctx = { params: Promise<{ id: string }> };

// Koleksiyon ve oyunlarının özetleri.
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return koleksiyonIslemi(req, (hesap, d) => koleksiyonDetayi(d, hesap, id));
}

// Yeniden adlandır: { ad }.
export async function PUT(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return koleksiyonIslemi(req, (hesap, d, body) => koleksiyonAdDegistir(d, hesap, id, body), { yazma: true });
}

// Koleksiyonu sil (oyunlar toplulukta kalır).
export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return koleksiyonIslemi(req, (hesap, d) => koleksiyonSil(d, hesap, id), { yazma: true, govdesiz: true });
}

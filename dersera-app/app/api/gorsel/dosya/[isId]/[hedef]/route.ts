import { NextResponse } from "next/server";
import { gorselDosyasi } from "@/lib/gorselService";
import { getGorselStore } from "@/lib/gorselStore";

// Oyundaki görsel: tanımdaki (iş kimliği, hedef) çifti sunucudaki eşlemeyle depo adresine yönlenir. Görseller değişmez;
// yönlendirme kenarda ve tarayıcıda bir yıl önbelleklenir (her öğrenci için Redis'e gidilmez).
export async function GET(_req: Request, ctx: { params: Promise<{ isId: string; hedef: string }> }) {
  const { isId, hedef } = await ctx.params;
  try {
    const url = await gorselDosyasi({ store: getGorselStore() }, isId, hedef);
    if (!url) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch (err) {
    console.error("[gorsel] dosya okunamadı", err instanceof Error ? err.message : err);
    return new NextResponse(null, { status: 503 });
  }
}

import { NextResponse } from "next/server";
import { mekanBilmeceleri } from "@/data/konumBilmeceleri";
import { mekanOf } from "@/data/mekanlar";
import { istekHesabi, oturumGerekli } from "@/lib/authRequest";

// Öğretmen "Düzenle"de bir durağın konum bilmecesini mekânın hazır bilmecelerinden seçer. Banka istemci paketine girmez
// (noktalar bilmecelerin cevabıdır); yalnız oturumlu öğretmen, bir mekânın listesini ister.
export async function GET(req: Request) {
  const hesap = await istekHesabi(req);
  if (!hesap) return oturumGerekli();
  const mekan = new URL(req.url).searchParams.get("mekan") ?? "";
  if (!mekanOf(mekan)) return NextResponse.json({ error: "Bilinmeyen mekân" }, { status: 400 });
  const bilmeceler = mekanBilmeceleri(mekan).map(({ id, nokta, bilmece, ipucu1, ipucu2 }) => ({ id, nokta, bilmece, ipucu1, ipucu2 }));
  return NextResponse.json({ bilmeceler }, { headers: { "Cache-Control": "no-store" } });
}

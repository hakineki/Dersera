import { NextResponse } from "next/server";
import { istekHesabi, oturumGerekli } from "@/lib/authRequest";
import { getToplulukStore } from "@/lib/toplulukStore";
import { kullanimDetayi } from "@/lib/toplulukService";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// "Oyunu Kullan": tam oyun (cevaplar dahil) yalnız öğretmen oturumuyla verilir; öğrenci cevapları buradan göremez.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await istekHesabi(req))) return oturumGerekli();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Oyun bulunamadı" }, { status: 404 });
  try {
    const kayit = await getToplulukStore().get(id);
    if (!kayit || !kayit.aktif) return NextResponse.json({ error: "Oyun bulunamadı" }, { status: 404 });
    return NextResponse.json(kullanimDetayi(kayit), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[topluluk] okunamadı", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Oyun okunamadı" }, { status: 503 });
  }
}

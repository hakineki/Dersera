import { NextResponse } from "next/server";
import { istekHesabi, oturumGerekli } from "@/lib/authRequest";
import { krediDurumu } from "@/lib/krediService";

// Öğretmenin kredi bakiyesi ve son hareketleri.
export async function GET(req: Request) {
  const hesap = await istekHesabi(req);
  if (!hesap) return oturumGerekli();
  try {
    return NextResponse.json(await krediDurumu(hesap.id), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[kredi] okunamadı", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Kredi bilgisi okunamadı" }, { status: 503 });
  }
}

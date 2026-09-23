import { NextResponse } from "next/server";
import { hesapOzeti } from "@/lib/auth";
import { istekHesabi } from "@/lib/authRequest";

export async function GET(req: Request) {
  try {
    const hesap = await istekHesabi(req);
    return NextResponse.json(
      { hesap: hesap ? hesapOzeti(hesap) : null, davetGerekli: !!process.env.KAYIT_DAVET_KODU?.trim() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[auth] oturum okunamadı", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Oturum okunamadı." }, { status: 503 });
  }
}

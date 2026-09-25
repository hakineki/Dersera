import { NextResponse } from "next/server";
import { hesapOzeti, kayitDurumu } from "@/lib/auth";
import { istekHesabi } from "@/lib/authRequest";
import { yoneticiMi } from "@/lib/yonetici";

export async function GET(req: Request) {
  try {
    const hesap = await istekHesabi(req);
    return NextResponse.json(
      { hesap: hesap ? hesapOzeti(hesap) : null, davetGerekli: kayitDurumu() === "davetli", kayitKapali: kayitDurumu() === "kapali", yonetici: await yoneticiMi(hesap) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[auth] oturum okunamadı", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Oturum okunamadı." }, { status: 503 });
  }
}

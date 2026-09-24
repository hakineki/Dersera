import { NextResponse } from "next/server";
import { istekHesabi, oturumGerekli } from "@/lib/authRequest";
import { incelemeKuyrugu } from "@/lib/toplulukPaylasim";
import { getToplulukStore } from "@/lib/toplulukStore";

// İnceleme bekleyen topluluk gönderimleri (öğretmen oturumuyla; kendi oyunları ve incelediği oyunlar hariç).
export async function GET(req: Request) {
  const hesap = await istekHesabi(req);
  if (!hesap) return oturumGerekli();
  try {
    return NextResponse.json(await incelemeKuyrugu(getToplulukStore(), hesap), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[topluluk] inceleme kuyruğu okunamadı", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "İnceleme listesi okunamadı" }, { status: 503 });
  }
}

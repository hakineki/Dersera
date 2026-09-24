import { okulIslemi } from "@/lib/okulIstek";
import { isKutuphaneId } from "@/lib/library";
import { okullaPaylas, okulPaylasimlari } from "@/lib/okulService";

// Okul kütüphanesi (yalnız üyelere): özetler, en yeni önce.
export async function GET(req: Request) {
  return okulIslemi(req, (hesap, d) => okulPaylasimlari(d, hesap));
}

// Kütüphanedeki oyunu okulla paylaş: { kutuphaneId }. Aynı oyun yeniden paylaşılırsa öncekinin yerine geçer.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { kutuphaneId?: unknown } | null;
  const id = body?.kutuphaneId;
  return okulIslemi(
    req,
    async (hesap, d) => (isKutuphaneId(id) ? okullaPaylas(d, hesap, id) : { ok: false as const, status: 404, error: "Oyun kütüphanede bulunamadı." }),
    { yazma: true, basari: 201 }
  );
}

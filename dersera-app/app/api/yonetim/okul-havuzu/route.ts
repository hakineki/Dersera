import { NextResponse } from "next/server";
import { kokenReddi } from "@/lib/authRequest";
import { getKrediStore } from "@/lib/krediStore";
import { havuzAta, havuzListesi, havuzOkulBul } from "@/lib/okulService";
import { getOkulStore } from "@/lib/okulStore";
import { yoneticiHesabi } from "@/lib/yoneticiIstek";

// Okul kredi havuzları (yalnız platform yöneticisi). GET: havuzlu okullar ve bu ayki kullanım. POST { kod }: okul
// yöneticisinin verdiği davet koduyla okulu bulur. PUT { okulId, hak }: aylık havuzu yazar (0: kaldırır).

const depolar = () => ({ okul: getOkulStore(), kredi: getKrediStore() });
const hata = (err: unknown) => {
  console.error("[yonetim] okul havuzu işlemi başarısız", err instanceof Error ? err.message : err);
  return NextResponse.json({ error: "İşlem şu anda yapılamadı. Tekrar deneyin." }, { status: 503 });
};
const yanit = (r: { ok: true } | { ok: false; status: number; error: string }) => {
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const { ok: _ok, ...veri } = r;
  void _ok;
  return NextResponse.json(veri, { headers: { "Cache-Control": "no-store" } });
};

export async function GET(req: Request) {
  try {
    const y = await yoneticiHesabi(req);
    if (y.yanit) return y.yanit;
    return NextResponse.json(await havuzListesi(depolar()), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return hata(err);
  }
}

export async function POST(req: Request) {
  const koken = kokenReddi(req);
  if (koken) return koken;
  try {
    const y = await yoneticiHesabi(req);
    if (y.yanit) return y.yanit;
    const body = (await req.json().catch(() => null)) as { kod?: unknown } | null;
    return yanit(await havuzOkulBul(depolar(), body?.kod));
  } catch (err) {
    return hata(err);
  }
}

export async function PUT(req: Request) {
  const koken = kokenReddi(req);
  if (koken) return koken;
  try {
    const y = await yoneticiHesabi(req);
    if (y.yanit) return y.yanit;
    const body = (await req.json().catch(() => null)) as { okulId?: unknown; hak?: unknown } | null;
    return yanit(await havuzAta(depolar(), y.hesap.kullaniciAdi, body?.okulId, body?.hak));
  } catch (err) {
    return hata(err);
  }
}

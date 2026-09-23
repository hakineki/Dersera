import { NextResponse } from "next/server";
import { OTURUM_CEREZI, OTURUM_SURESI_MS, oturumHesabi } from "@/lib/auth";
import { getAuthStore, type Hesap } from "@/lib/authStore";
import { checkLimit, clientIp, LimiterUnavailableError } from "@/lib/composer/rateLimit";

// Route katmanı: çerez okuma/yazma, oturumdan hesap, giriş denemesi sınırı.

export function oturumBelirteci(req: Request): string | null {
  const cerez = req.headers.get("cookie") ?? "";
  for (const parca of cerez.split(";")) {
    const [ad, ...deger] = parca.trim().split("=");
    if (ad === OTURUM_CEREZI) return decodeURIComponent(deger.join("="));
  }
  return null;
}

export async function istekHesabi(req: Request): Promise<Hesap | null> {
  return oturumHesabi(getAuthStore(), oturumBelirteci(req));
}

export function oturumCereziYaz(res: NextResponse, belirtec: string): NextResponse {
  res.cookies.set({
    name: OTURUM_CEREZI,
    value: belirtec,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(OTURUM_SURESI_MS / 1000),
  });
  return res;
}

export function oturumCereziSil(res: NextResponse): NextResponse {
  res.cookies.set({ name: OTURUM_CEREZI, value: "", httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}

export const oturumGerekli = () => NextResponse.json({ error: "Bu işlem için öğretmen girişi gerekli." }, { status: 401 });

const ON_BES_DK = 15 * 60 * 1000;
const SAAT = 60 * 60 * 1000;

// Kaba kuvvet denemesine karşı: IP başına ve kullanıcı adı başına deneme sınırı. null = izin var; aksi hâlde hata yanıtı.
export async function denemeSiniri(req: Request, tur: "giris" | "kayit", ad?: string): Promise<NextResponse | null> {
  try {
    const ip = clientIp(req);
    const izin =
      tur === "kayit"
        ? await checkLimit(`dersera:kayit:ip:${ip}`, SAAT, 10)
        : (await checkLimit(`dersera:giris:ip:${ip}`, ON_BES_DK, 30)) && (!ad || (await checkLimit(`dersera:giris:ad:${ad}`, ON_BES_DK, 10)));
    return izin ? null : NextResponse.json({ error: "Çok fazla deneme yapıldı. Biraz sonra tekrar deneyin." }, { status: 429 });
  } catch (err) {
    console.error("[auth] deneme sınırı denetlenemedi", err instanceof Error ? err.message : err);
    const status = err instanceof LimiterUnavailableError ? 503 : 503;
    return NextResponse.json({ error: "Giriş şu anda yapılamıyor. Biraz sonra tekrar deneyin." }, { status });
  }
}

export async function jsonGovde(req: Request): Promise<Record<string, unknown>> {
  const b = await req.json().catch(() => null);
  return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
}

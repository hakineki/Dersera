import { NextResponse } from "next/server";
import { OTURUM_CEREZI, OTURUM_SURESI_MS, oturumHesabi } from "@/lib/auth";
import { getAuthStore, type Hesap } from "@/lib/authStore";
import { checkLimit, clientIp, limitAsildi, limitKaydet } from "@/lib/composer/rateLimit";

// Route katmanı: köken denetimi, çerez okuma/yazma, oturumdan hesap, deneme sınırı.

// Durum değiştiren her istek yalnız aynı kökenden gelebilir. SameSite=Lax oturum çerezini korur ama
// oturum *açan* uç noktaları (giriş/kayıt) başka sitenin "text/plain" formuna karşı korumaz.
export function kokenReddi(req: Request, json = true): NextResponse | null {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return NextResponse.json({ error: "İzin verilmeyen kaynak." }, { status: 403 });
  const origin = req.headers.get("origin");
  if (origin) {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      /* "null" ya da bozuk köken */
    }
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
    if (originHost !== host) return NextResponse.json({ error: "İzin verilmeyen kaynak." }, { status: 403 });
  }
  if (json && !(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "İstek JSON olmalı." }, { status: 415 });
  }
  return null;
}

export function oturumBelirteci(req: Request): string | null {
  const cerez = req.headers.get("cookie") ?? "";
  for (const parca of cerez.split(";")) {
    const [ad, ...deger] = parca.trim().split("=");
    if (ad !== OTURUM_CEREZI) continue;
    try {
      return decodeURIComponent(deger.join("="));
    } catch {
      return null;
    }
  }
  return null;
}

// Depo hatası da oturumsuz sayılır (401): hata loglanır, istek yetkisiz yola düşer.
export async function istekHesabi(req: Request): Promise<Hesap | null> {
  try {
    return await oturumHesabi(getAuthStore(), oturumBelirteci(req));
  } catch (err) {
    console.error("[auth] oturum okunamadı", err instanceof Error ? err.message : err);
    return null;
  }
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
const cokDeneme = () => NextResponse.json({ error: "Çok fazla deneme yapıldı. Biraz sonra tekrar deneyin." }, { status: 429 });
const sinirYok = () => NextResponse.json({ error: "Şu anda işlem yapılamıyor. Biraz sonra tekrar deneyin." }, { status: 503 });

// Okullarda öğretmenler aynı IP'yi paylaşır: IP sınırı geniş tutulur.
// Kullanıcı adına yönelik tahmin yalnız HATALI denemelerle sayılır: ad+IP başına dar, ad başına (dağıtık saldırı) geniş.
const hataAnahtarlari = (ad: string, ip: string) => [
  { key: `dersera:giris-hata:ad:${ad}:ip:${ip}`, max: 10 },
  { key: `dersera:giris-hata:ad:${ad}`, max: 100 },
];

export async function denemeOnKontrol(req: Request, tur: "giris" | "kayit", ad?: string): Promise<NextResponse | null> {
  try {
    const ip = clientIp(req);
    if (tur === "kayit") return (await checkLimit(`dersera:kayit:ip:${ip}`, SAAT, 30)) ? null : cokDeneme();
    if (!(await checkLimit(`dersera:giris:ip:${ip}`, ON_BES_DK, 100))) return cokDeneme();
    if (!ad) return null;
    for (const { key, max } of hataAnahtarlari(ad, ip)) if (await limitAsildi(key, ON_BES_DK, max)) return cokDeneme();
    return null;
  } catch (err) {
    console.error("[auth] deneme sınırı denetlenemedi", err instanceof Error ? err.message : err);
    return sinirYok();
  }
}

export async function hataliDenemeKaydet(req: Request, ad: string): Promise<void> {
  try {
    const ip = clientIp(req);
    for (const { key } of hataAnahtarlari(ad, ip)) await limitKaydet(key, ON_BES_DK);
  } catch (err) {
    console.error("[auth] deneme kaydedilemedi", err instanceof Error ? err.message : err);
  }
}

export async function jsonGovde(req: Request): Promise<Record<string, unknown>> {
  const b = await req.json().catch(() => null);
  return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
}

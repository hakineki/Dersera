import { after, NextResponse } from "next/server";
import { checkLimit, clientIp } from "@/lib/composer/rateLimit";
import { epostaGonder, EpostaYapilandirilmadiError } from "@/lib/eposta";
import { getAuthStore } from "@/lib/authStore";
import type { EpostaDeps } from "@/lib/epostaService";
import { getEpostaStore } from "@/lib/epostaStore";

// E-posta ve şifre sıfırlama uçlarının ortak katmanı: depolar, gönderim, arka plan işi, IP sınırı, hata yanıtı.

// Yanıttan sonra çalışır (sunucusuz ortamda işlev iş bitene kadar açık kalır); istek dışında (testte) hemen başlatılır.
function arkaPlan(is: () => Promise<void>): void {
  const calis = () => is().catch((err) => console.error("[eposta] arka plan işi başarısız", err instanceof Error ? err.message : err));
  try {
    after(calis);
  } catch {
    void calis();
  }
}

export const epostaDeps = (): EpostaDeps => ({ auth: getAuthStore(), eposta: getEpostaStore(), gonder: (e) => epostaGonder(e), arkaPlan });

const ON_BES_DK = 15 * 60 * 1000;

// Oturumsuz uçlar (doğrulama, sıfırlama isteği ve sıfırlama) IP başına sınırlıdır.
export async function ipSiniri(req: Request, ad: string, max: number): Promise<NextResponse | null> {
  try {
    if (await checkLimit(`dersera:${ad}:ip:${clientIp(req)}`, ON_BES_DK, max)) return null;
    return NextResponse.json({ error: "Çok fazla deneme yapıldı. Biraz sonra tekrar deneyin." }, { status: 429 });
  } catch (err) {
    console.error("[eposta] deneme sınırı denetlenemedi", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Şu anda işlem yapılamıyor. Biraz sonra tekrar deneyin." }, { status: 503 });
  }
}

export function epostaHatasi(err: unknown): NextResponse {
  if (err instanceof EpostaYapilandirilmadiError) {
    console.error("[eposta] yapılandırma eksik", err.message);
    return NextResponse.json({ error: "E-posta gönderimi şu anda kullanılamıyor. Platform yöneticisine yaz." }, { status: 503 });
  }
  console.error("[eposta] işlem hatası", err instanceof Error ? err.message : err);
  return NextResponse.json({ error: "İşlem şu anda yapılamadı. Biraz sonra tekrar dene." }, { status: 503 });
}

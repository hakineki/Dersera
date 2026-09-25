import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { kokenReddi } from "@/lib/authRequest";
import { yedekAl, YedekYapilandirmaHatasi } from "@/lib/yedekDepo";
import { yoneticiHesabi } from "@/lib/yoneticiIstek";

// Gece yedeği (lib/yedekDepo.ts). GET: Vercel Cron (vercel.json), "Authorization: Bearer CRON_SECRET" ile. POST: platform
// yöneticisi elle ("şimdi yedekle"). Yanıt yalnız özet döner; veri asla yanıtta yer almaz.
export const maxDuration = 300;

function cronYetkili(req: Request): boolean {
  const gizli = process.env.CRON_SECRET?.trim();
  if (!gizli) return false;
  const gelen = Buffer.from(req.headers.get("authorization") ?? "");
  const beklenen = Buffer.from(`Bearer ${gizli}`);
  return gelen.length === beklenen.length && timingSafeEqual(gelen, beklenen);
}

async function calistir() {
  try {
    const r = await yedekAl();
    console.info(`[yedek] alındı: ${r.anahtarSayisi} anahtar, ${r.bayt} bayt, ${r.silinen} eski yedek silindi`);
    return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[yedek] alınamadı", err instanceof Error ? err.message : err);
    const yapilandirma = err instanceof YedekYapilandirmaHatasi;
    return NextResponse.json({ error: yapilandirma ? `Yedek yapılandırılmamış: ${(err as Error).message}` : "Yedek alınamadı." }, { status: 503 });
  }
}

export async function GET(req: Request) {
  if (!cronYetkili(req)) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  return calistir();
}

export async function POST(req: Request) {
  const koken = kokenReddi(req, false);
  if (koken) return koken;
  const y = await yoneticiHesabi(req);
  if (y.yanit) return y.yanit;
  return calistir();
}

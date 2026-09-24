import { NextResponse } from "next/server";
import { ComposeError } from "@/lib/composer/anthropic";
import { parseComposeInput } from "@/lib/composer/input";
import { checkComposeLimit, clientIp, LimiterUnavailableError } from "@/lib/composer/rateLimit";
import { composeAndValidate } from "@/lib/composer/service";
import { YZ_DENETIM, yzDenetle } from "@/lib/composer/yzDenetimService";
import type { YzDenetim } from "@/lib/composer/yzDenetim";
import { istekHesabi, kokenReddi, oturumGerekli } from "@/lib/authRequest";
import { olusturmaMaliyeti } from "@/lib/kredi";
import { krediDurumu, krediHarca, krediIade, krediTamamla, type Harcama } from "@/lib/krediService";

// Üretim (iskelet + paralel görevler) 190 sn, düzeltmeyle birlikte en çok ~245 sn; platform sınırı bunun üstünde kalmalı.
export const maxDuration = 280; // Vercel Fluid (Hobby) üst sınırı 300 sn

const GENEL_HATA = "Oyun şu anda oluşturulamadı. Tekrar deneyin.";
// Çocuk güvenliği denetimi üretimden sonra kalan süreyle yapılır; süre yetmezse yayında yapılır.
const DENETIM_SONU_MS = (maxDuration - 8) * 1000;
const DENETIM_EN_AZ_MS = 8_000;

export async function POST(req: Request) {
  const basla = Date.now();
  // Ücretli uç nokta yalnız giriş yapmış öğretmene açıktır.
  const koken = kokenReddi(req);
  if (koken) return koken;
  const hesap = await istekHesabi(req);
  if (!hesap) return oturumGerekli();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const parsed = parseComposeInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });

  try {
    if (!(await checkComposeLimit(clientIp(req)))) {
      return NextResponse.json({ error: "Bu saat için oyun oluşturma sınırına ulaşıldı. Bir sonraki saat başında tekrar deneyin." }, { status: 429 });
    }
  } catch (err) {
    console.error("[compose] oran sınırı denetlenemedi", err instanceof Error ? err.message : err);
    if (err instanceof LimiterUnavailableError) {
      return NextResponse.json({ error: "Oyun oluşturucu yapılandırılmamış. Yöneticinize bildirin." }, { status: 503 });
    }
    return NextResponse.json({ error: GENEL_HATA }, { status: 503 });
  }

  // Kredi oran sınırından sonra, yapay zekâ çağrısından önce atomik olarak düşer; oluşturma başarısızsa iade edilir.
  const maliyet = olusturmaMaliyeti(parsed.input.sure);
  let harcama: Harcama | null;
  try {
    harcama = await krediHarca(hesap.id, maliyet, `Oyun oluşturma (${parsed.input.sure} dk)`);
  } catch (err) {
    console.error("[compose] kredi okunamadı", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: GENEL_HATA }, { status: 503 });
  }
  if (!harcama) {
    const kredi = await krediDurumu(hesap.id).catch(() => null);
    return NextResponse.json({ error: `Bu oyun ${maliyet} kredi; bakiyen yetmiyor. Aylık hakkın ay başında yenilenir.`, kredi }, { status: 402 });
  }

  try {
    const { definition, validation } = await composeAndValidate(parsed.input);
    await krediTamamla(hesap.id, harcama);
    const kalan = Math.min(DENETIM_SONU_MS - (Date.now() - basla), YZ_DENETIM.sureMs);
    const guvenlik: YzDenetim = !validation.gecerli || kalan < DENETIM_EN_AZ_MS ? { durum: "bekliyor" } : await yzDenetle(definition, { timeoutMs: kalan });
    return NextResponse.json({
      kredi: await krediDurumu(hesap.id).catch(() => null),
      definition,
      validation,
      guvenlik,
      dersler: parsed.input.dersler.map((k) => ({ ders: k.ders, konuId: k.konuId })),
      hedefler: parsed.input.ogrenmeCiktilari,
      hedefDersleri: parsed.input.hedefDersleri,
    });
  } catch (err) {
    // İade yazılamazsa harcama askıda kalır ve birkaç dakika içinde kendiliğinden iade edilir; öğretmene söylenir.
    const iadeEdildi = await krediIade(hesap.id, harcama, "Oyun oluşturulamadı: kredi iadesi");
    const ek = iadeEdildi ? {} : { krediNotu: "Kredin birkaç dakika içinde otomatik olarak iade edilecek." };
    const hata = (mesaj: string) => (iadeEdildi ? mesaj : `${mesaj} ${ek.krediNotu}`);
    if (err instanceof ComposeError) {
      console.error(`[compose] ${err.reason}: ${err.message}`);
      if (err.reason === "config") {
        return NextResponse.json({ error: hata("Oyun oluşturucu yapılandırılmamış. Yöneticinize bildirin."), ...ek }, { status: 503 });
      }
      if (err.reason === "timeout") {
        return NextResponse.json({ error: hata(GENEL_HATA), timeout: true, ...ek }, { status: 504 });
      }
    } else {
      console.error("[compose] beklenmeyen hata", err instanceof Error ? err.message : err);
    }
    return NextResponse.json({ error: hata(GENEL_HATA), ...ek }, { status: 502 });
  }
}

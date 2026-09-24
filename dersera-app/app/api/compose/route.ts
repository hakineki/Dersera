import { NextResponse } from "next/server";
import { ComposeError } from "@/lib/composer/anthropic";
import { parseComposeInput } from "@/lib/composer/input";
import { checkComposeLimit, clientIp, LimiterUnavailableError } from "@/lib/composer/rateLimit";
import { composeAndValidate } from "@/lib/composer/service";
import { istekHesabi, kokenReddi, oturumGerekli } from "@/lib/authRequest";
import { olusturmaMaliyeti } from "@/lib/kredi";
import { krediDurumu, krediHarca, krediIade, type Harcama } from "@/lib/krediService";

// Üretim (iskelet + paralel görevler) 190 sn, düzeltmeyle birlikte en çok ~245 sn; platform sınırı bunun üstünde kalmalı.
export const maxDuration = 280; // Vercel Fluid (Hobby) üst sınırı 300 sn

const GENEL_HATA = "Oyun şu anda oluşturulamadı. Tekrar deneyin.";

export async function POST(req: Request) {
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
    return NextResponse.json({
      kredi: await krediDurumu(hesap.id).catch(() => null),
      definition,
      validation,
      dersler: parsed.input.dersler.map((k) => ({ ders: k.ders, konuId: k.konuId })),
      hedefler: parsed.input.ogrenmeCiktilari,
      hedefDersleri: parsed.input.hedefDersleri,
    });
  } catch (err) {
    try {
      await krediIade(hesap.id, harcama, "Oyun oluşturulamadı: kredi iadesi");
    } catch (iadeHatasi) {
      console.error("[compose] kredi iade edilemedi", iadeHatasi instanceof Error ? iadeHatasi.message : iadeHatasi);
    }
    if (err instanceof ComposeError) {
      console.error(`[compose] ${err.reason}: ${err.message}`);
      if (err.reason === "config") {
        return NextResponse.json({ error: "Oyun oluşturucu yapılandırılmamış. Yöneticinize bildirin." }, { status: 503 });
      }
      if (err.reason === "timeout") {
        return NextResponse.json({ error: GENEL_HATA, timeout: true }, { status: 504 });
      }
    } else {
      console.error("[compose] beklenmeyen hata", err instanceof Error ? err.message : err);
    }
    return NextResponse.json({ error: GENEL_HATA }, { status: 502 });
  }
}

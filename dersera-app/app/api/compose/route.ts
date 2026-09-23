import { NextResponse } from "next/server";
import { ComposeError } from "@/lib/composer/anthropic";
import { parseComposeInput } from "@/lib/composer/input";
import { checkComposeLimit, clientIp, LimiterUnavailableError } from "@/lib/composer/rateLimit";
import { composeAndValidate } from "@/lib/composer/service";

// Anthropic çağrısı 30 sn ile sınırlı; platform sınırı bunun üstünde kalmalı.
export const maxDuration = 45;

const GENEL_HATA = "Oyun şu anda oluşturulamadı. Tekrar deneyin.";

export async function POST(req: Request) {
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
      return NextResponse.json({ error: "Çok fazla oyun oluşturma isteği. Bir süre sonra tekrar deneyin." }, { status: 429 });
    }
  } catch (err) {
    console.error("[compose] oran sınırı denetlenemedi", err instanceof Error ? err.message : err);
    if (err instanceof LimiterUnavailableError) {
      return NextResponse.json({ error: "Oyun oluşturucu yapılandırılmamış. Yöneticinize bildirin." }, { status: 503 });
    }
    return NextResponse.json({ error: GENEL_HATA }, { status: 503 });
  }

  try {
    const { definition, validation } = await composeAndValidate(parsed.input);
    return NextResponse.json({ definition, validation, konuId: parsed.input.konuId, hedefler: parsed.input.ogrenmeCiktilari });
  } catch (err) {
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

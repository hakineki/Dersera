import { NextResponse } from "next/server";
import { istekHesabi, kokenReddi, oturumGerekli } from "@/lib/authRequest";
import { validationContext } from "@/lib/composer/context";
import { parseComposeInput } from "@/lib/composer/input";
import { bosSablon } from "@/lib/composer/sablon";
import { validateGame } from "@/lib/composer/validator";
import type { YzDenetim } from "@/lib/composer/yzDenetim";
import { krediDurumu } from "@/lib/krediService";

// Boş şablon (yalnız giriş yapmış öğretmen): yapay zekâ çağrılmaz, kredi harcanmaz, öğrenme sinyali yazılmaz. Yanıt
// oluşturma uç noktasıyla aynı biçimdedir; Composer önizlemesi, düzenleyicisi, kütüphanesi ve yayını aynen kullanılır.
// İçerik denetimi metinler yazıldıktan sonra yayında yapılır; yayın kapıları diğer oyunlarla aynıdır.
export async function POST(req: Request) {
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

  const { input } = parsed;
  const definition = bosSablon(input);
  const guvenlik: YzDenetim = { durum: "bekliyor" };
  return NextResponse.json({
    kredi: await krediDurumu(hesap.id).catch(() => null),
    definition,
    validation: validateGame(definition, validationContext(input)),
    guvenlik,
    dersler: input.dersler.map((k) => ({ ders: k.ders, konuId: k.konuId })),
    hedefler: input.ogrenmeCiktilari,
    hedefDersleri: input.hedefDersleri,
  });
}

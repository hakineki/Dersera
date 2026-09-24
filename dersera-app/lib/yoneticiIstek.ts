import { NextResponse } from "next/server";
import { istekHesabi, oturumGerekli } from "@/lib/authRequest";
import type { Hesap } from "@/lib/authStore";
import { yoneticiMi } from "@/lib/yonetici";

// Platform yöneticisi uç noktaları (moderasyon, okul kredi havuzu): oturum yoksa 401, yönetici değilse 403.
export async function yoneticiHesabi(req: Request): Promise<{ hesap: Hesap; yanit?: undefined } | { yanit: NextResponse }> {
  const hesap = await istekHesabi(req);
  if (!hesap) return { yanit: oturumGerekli() };
  if (!(await yoneticiMi(hesap))) return { yanit: NextResponse.json({ error: "Bu sayfa yalnız yöneticilere açık." }, { status: 403 }) };
  return { hesap };
}

import { NextResponse } from "next/server";
import { istekHesabi, kokenReddi, oturumGerekli } from "@/lib/authRequest";
import type { Hesap } from "@/lib/authStore";
import { getAuthStore } from "@/lib/authStore";
import { getIstatistikStore } from "@/lib/istatistikStore";
import { getLibraryStore } from "@/lib/libraryStore";
import type { OkulDeps } from "@/lib/okulService";
import { getOkulStore } from "@/lib/okulStore";

export const okulDepolari = (): OkulDeps => ({ okul: getOkulStore(), auth: getAuthStore(), library: getLibraryStore(), istatistik: getIstatistikStore() });

// Okul uç noktalarının ortak kalıbı: (yazmada) köken denetimi, oturum, hata → 503. Sonuç { ok, ... } biçimindedir.
// Gövdesiz yazma (DELETE) JSON içerik türü gerektirmez.
export async function okulIslemi(
  req: Request,
  is: (hesap: Hesap, d: OkulDeps) => Promise<{ ok: true } | { ok: false; status: number; error: string }>,
  { yazma = false, govdesiz = false, basari = 200 }: { yazma?: boolean; govdesiz?: boolean; basari?: number } = {}
) {
  if (yazma) {
    const koken = kokenReddi(req, !govdesiz);
    if (koken) return koken;
  }
  const hesap = await istekHesabi(req);
  if (!hesap) return oturumGerekli();
  try {
    const r = await is(hesap, okulDepolari());
    if (!r.ok) {
      const { status, ok: _o, ...hata } = r;
      void _o;
      return NextResponse.json(hata, { status });
    }
    const { ok: _ok, ...veri } = r;
    void _ok;
    return NextResponse.json(veri, { status: basari, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[okul] işlem başarısız", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Okul işlemi şu anda yapılamadı. Tekrar deneyin." }, { status: 503 });
  }
}

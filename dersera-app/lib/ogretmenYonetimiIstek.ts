import { NextResponse } from "next/server";
import { denemeOnKontrol, hataliDenemeKaydet, jsonGovde, kokenReddi } from "@/lib/authRequest";
import { getAuthStore, type Hesap } from "@/lib/authStore";
import { getDenetimKaydiStore } from "@/lib/denetimKaydi";
import { getKoleksiyonStore } from "@/lib/koleksiyonStore";
import { getKrediStore } from "@/lib/krediStore";
import { getLibraryStore } from "@/lib/libraryStore";
import { getOgrenmeTakibiStore } from "@/lib/ogrenmeTakibiStore";
import type { OgretmenYonetimiDeps, Sonuc } from "@/lib/ogretmenYonetimi";
import { getOkulStore } from "@/lib/okulStore";
import { getToplulukStore } from "@/lib/toplulukStore";
import { yoneticiMi } from "@/lib/yonetici";
import { yoneticiHesabi } from "@/lib/yoneticiIstek";
import { getYonetimIslemKaydiStore } from "@/lib/yonetimIslemKaydi";

// Yönetim uç noktalarının (öğretmenler, okullar) ortak katmanı: yönetici denetimi, köken, depolar, hata yanıtı.

export const HESAP_ID = /^[0-9a-f]{24}$/;

export const yonetimDeps = (): OgretmenYonetimiDeps => ({
  auth: getAuthStore(),
  okul: getOkulStore(),
  library: getLibraryStore(),
  koleksiyon: getKoleksiyonStore(),
  kredi: getKrediStore(),
  denetim: getDenetimKaydiStore(),
  takip: getOgrenmeTakibiStore(),
  topluluk: getToplulukStore(),
  islemler: getYonetimIslemKaydiStore(),
  yoneticiMi: (h) => yoneticiMi(h),
});

export async function yonetimIslemi<T>(
  req: Request,
  islem: (yonetici: Hesap, d: OgretmenYonetimiDeps, govde: Record<string, unknown>) => Promise<Sonuc<T>>,
  { yazma = false, sifreli = false }: { yazma?: boolean; sifreli?: boolean } = {}
): Promise<NextResponse> {
  if (yazma) {
    const koken = kokenReddi(req);
    if (koken) return koken;
  }
  const y = await yoneticiHesabi(req);
  if (y.yanit) return y.yanit;
  if (sifreli) {
    const sinir = await denemeOnKontrol(req, "giris", y.hesap.kullaniciAdi);
    if (sinir) return sinir;
  }
  const govde = yazma ? await jsonGovde(req) : {};
  try {
    const r = await islem(y.hesap, yonetimDeps(), govde);
    if (!r.ok) {
      // Yöneticinin şifre denemesi de giriş gibi sayılır.
      if (sifreli && r.status === 403) await hataliDenemeKaydet(req, y.hesap.kullaniciAdi);
      return NextResponse.json({ error: r.error }, { status: r.status });
    }
    return NextResponse.json(r.value ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[yonetim] işlem hatası", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: yazma ? "İşlem tamamlanamadı; sayfayı yenileyip durumu kontrol et." : "Bilgi okunamadı." }, { status: 503 });
  }
}

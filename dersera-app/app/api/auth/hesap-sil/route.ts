import { NextResponse } from "next/server";
import { oturumKapat } from "@/lib/auth";
import { getAuthStore } from "@/lib/authStore";
import { denemeOnKontrol, hataliDenemeKaydet, istekHesabi, jsonGovde, kokenReddi, oturumBelirteci, oturumCereziSil, oturumGerekli } from "@/lib/authRequest";
import { getDenetimKaydiStore } from "@/lib/denetimKaydi";
import { getEpostaStore } from "@/lib/epostaStore";
import { hesabiSil } from "@/lib/hesapSilme";
import { getKoleksiyonStore } from "@/lib/koleksiyonStore";
import { getKrediStore } from "@/lib/krediStore";
import { getLibraryStore } from "@/lib/libraryStore";
import { getOgrenmeTakibiStore } from "@/lib/ogrenmeTakibiStore";
import { getOkulStore } from "@/lib/okulStore";
import { getToplulukStore } from "@/lib/toplulukStore";
import { yoneticiMi } from "@/lib/yonetici";

// "Hesabımı sil": şifreyle onaylanır; şifre denemesi giriş gibi sınırlıdır. Başarıda bu tarayıcının oturum çerezi de
// silinir (hesap gittiği için diğer cihazlardaki oturumlar da geçersizdir).
export async function POST(req: Request) {
  const koken = kokenReddi(req);
  if (koken) return koken;
  const hesap = await istekHesabi(req);
  if (!hesap) return oturumGerekli();
  const sinir = await denemeOnKontrol(req, "giris", hesap.kullaniciAdi);
  if (sinir) return sinir;
  const b = await jsonGovde(req);
  try {
    const auth = getAuthStore();
    const r = await hesabiSil(
      {
        auth,
        okul: getOkulStore(),
        library: getLibraryStore(),
        koleksiyon: getKoleksiyonStore(),
        kredi: getKrediStore(),
        denetim: getDenetimKaydiStore(),
        takip: getOgrenmeTakibiStore(),
        topluluk: getToplulukStore(),
        eposta: getEpostaStore(),
        yoneticiMi: (h) => yoneticiMi(h),
      },
      hesap,
      b.sifre
    );
    if (!r.ok) {
      if (r.status === 403) await hataliDenemeKaydet(req, hesap.kullaniciAdi);
      return NextResponse.json({ error: r.error }, { status: r.status });
    }
    await oturumKapat(auth, oturumBelirteci(req)).catch(() => {});
    return oturumCereziSil(NextResponse.json({ ok: true }));
  } catch (err) {
    console.error("[auth] hesap silme hatası", err instanceof Error ? err.message : err);
    // Silme başladıysa oturumlar kapanmıştır; verilerin bir kısmı silinmiş olabilir, hesap durur ve tekrar denenebilir.
    return oturumCereziSil(NextResponse.json({ error: "Hesap silme tamamlanamadı; verilerinin bir kısmı silinmiş olabilir. Yeniden giriş yapıp tekrar dene." }, { status: 503 }));
  }
}

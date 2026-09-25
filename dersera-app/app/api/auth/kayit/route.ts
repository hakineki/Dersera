import { NextResponse } from "next/server";
import { hesapOzeti, kayitOl, oturumAc, oturumKapat } from "@/lib/auth";
import { getAuthStore } from "@/lib/authStore";
import { denemeOnKontrol, jsonGovde, kokenReddi, oturumBelirteci, oturumCereziYaz } from "@/lib/authRequest";
import { getDenetimKaydiStore } from "@/lib/denetimKaydi";
import { KOSUL_SURUMU } from "@/lib/kosullar";

export async function POST(req: Request) {
  const red = kokenReddi(req) ?? (await denemeOnKontrol(req, "kayit"));
  if (red) return red;
  const b = await jsonGovde(req);
  // Kullanım koşulları onaylanmadan hesap açılmaz (onay sürümüyle kaydedilir).
  if (b.kosulOnayi !== true) return NextResponse.json({ error: "Hesap açmak için kullanım koşullarını onaylaman gerekiyor." }, { status: 422 });
  try {
    const store = getAuthStore();
    const r = await kayitOl(store, b.kullaniciAdi, b.sifre, b.davetKodu);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    // Onay bu istekte verildi; hesap açıldıktan sonra kayıt yazılamazsa bir kez daha denenir, yine olmazsa loglanır.
    // Hesap artık var: burada hata dönmek, öğretmenin açılmış hesabını "başarısız" gösterip adını kilitlerdi.
    const onay = { surum: KOSUL_SURUMU, tarih: Date.now() };
    const denetim = getDenetimKaydiStore();
    await denetim
      .kosulOnayiYaz(r.value.id, onay)
      .catch(() => denetim.kosulOnayiYaz(r.value.id, onay))
      .catch((err) => console.error("[auth] koşul onayı yazılamadı", r.value.id, onay, err instanceof Error ? err.message : err));
    // Bu tarayıcıda açık önceki oturum kapatılır.
    await oturumKapat(store, oturumBelirteci(req));
    return oturumCereziYaz(NextResponse.json({ hesap: hesapOzeti(r.value) }, { status: 201 }), await oturumAc(store, r.value));
  } catch (err) {
    console.error("[auth] kayıt hatası", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Hesap şu anda oluşturulamadı." }, { status: 503 });
  }
}

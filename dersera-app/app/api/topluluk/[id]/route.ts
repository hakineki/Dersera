import { NextResponse } from "next/server";
import { istekHesabi, oturumGerekli } from "@/lib/authRequest";
import { getToplulukStore } from "@/lib/toplulukStore";
import { kullanimDetayi } from "@/lib/toplulukService";
import { cocukGuvenligiTara } from "@/lib/composer/cocukGuvenligi";
import { checkLimit } from "@/lib/composer/rateLimit";
import { kopyaKaydet } from "@/lib/denetimKaydi";

// Toplu kopyalamaya karşı: öğretmen günde en çok bu kadar başka öğretmene ait topluluk oyununun tam içeriğini açar.
export const GUNLUK_ACMA = 20;
const GUN_MS = 24 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// "Oyunu Kullan": tam oyun (cevaplar dahil) yalnız öğretmen oturumuyla verilir; öğrenci cevapları buradan göremez.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const hesap = await istekHesabi(req);
  if (!hesap) return oturumGerekli();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Oyun bulunamadı" }, { status: 404 });
  try {
    const store = getToplulukStore();
    const kayit = await store.get(id);
    if (!kayit || !kayit.aktif) return NextResponse.json({ error: "Oyun bulunamadı" }, { status: 404 });
    // Yönetişimden önce eklenmiş (ya da engelleme listesi sonradan genişlemiş) kayıt engelleyen ifade içeriyorsa
    // verilmez ve listeden kaldırılır (reddedildi). Sahibi düzeltip yeniden gönderebilir.
    if (cocukGuvenligiTara(kayit.definition).some((e) => e.engel)) {
      await store.durumGecis(id, ["yayinda"], "reddedildi", "yayinda").catch((err: unknown) => console.error("[topluluk] listeden çıkarılamadı", err instanceof Error ? err.message : err));
      return NextResponse.json({ error: "Oyun bulunamadı" }, { status: 404 });
    }
    // Kendi oyunu sayılmaz; başkasının oyunu sınıra tabi ve kayda geçer.
    if (kayit.olusturan !== `hesap:${hesap.id}`) {
      const izin = await checkLimit(`dersera:topluluk:acma:${hesap.id}`, GUN_MS, GUNLUK_ACMA).catch(() => true);
      if (!izin) return NextResponse.json({ error: `Günde en çok ${GUNLUK_ACMA} topluluk oyununu açabilirsin. Yarın tekrar dene.` }, { status: 429 });
      await kopyaKaydet({ tarih: Date.now(), hesapId: hesap.id, kullaniciAdi: hesap.kullaniciAdi, tur: "topluluk", oyunId: id, baslik: kayit.baslik });
    }
    return NextResponse.json(kullanimDetayi(kayit), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[topluluk] okunamadı", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Oyun okunamadı" }, { status: 503 });
  }
}

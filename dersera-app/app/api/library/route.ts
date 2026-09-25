import { kutuphaneOkulDurumu } from "@/lib/okulService";
import { getOkulStore } from "@/lib/okulStore";
import { NextResponse } from "next/server";
import { ozetOf } from "@/lib/library";
import { getLibraryStore } from "@/lib/libraryStore";
import { istekHesabi, kokenReddi, oturumGerekli } from "@/lib/authRequest";
import { kutuphaneSahibi } from "@/lib/auth";
import { istekSahibi, kutuphaneyeEkle } from "@/lib/libraryService";
import { kutuphaneIstatistikleri } from "@/lib/istatistikService";
import { baslangicDurumu, hesapHazirligi, paylasimUygunlugu, toplulukDurumlari } from "@/lib/toplulukPaylasim";
import { getToplulukStore } from "@/lib/toplulukStore";

export async function GET(req: Request) {
  const hesap = await istekHesabi(req);
  if (!hesap) return oturumGerekli();
  const sahip = kutuphaneSahibi(hesap);
  try {
    const store = getLibraryStore();
    const kayitlar = await store.list(sahip);
    const sirali = kayitlar.map(ozetOf).sort((a, b) => b.createdAt - a.createdAt);
    const kaynaklar = sirali.map((o) => `${sahip}:${o.id}`);
    const ist = await kutuphaneIstatistikleri(kaynaklar);
    const topluluk = await toplulukDurumlari(getToplulukStore(), kaynaklar);
    const baslangic = await baslangicDurumu(getToplulukStore());
    // Okul okunamazsa kütüphane yine gelir (okul bilgisi boş).
    const okul = await kutuphaneOkulDurumu({ okul: getOkulStore() }, hesap, kaynaklar).catch((err: unknown) => {
      console.error("[kutuphane] okul durumu okunamadı", err instanceof Error ? err.message : err);
      return { okul: null, paylasimlar: kaynaklar.map(() => null) };
    });
    const now = Date.now();
    const oyunlar = sirali.map((o, i) => ({ ...o, ...ist[i], topluluk: topluluk[i], paylasim: paylasimUygunlugu(hesap, ist[i], now, !!baslangic), okulPaylasimi: okul.paylasimlar[i] }));
    return NextResponse.json({ oyunlar, hesap: hesapHazirligi(hesap, now, !!baslangic), toplulukBaslangic: baslangic, okul: okul.okul, persistent: store.persistent });
  } catch (err) {
    console.error("[kutuphane] listeleme hatası", err);
    return NextResponse.json({ error: "Kütüphane okunamadı" }, { status: 503 });
  }
}

// Composer'daki "Kütüphaneye kaydet" butonu. Yayınlamadan bağımsızdır.
export async function POST(req: Request) {
  const koken = kokenReddi(req);
  if (koken) return koken;
  const sahip = await istekSahibi(req);
  if (!sahip) return oturumGerekli();
  const body = await req.json().catch(() => null);
  try {
    const r = await kutuphaneyeEkle(getLibraryStore(), sahip, body);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ id: r.id, validation: r.validation }, { status: 201 });
  } catch (err) {
    console.error("[kutuphane] kayıt hatası", err);
    return NextResponse.json({ error: "Oyun kütüphaneye kaydedilemedi" }, { status: 503 });
  }
}

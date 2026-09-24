import { kutuphaneSahibi } from "@/lib/auth";
import type { Hesap } from "@/lib/authStore";
import { gecerliPuan } from "@/lib/istatistik";
import { durumOf, ogretmenOrtalamasi, TOPLULUK_KURALLARI as K } from "@/lib/topluluk";
import type { ToplulukStore } from "@/lib/toplulukStore";

// Öğretmen puanı (Teacher Quality, docs/URUN-BAGLAMI.md §14): topluluk oyununu kendi sınıfında oynatan öğretmen
// 1–5 puan verir. Oynatma kanıtı: öğretmenin yayınladığı ve bu topluluk kaydına bağlı kodlarda en az
// ogretmenPuaniEnAzOgrenci öğrenci oyunu bitirmiştir. Oyunun sahibi puanlayamaz. Öğretmen puanını güncelleyebilir.

export interface OgretmenPuaniDurumu {
  ortalama: number | null;
  sayi: number;
  benim: number | null;
  uygun: boolean;
  neden?: string;
}

async function uygunluk(store: ToplulukStore, sahip: string, id: string): Promise<{ uygun: boolean; neden?: string; kayitVar: boolean }> {
  const kayit = await store.get(id);
  if (!kayit || durumOf(kayit) !== "yayinda") return { uygun: false, neden: "Bu oyun toplulukta değil.", kayitVar: false };
  if (kayit.olusturan === sahip) return { uygun: false, neden: "Kendi oyununu puanlayamazsın.", kayitVar: true };
  const kullanim = await store.ogretmenKullanimi(id, sahip);
  if (kullanim < K.ogretmenPuaniEnAzOgrenci) {
    return {
      uygun: false,
      neden: `Puan verebilmek için bu oyunu değiştirmeden sınıfında oynatmalısın; en az ${K.ogretmenPuaniEnAzOgrenci} öğrencinin bitirmesi gerekir (şu an ${kullanim}). Düzenlediğin kopyaların sonuçları bu oyuna sayılmaz.`,
      kayitVar: true,
    };
  }
  return { uygun: true, kayitVar: true };
}

export async function ogretmenPuaniDurumu(store: ToplulukStore, hesap: Hesap, id: string): Promise<OgretmenPuaniDurumu | null> {
  const sahip = kutuphaneSahibi(hesap);
  const u = await uygunluk(store, sahip, id);
  if (!u.kayitVar) return null;
  const [ozet, benim] = await Promise.all([store.ogretmenPuanOzeti(id), store.ogretmenPuani(id, sahip)]);
  return { ortalama: ogretmenOrtalamasi(ozet.toplam, ozet.sayi), sayi: ozet.sayi, benim, uygun: u.uygun, ...(u.neden ? { neden: u.neden } : {}) };
}

export async function ogretmenPuanVer(
  store: ToplulukStore,
  hesap: Hesap,
  id: string,
  body: unknown
): Promise<{ ok: true; durum: OgretmenPuaniDurumu } | { ok: false; status: number; error: string }> {
  const puan = (body as { puan?: unknown } | null)?.puan;
  if (!gecerliPuan(puan)) return { ok: false, status: 422, error: "Puan 1 ile 5 arasında bir tam sayı olmalı." };
  const sahip = kutuphaneSahibi(hesap);
  const u = await uygunluk(store, sahip, id);
  if (!u.kayitVar) return { ok: false, status: 404, error: "Bu oyun toplulukta değil." };
  if (!u.uygun) return { ok: false, status: 403, error: u.neden! };
  await store.ogretmenPuanla(id, sahip, puan);
  return { ok: true, durum: (await ogretmenPuaniDurumu(store, hesap, id))! };
}

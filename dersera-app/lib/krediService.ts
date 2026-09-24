import { ayOf, KREDI_KURALLARI as K, type KrediDurumu } from "@/lib/kredi";
import { getKrediStore } from "@/lib/krediStore";

// Aylık hak kaydı ay bitince silinir; takvim ayından uzun tutulur ki ay sonunda başlayan iade eksik düşmesin.
const AYLIK_SAKLAMA_MS = 40 * 24 * 60 * 60 * 1000;
const GOSTERILEN_HAREKET = 10;

export async function krediDurumu(hesapId: string, now = Date.now()): Promise<KrediDurumu> {
  const ay = ayOf(now);
  const k = await getKrediStore().oku(hesapId, ay, GOSTERILEN_HAREKET);
  const aylikKalan = Math.max(0, K.aylikHak - k.kullanilan);
  return { ay, aylikHak: K.aylikHak, aylikKalan, kazanilan: k.kazanilan, toplam: aylikKalan + k.kazanilan, hareketler: k.hareketler };
}

export interface Harcama {
  ay: string;
  aylik: number;
  kazanilan: number;
}

// Oluşturma öncesi: bakiye yetiyorsa atomik olarak düşer. Yetmezse null.
export async function krediHarca(hesapId: string, miktar: number, aciklama: string, now = Date.now()): Promise<Harcama | null> {
  const ay = ayOf(now);
  const r = await getKrediStore().harca(hesapId, ay, K.aylikHak, miktar, now, aciklama, AYLIK_SAKLAMA_MS);
  return r.ok ? { ay, aylik: r.aylik, kazanilan: r.kazanilan } : null;
}

// Oluşturma başarısızsa harcama aynen geri verilir. Hata yutulmaz: çağıran loglar.
export async function krediIade(hesapId: string, h: Harcama, aciklama: string, now = Date.now()): Promise<void> {
  await getKrediStore().iade(hesapId, h.ay, h.aylik, h.kazanilan, now, aciklama);
}

// Topluluk incelemesinden geçen oyunun sahibine ödül (yan etki: hata onayı bozmaz).
export async function toplulukOdulu(olusturan: string, baslik: string, now = Date.now()): Promise<void> {
  if (K.toplulukKabulOdulu <= 0 || !olusturan.startsWith("hesap:")) return;
  try {
    await getKrediStore().odul(olusturan.slice("hesap:".length), K.toplulukKabulOdulu, now, `Topluluğa kabul: ${baslik}`);
  } catch (err) {
    console.error("[kredi] topluluk ödülü yazılamadı", err instanceof Error ? err.message : err);
  }
}

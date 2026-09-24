import { randomUUID } from "crypto";
import { ayOf, KREDI_KURALLARI as K, type KrediDurumu } from "@/lib/kredi";
import { getKrediStore } from "@/lib/krediStore";

// Aylık hak ve askı kayıtları ay bitince silinir; takvim ayından uzun tutulur ki ay sonunda başlayan iade eksik düşmesin.
const SAKLAMA_MS = 40 * 24 * 60 * 60 * 1000;
const GOSTERILEN_HAREKET = 10;
// Oluşturma en çok ~280 sn sürer (route sınırı). Bundan uzun askıda kalan harcama, işlev kesildiği ya da iade
// yazılamadığı içindir: öğretmenin bir sonraki kredi işleminde kendiliğinden iade edilir.
export const ASKI_SURESI_MS = 6 * 60 * 1000;

export interface Harcama {
  id: string;
  ay: string;
  aylik: number;
  kazanilan: number;
}

async function askidakileriKapat(hesapId: string, now: number): Promise<void> {
  const store = getKrediStore();
  for (const a of await store.askidakiler(hesapId)) {
    if (now - a.tarih >= ASKI_SURESI_MS) await store.iade(hesapId, a, now, "Tamamlanmayan oluşturma: kredi iadesi", SAKLAMA_MS);
  }
}

// Uzlaştırma yan etkidir: okunamazsa bakiye yine gösterilir, bir sonraki denemede yapılır.
async function uzlastir(hesapId: string, now: number) {
  try {
    await askidakileriKapat(hesapId, now);
  } catch (err) {
    console.error("[kredi] askıdaki harcamalar kapatılamadı", err instanceof Error ? err.message : err);
  }
}

export async function krediDurumu(hesapId: string, now = Date.now()): Promise<KrediDurumu> {
  await uzlastir(hesapId, now);
  const ay = ayOf(now);
  const k = await getKrediStore().oku(hesapId, ay, GOSTERILEN_HAREKET);
  const aylikKalan = Math.max(0, K.aylikHak - k.kullanilan);
  return { ay, aylikHak: K.aylikHak, aylikKalan, kazanilan: k.kazanilan, toplam: aylikKalan + k.kazanilan, hareketler: k.hareketler };
}

// Oluşturma öncesi: bakiye yetiyorsa atomik olarak düşer ve askıya yazılır. Yetmezse null.
export async function krediHarca(hesapId: string, miktar: number, aciklama: string, now = Date.now()): Promise<Harcama | null> {
  await uzlastir(hesapId, now);
  const ay = ayOf(now);
  const id = randomUUID();
  const r = await getKrediStore().harca(hesapId, ay, K.aylikHak, miktar, now, aciklama, SAKLAMA_MS, id);
  return r.ok ? { id, ay, aylik: r.aylik, kazanilan: r.kazanilan } : null;
}

// Başarılı oluşturma: harcama kesinleşir. Yazılamazsa askıda kalır ve süre sonunda iade edilir (öğretmen lehine hata).
export async function krediTamamla(hesapId: string, h: Harcama): Promise<void> {
  try {
    await getKrediStore().tamamla(hesapId, h.id);
  } catch (err) {
    console.error("[kredi] harcama kesinleştirilemedi", err instanceof Error ? err.message : err);
  }
}

const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Oluşturma başarısızsa harcama geri verilir; birkaç kez denenir. Yine yazılamazsa askıda kalır ve süre sonunda
// kendiliğinden iade edilir: false döner (öğretmene bildirilir).
export async function krediIade(hesapId: string, h: Harcama, aciklama: string, now = Date.now(), denemeler = 3): Promise<boolean> {
  for (let i = 0; i < denemeler; i++) {
    try {
      const store = getKrediStore();
      const kayit = (await store.askidakiler(hesapId)).find((x) => x.id === h.id);
      // Kayıt yoksa zaten kapanmış (iade edilmiş) demektir.
      if (!kayit) return true;
      await store.iade(hesapId, kayit, now, aciklama, SAKLAMA_MS);
      return true;
    } catch (err) {
      console.error(`[kredi] iade denemesi ${i + 1} başarısız`, err instanceof Error ? err.message : err);
      if (i < denemeler - 1) await bekle(200 * (i + 1));
    }
  }
  return false;
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

import { AsyncLocalStorage } from "node:async_hooks";
import { ayOf } from "@/lib/kredi";
import { getOkulStore } from "@/lib/okulStore";
import { okulAlani, tahminiDolar, turAlani, type YzKullanimi, type YzTuru } from "@/lib/yzMaliyet";
import { getYzMaliyetStore, type YzMaliyetStore } from "@/lib/yzMaliyetStore";

// Ücretli yapay zekâ çağrılarının kaydı. Çağrı noktası (anthropic, openai, görsel) kullanımı bildirir; kimin için
// olduğu istek bağlamından okunur: uç nokta öğretmeni (hesapBagla), servis çağrı türünü (yzTuruIle) koyar. Okul,
// öğretmenin okulundan bulunur. Kişi bazında değil, ay + tür/model ve ay + okul toplamı tutulur.
// Kayıt yan etkidir: hatası çağrıyı bozmaz, yalnız loglanır.

interface Baglam {
  hesapId?: string;
  tur?: YzTuru;
  okulId?: string | null;
}
const baglam = new AsyncLocalStorage<Baglam>();

// Uç noktada, öğretmen bilinince: bu isteğin geri kalanındaki yapay zekâ çağrıları bu öğretmen (ve okulu) adına sayılır.
export function hesapBagla(hesapId: string): void {
  baglam.enterWith({ ...baglam.getStore(), hesapId, okulId: undefined });
}

// Servis düzeyinde: fn içindeki çağrılar bu türle sayılır (öğretmen bilgisi korunur).
export function yzTuruIle<T>(tur: YzTuru, fn: () => Promise<T>): Promise<T> {
  return baglam.run({ ...baglam.getStore(), tur }, fn);
}

async function okulOf(b: Baglam | undefined): Promise<string | null> {
  if (!b?.hesapId) return null;
  if (b.okulId === undefined) b.okulId = await getOkulStore().okulOf(b.hesapId);
  return b.okulId;
}

export async function yzKullanimKaydet(k: YzKullanimi, now = Date.now(), depo?: YzMaliyetStore): Promise<void> {
  try {
    // Depo try içinde çözülür: canlıda Redis yoksa (RedisGerekliError) hata çağrıyı bozmasın.
    const store = depo ?? getYzMaliyetStore();
    const b = baglam.getStore();
    const tur = b?.tur ?? "diger";
    const okulId = await okulOf(b);
    const dolar = tahminiDolar(k);
    const mikrodolar = dolar === null ? 0 : Math.round(dolar * 1_000_000);
    const fiyatsiz = dolar === null ? 1 : 0;
    await store.artir(ayOf(now), {
      [turAlani(tur, k.model, "cagri")]: 1,
      [turAlani(tur, k.model, "giris")]: k.giris ?? 0,
      [turAlani(tur, k.model, "cikis")]: k.cikis ?? 0,
      [turAlani(tur, k.model, "onbellek")]: k.onbellek ?? 0,
      [turAlani(tur, k.model, "gorsel")]: k.gorsel ?? 0,
      [turAlani(tur, k.model, "mikrodolar")]: mikrodolar,
      [turAlani(tur, k.model, "fiyatsiz")]: fiyatsiz,
      [okulAlani(okulId, "cagri")]: 1,
      [okulAlani(okulId, "gorsel")]: k.gorsel ?? 0,
      [okulAlani(okulId, "mikrodolar")]: mikrodolar,
      [okulAlani(okulId, "fiyatsiz")]: fiyatsiz,
    });
  } catch (err) {
    console.error("[yz-maliyet] kaydedilemedi", err instanceof Error ? err.message : err);
  }
}

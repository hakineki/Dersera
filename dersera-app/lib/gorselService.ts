import { randomUUID } from "crypto";
import type { GameDefinition } from "@/lib/composer/definition";
import { GORSEL_HEDEF, GORSEL_IS_ID } from "@/lib/gorsel";
import { gorselIstemleri } from "@/lib/gorselIstem";
import type { GorselStore, HedefDurumu } from "@/lib/gorselStore";
import { GorselHatasi, URETIM_SURESI_MS } from "@/lib/gorselUretici";
import { ASKI_SURESI_MS, krediIade, krediTamamla, type Harcama } from "@/lib/krediService";

// Görsel zenginleştirme akışı. Oyun oluşunca iş kurulur; istemci /api/gorsel/{isId}'yi hedef sayısı kadar çağırır ve
// her çağrı bir görsel üretir (oyunu bloklamaz, ilerleme 0–4/4). Hepsi bitince görselin kredisi bir kez kararlaştırılır:
// en az bir görsel üretildiyse kesinleşir, hiçbiri üretilemediyse iade edilir. İstemci hiç tetiklemezse askıdaki
// harcama ASKI_SURESI_MS sonunda kendiliğinden iade edilir; bu yüzden üretim ancak ondan önce başlayabilir.

export const GORSEL_SURESI_MS = ASKI_SURESI_MS - 60_000;
const IS_TTL_MS = 24 * 60 * 60 * 1000;
// /api/gorsel route sınırı (60 sn) geçmiş "calisiyor" hedefi yarıda kalmıştır: yeniden sahiplenilebilir.
const BAYAT_MS = 70_000;

export interface GorselDeps {
  store: GorselStore;
  uret: (isId: string, hedef: string, istem: string) => Promise<string>;
}

export interface GorselDurumu {
  hazir: string[];
  hata: number;
  toplam: number;
  bitti: boolean;
}

type Sonuc<T> = ({ ok: true } & T) | { ok: false; status: number; error: string };
const BULUNAMADI: Sonuc<never> = { ok: false, status: 404, error: "Görsel işi bulunamadı." };

function ozet(hedefler: string[], durumlar: Record<string, HedefDurumu>): GorselDurumu {
  const hazir = hedefler.filter((h) => durumlar[h] === "hazir");
  const hata = hedefler.filter((h) => durumlar[h] === "hata").length;
  return { hazir, hata, toplam: hedefler.length, bitti: hazir.length + hata === hedefler.length };
}

export async function gorselIsiBaslat(d: Pick<GorselDeps, "store">, hesapId: string, def: GameDefinition, harcama: Harcama, now = Date.now()) {
  const isId = randomUUID();
  const hedefler = gorselIstemleri(def);
  await d.store.olustur({ isId, sahip: hesapId, olusturma: now, harcama, hedefler }, IS_TTL_MS);
  return { isId, hedefler: hedefler.map((h) => h.hedef) };
}

// Kredi kararı: tek sefer (sonuclandir). Tamamla/iade kendi içinde hata yutar; iade edilemeyen askı zaten süre sonunda
// kendiliğinden iade edilir.
async function krediyiKararlastir(d: GorselDeps, isId: string, sahip: string, harcama: Harcama, durum: GorselDurumu) {
  if (!durum.bitti || !(await d.store.sonuclandir(isId, IS_TTL_MS))) return;
  if (durum.hazir.length > 0) await krediTamamla(sahip, harcama);
  else await krediIade(sahip, harcama, "Görseller üretilemedi: kredi iadesi");
}

export async function gorselDurumu(d: GorselDeps, hesapId: string, isId: string): Promise<Sonuc<{ durum: GorselDurumu }>> {
  if (!GORSEL_IS_ID.test(isId)) return BULUNAMADI;
  const is = await d.store.get(isId);
  if (!is || is.sahip !== hesapId) return BULUNAMADI;
  return { ok: true, durum: ozet(is.hedefler.map((h) => h.hedef), await d.store.durumlar(isId)) };
}

// Sıradaki bekleyen görseli üretir. Hepsi sahiplenilmişse yalnız durumu döner.
export async function gorselUret(d: GorselDeps, hesapId: string, isId: string, now = Date.now()): Promise<Sonuc<{ hedef: string | null; durum: GorselDurumu }>> {
  if (!GORSEL_IS_ID.test(isId)) return BULUNAMADI;
  const is = await d.store.get(isId);
  if (!is || is.sahip !== hesapId) return BULUNAMADI;
  const hedefler = is.hedefler.map((h) => h.hedef);

  // Süresi geçen işte bekleyen hedefler üretilmez (kredisi askıdan kendiliğinden iade edilmiş olabilir).
  const hedef = now - is.olusturma > GORSEL_SURESI_MS ? null : await d.store.sahiplen(isId, hedefler, now, BAYAT_MS);
  if (hedef) {
    let url: string | null = null;
    let zamanlayici: ReturnType<typeof setTimeout> | undefined;
    try {
      // Süre aşılırsa hedef hata olarak kapanır (işlev route sınırında kesilmeden); geç biten üretim yok sayılır.
      const sure = new Promise<never>((_, red) => {
        zamanlayici = setTimeout(() => red(new GorselHatasi("zaman", "üretim süresi aşıldı")), URETIM_SURESI_MS);
      });
      url = await Promise.race([d.uret(isId, hedef, is.hedefler.find((h) => h.hedef === hedef)!.istem), sure]);
    } catch (err) {
      // İstem ve görsel loglanmaz; yalnız neden.
      console.error(`[gorsel] ${hedef} üretilemedi: ${err instanceof GorselHatasi ? err.neden : "beklenmeyen"}`, err instanceof Error ? err.message : err);
    } finally {
      clearTimeout(zamanlayici);
    }
    await d.store.bitir(isId, hedef, url);
  } else if (now - is.olusturma > GORSEL_SURESI_MS) {
    // Başlatılmamış hedefler hata sayılır: iş kapanır, kredi kararlaştırılır.
    const durumlar = await d.store.durumlar(isId);
    for (const h of hedefler) if (durumlar[h] === "bekliyor") await d.store.bitir(isId, h, null);
  }
  const durum = ozet(hedefler, await d.store.durumlar(isId));
  await krediyiKararlastir(d, isId, is.sahip, is.harcama, durum);
  return { ok: true, hedef, durum };
}

// Oyundaki görselin depo adresi (oturum gerekmez: oyunu oynayan öğrenci görür; kimlik tahmin edilemez).
export async function gorselDosyasi(d: Pick<GorselDeps, "store">, isId: string, hedef: string): Promise<string | null> {
  if (!GORSEL_IS_ID.test(isId) || !GORSEL_HEDEF.test(hedef)) return null;
  return d.store.dosya(isId, hedef);
}

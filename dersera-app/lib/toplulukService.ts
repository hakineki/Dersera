import { createHash, randomUUID } from "crypto";
import { PROGRAM_DERS_ADI, PROGRAM_DERSLERI } from "@/data/mufredat/programlar";
import type { GameDefinition } from "@/lib/composer/definition";
import { duzenlemeBaglami } from "@/lib/composer/duzenleme";
import { ALANLAR, DENEYIMLER, type DersKonu } from "@/lib/composer/input";
import { checkLimit } from "@/lib/composer/rateLimit";
import { GAME_RETENTION_MS } from "@/lib/gamesStore";
import { filtredenGecer, TOPLULUK_SAYFA, type ToplulukFiltresi, type ToplulukKaydi, type ToplulukOzeti } from "@/lib/topluluk";
import { getToplulukStore, type ToplulukStore } from "@/lib/toplulukStore";

const BASLIK_MAX = 120;
// Bir hesap günde en çok bu kadar yeni topluluk kaydı açabilir (listeyi doldurmaya karşı).
export const GUNLUK_TOPLULUK_KAYDI = 20;
const GUN = 24 * 60 * 60 * 1000;

const icerikOzetiOf = (definition: GameDefinition) => createHash("sha256").update(JSON.stringify(definition)).digest("hex");

export interface EklemeSecenekleri {
  // Aynı kaynaktan (ör. hesap + kütüphane kaydı) gelen yeni sürüm eskisini pasife alır.
  kaynak?: string;
  now?: number;
}

// Yayın anında: oyun topluluk kütüphanesine eklenir (aynı içerik ikinci kez eklenmez) ve oyun kodu kayda bağlanır
// (öğrenci katıldıkça oynanma sayısı artsın). Yalnız öğretmen hesabıyla yapılan yayınlar eklenir.
export async function topluluguEkle(
  store: ToplulukStore,
  definition: GameDefinition,
  dersler: DersKonu[],
  olusturan: string,
  kod: string,
  expiresAt: number,
  { kaynak, now = Date.now() }: EklemeSecenekleri = {}
): Promise<string> {
  const icerikOzeti = icerikOzetiOf(definition);
  const m = definition.meta;
  const kayit: ToplulukKaydi = {
    oyun_id: randomUUID(),
    baslik: m.baslik.slice(0, BASLIK_MAX),
    ders: m.ders,
    konu: m.konu,
    sinif: m.sinif,
    sure_dk: m.sure_dk,
    alan: m.alan,
    deneyim: m.deneyim,
    olusturan,
    yayin_tarihi: now,
    puan_ortalama: null,
    puan_sayisi: 0,
    aktif: true,
    definition,
    dersler,
  };
  const id = await store.ekle(kayit, icerikOzeti);
  await store.kodBagla(kod, id, expiresAt + GAME_RETENTION_MS - now);
  if (kaynak) await surumuGuncelle(store, kaynak, id, id === kayit.oyun_id ? kayit : await store.get(id), olusturan);
  return id;
}

// Aynı kaynaktan (hesap + kütüphane kaydı) gelen yeni sürüm eskisini pasife alır. Yalnız KENDİ kayıtlarına dokunur:
// içerik başka bir öğretmenin kaydıyla aynıysa (kopya) kaynak bağlanmaz ve onun kaydı pasifleştirilmez.
async function surumuGuncelle(store: ToplulukStore, kaynak: string, id: string, kayit: ToplulukKaydi | null, olusturan: string) {
  if (!kayit || kayit.olusturan !== olusturan) return;
  // Eski bir sürüme geri dönüldüyse o sürüm yeniden listelenir.
  if (!kayit.aktif) await store.etkinlestir(id);
  const onceki = await store.kaynakGuncelle(kaynak, id);
  if (!onceki || onceki === id) return;
  const eski = await store.get(onceki);
  if (eski && eski.olusturan === olusturan) await store.pasiflestir(onceki);
}

// Yayının yan etkisi: hata olursa yayın yine başarılı sayılır, yalnız loglanır. Oturumsuz (anonim) yayın eklenmez.
export async function topluluguEkleGuvenli(
  definition: GameDefinition,
  dersler: DersKonu[],
  olusturan: string | null,
  kod: string,
  expiresAt: number,
  secenekler: EklemeSecenekleri = {}
): Promise<void> {
  if (!olusturan) return;
  try {
    const store = getToplulukStore();
    // Sınır yalnız YENİ kayıt açılacaksa sayılır; var olan oyunun yeni sınıf yayını her zaman koda bağlanır.
    const yeni = (await store.icerikId(icerikOzetiOf(definition))) === null;
    if (yeni && !(await checkLimit(`dersera:topluluk:hesap:${olusturan}`, GUN, GUNLUK_TOPLULUK_KAYDI))) {
      console.warn("[topluluk] günlük kayıt sınırı dolu; oyun yayınlandı ama topluluğa eklenmedi");
      return;
    }
    await topluluguEkle(store, definition, dersler, olusturan, kod, expiresAt, secenekler);
  } catch (err) {
    console.error("[topluluk] kayıt eklenemedi", err instanceof Error ? err.message : err);
  }
}

const SIRA_TARAMA = 50;
export const EN_COK_TARAMA = 500;

export type ListeSorgusu = { ok: true; filtre: ToplulukFiltresi; imlec: number | null; limit: number } | { ok: false; error: string };

// ?ders=fizik&sinif=10&alan=okul&deneyim=macera&q=...&limit=20&cursor=...
export function listeSorgusu(params: URLSearchParams): ListeSorgusu {
  const filtre: ToplulukFiltresi = {};
  const ders = params.get("ders");
  if (ders) {
    if (!(PROGRAM_DERSLERI as readonly string[]).includes(ders)) return { ok: false, error: "Geçersiz ders" };
    filtre.ders = PROGRAM_DERS_ADI[ders as keyof typeof PROGRAM_DERS_ADI];
  }
  const sinif = params.get("sinif");
  if (sinif) {
    if (!["9", "10", "11", "12"].includes(sinif)) return { ok: false, error: "Geçersiz sınıf" };
    filtre.sinif = Number(sinif);
  }
  const alan = params.get("alan");
  if (alan) {
    if (!(ALANLAR as readonly string[]).includes(alan)) return { ok: false, error: "Geçersiz alan" };
    filtre.alan = alan as ToplulukFiltresi["alan"];
  }
  const deneyim = params.get("deneyim");
  if (deneyim) {
    if (!(DENEYIMLER as readonly string[]).includes(deneyim)) return { ok: false, error: "Geçersiz deneyim" };
    filtre.deneyim = deneyim as ToplulukFiltresi["deneyim"];
  }
  const q = params.get("q")?.trim();
  if (q) {
    if (q.length > 100) return { ok: false, error: "Arama çok uzun" };
    filtre.q = q;
  }
  const limitRaw = params.get("limit");
  const limit = limitRaw === null ? TOPLULUK_SAYFA : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > TOPLULUK_SAYFA) return { ok: false, error: "Geçersiz limit" };
  const cursor = params.get("cursor");
  if (cursor !== null && !/^\d+(\.\d+)?$/.test(cursor)) return { ok: false, error: "Geçersiz imleç" };
  return { ok: true, filtre, imlec: cursor === null ? null : Number(cursor), limit };
}

// Yayın tarihine göre azalan sıra; filtre bellekte uygulanır. Tek istekte en çok EN_COK_TARAMA kayıt taranır;
// sayfa dolmadan tarama sınırı biterse imleç kaldığı yeri gösterir (istemci "daha fazla" ile devam eder).
export async function listele(
  store: ToplulukStore,
  filtre: ToplulukFiltresi,
  imlec: number | null,
  limit: number
): Promise<{ oyunlar: ToplulukOzeti[]; sonraki: string | null }> {
  const oyunlar: ToplulukOzeti[] = [];
  let konum = imlec;
  let taranan = 0;
  while (oyunlar.length < limit && taranan < EN_COK_TARAMA) {
    const ogeler = await store.sirali(konum, SIRA_TARAMA);
    if (ogeler.length === 0) return { oyunlar, sonraki: null };
    for (const oge of ogeler) {
      taranan++;
      konum = oge.skor;
      if (oge.ozet && filtredenGecer(oge.ozet, filtre)) oyunlar.push(oge.ozet);
      if (oyunlar.length === limit) break;
    }
    // Sıralı kümede bu partiden sonra kayıt yoksa (ham yanıt eksikse) liste bitmiştir.
    if (ogeler.length < SIRA_TARAMA && oyunlar.length < limit) return { oyunlar, sonraki: null };
  }
  return { oyunlar, sonraki: konum === null ? null : String(konum) };
}

// "Oyunu Kullan": düzenleyicinin ihtiyaç duyduğu tam oyun ve bağlam. Oluşturan bilgisi dışarı verilmez.
export function kullanimDetayi(kayit: ToplulukKaydi) {
  const { olusturan: _gizli, definition, dersler, ...ozet } = kayit;
  void _gizli;
  return { oyun: { ...ozet, definition, dersler }, ...duzenlemeBaglami(kayit.sinif, dersler, definition) };
}

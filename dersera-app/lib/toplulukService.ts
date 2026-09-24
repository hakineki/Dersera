import { createHash, randomUUID } from "crypto";
import { PROGRAM_DERS_ADI, PROGRAM_DERSLERI } from "@/data/mufredat/programlar";
import type { GameDefinition } from "@/lib/composer/definition";
import { ALANLAR, DENEYIMLER, type DersKonu } from "@/lib/composer/input";
import { GAME_RETENTION_MS } from "@/lib/gamesStore";
import { duzenlemeBaglami } from "@/lib/libraryService";
import { filtredenGecer, TOPLULUK_SAYFA, type ToplulukFiltresi, type ToplulukKaydi, type ToplulukOzeti } from "@/lib/topluluk";
import { getToplulukStore, type ToplulukStore } from "@/lib/toplulukStore";

// Yayın anında: oyun topluluk kütüphanesine eklenir (aynı içerik ikinci kez eklenmez) ve oyun kodu kayda bağlanır
// (öğrenci katıldıkça oynanma sayısı artsın). Hata yayını bozmaz; çağıran yakalar.
export async function topluluguEkle(
  store: ToplulukStore,
  definition: GameDefinition,
  dersler: DersKonu[],
  olusturan: string | null,
  kod: string,
  expiresAt: number,
  now = Date.now()
): Promise<string> {
  const icerikOzeti = createHash("sha256").update(JSON.stringify(definition)).digest("hex");
  const m = definition.meta;
  const kayit: ToplulukKaydi = {
    oyun_id: randomUUID(),
    baslik: m.baslik,
    ders: m.ders,
    konu: m.konu,
    sinif: m.sinif,
    sure_dk: m.sure_dk,
    alan: m.alan,
    deneyim: m.deneyim,
    olusturan: olusturan ?? "anonim",
    yayin_tarihi: now,
    puan_ortalama: null,
    puan_sayisi: 0,
    aktif: true,
    definition,
    dersler,
  };
  const id = await store.ekle(kayit, icerikOzeti);
  await store.kodBagla(kod, id, expiresAt + GAME_RETENTION_MS - now);
  return id;
}

export async function oynanmaKaydet(store: ToplulukStore, kod: string): Promise<void> {
  const id = await store.kodunOyunu(kod);
  if (id) await store.oynanmaArtir(id);
}

// Katılımın yan etkisi: depo alınamasa ya da yazılamasa bile katılım bozulmaz.
export async function oynanmaKaydetGuvenli(kod: string): Promise<void> {
  try {
    await oynanmaKaydet(getToplulukStore(), kod);
  } catch (err) {
    console.error("[topluluk] oynanma sayılamadı", err instanceof Error ? err.message : err);
  }
}

const SIRA_TARAMA = 50;
const EN_COK_TARAMA = 500;

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
  const imlec = cursor === null ? null : Number(cursor);
  if (imlec !== null && !Number.isFinite(imlec)) return { ok: false, error: "Geçersiz imleç" };
  return { ok: true, filtre, imlec, limit };
}

// Yayın tarihine göre azalan sıra; filtre bellekte uygulanır. Tek istekte en çok EN_COK_TARAMA kayıt taranır;
// sayfa dolmadan tarama biterse imleç kaldığı yeri gösterir (istemci "daha fazla" ile devam eder).
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
    const { ozetler, skorlar } = await store.sirali(konum, SIRA_TARAMA);
    if (ozetler.length === 0) return { oyunlar, sonraki: null };
    for (let i = 0; i < ozetler.length; i++) {
      taranan++;
      konum = skorlar[i];
      if (filtredenGecer(ozetler[i], filtre)) oyunlar.push(ozetler[i]);
      if (oyunlar.length === limit) break;
    }
    if (ozetler.length < SIRA_TARAMA && oyunlar.length < limit) return { oyunlar, sonraki: null };
  }
  return { oyunlar, sonraki: konum === null ? null : String(konum) };
}

// "Oyunu Kullan": düzenleyicinin ihtiyaç duyduğu tam oyun ve bağlam. Oluşturan bilgisi dışarı verilmez.
export function kullanimDetayi(kayit: ToplulukKaydi) {
  const { olusturan: _gizli, definition, dersler, ...ozet } = kayit;
  void _gizli;
  return { oyun: { ...ozet, definition, dersler }, ...duzenlemeBaglami(kayit.sinif, dersler, definition) };
}

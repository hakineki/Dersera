import { createHash, randomUUID } from "crypto";
import { getUnite, PROGRAM_DERS_ADI, PROGRAM_DERSLERI, SINIFLAR } from "@/data/mufredat/programlar";
import type { GameDefinition } from "@/lib/composer/definition";
import { duzenlemeBaglami } from "@/lib/composer/duzenleme";
import { ALANLAR, DENEYIMLER, type DersKonu } from "@/lib/composer/input";
import { GAME_RETENTION_MS } from "@/lib/gamesStore";
import {
  benzerlikPuani,
  BENZER_EN_COK,
  filtredenGecer,
  SIRALAMALAR,
  siralamaKarsilastir,
  TOPLULUK_SAYFA,
  type Siralama,
  type ToplulukFiltresi,
  type ToplulukKaydi,
  type ToplulukOzeti,
} from "@/lib/topluluk";
import { getToplulukStore, type ToplulukStore } from "@/lib/toplulukStore";
import { ozetEngelli } from "@/lib/composer/yonetisim";
import { gorselsiz } from "@/lib/gorsel";

const BASLIK_MAX = 120;

// Görseller hariç: yayındaki görselli oyun topluluk kaydıyla eşleşir; yalnız görsel eklemek yeni içerik sayılmaz.
export const icerikOzetiOf = (definition: GameDefinition) => createHash("sha256").update(JSON.stringify(gorselsiz(definition))).digest("hex");

// Topluluğa gönderilen oyunun kaydı; özet alanları tanımdan gelir.
export function yeniToplulukKaydi(
  definition: GameDefinition,
  dersler: DersKonu[],
  olusturan: string,
  now: number,
  ek: Pick<ToplulukKaydi, "durum" | "aktif" | "kaynak" | "onceki_id" | "onaysiz">
): ToplulukKaydi {
  const m = definition.meta;
  return {
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
    gonderim_tarihi: now,
    puan_ortalama: null,
    puan_sayisi: 0,
    definition,
    dersler,
    ...ek,
  };
}

// Yayının yan etkisi: oyun toplulukta zaten varsa (aynı içerik) oyun kodu o kayda bağlanır, böylece sınıf yayınları
// ve "Oyunu Kullan" kopyaları topluluk kaydının oynanma/puan sayısına katkı verir. Topluluğa ekleme yalnız öğretmenin
// "Toplulukta paylaş" gönderimi ve iki öğretmen incelemesiyle olur. Hata yayını bozmaz.
// yayinlayan: yayını yapan öğretmen; bitiren öğrenciler onun öğretmen puanı uygunluğuna sayılır.
export async function toplulukKodunuBagla(definition: GameDefinition, kod: string, expiresAt: number, now = Date.now(), yayinlayan: string | null = null): Promise<void> {
  try {
    const store = getToplulukStore();
    const id = await store.icerikId(icerikOzetiOf(definition));
    if (!id) return;
    const ttl = expiresAt + GAME_RETENTION_MS - now;
    await store.kodBagla(kod, id, ttl);
    if (yayinlayan) await store.kodYayinlayanBagla(kod, yayinlayan, ttl);
  } catch (err) {
    console.error("[topluluk] kod bağlanamadı", err instanceof Error ? err.message : err);
  }
}

const SIRA_TARAMA = 50;
export const EN_COK_TARAMA = 500;

// imlec: en yeni sırada yayın skoru; diğer sıralamalarda sayfanın başlangıç sırası ("o40").
export type ListeSorgusu = { ok: true; filtre: ToplulukFiltresi; siralama: Siralama; imlec: number | null; limit: number } | { ok: false; error: string };

// ?ders=fizik&sinif=10&konu=100&alan=okul&deneyim=macera&q=...&sirala=oynanan&limit=20&cursor=...
export function listeSorgusu(params: URLSearchParams): ListeSorgusu {
  const filtre: ToplulukFiltresi = {};
  const ders = params.get("ders");
  if (ders) {
    if (!(PROGRAM_DERSLERI as readonly string[]).includes(ders)) return { ok: false, error: "Geçersiz ders" };
    filtre.ders = PROGRAM_DERS_ADI[ders as keyof typeof PROGRAM_DERS_ADI];
  }
  const sinif = params.get("sinif");
  if (sinif) {
    if (!SINIFLAR.map(String).includes(sinif)) return { ok: false, error: "Geçersiz sınıf" };
    filtre.sinif = Number(sinif);
  }
  // Ünite araması ders ve sınıfla birlikte; ünite o sınıfın programında olmalı.
  const konu = params.get("konu");
  if (konu) {
    if (!ders || !sinif || !getUnite(Number(sinif), ders, konu)) return { ok: false, error: "Geçersiz ünite" };
    filtre.konu = `${ders}:${konu}`;
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
  const sirala = params.get("sirala") ?? "yeni";
  if (!(SIRALAMALAR as readonly string[]).includes(sirala)) return { ok: false, error: "Geçersiz sıralama" };
  const siralama = sirala as Siralama;
  const cursor = params.get("cursor");
  const imlecDeseni = siralama === "yeni" ? /^\d+(\.\d+)?$/ : /^o\d{1,4}$/;
  if (cursor !== null && !imlecDeseni.test(cursor)) return { ok: false, error: "Geçersiz imleç" };
  return { ok: true, filtre, siralama, imlec: cursor === null ? null : Number(cursor.replace(/^o/, "")), limit };
}

// Listede gösterilebilir mi: filtre ve (yönetişimden önce eklenmiş kayıtlar için savunma) engelli başlık/konu.
const listelenir = (o: ToplulukOzeti | null, filtre: ToplulukFiltresi): o is ToplulukOzeti => !!o && filtredenGecer(o, filtre) && !ozetEngelli(o);

// En yeni EN_COK_TARAMA yayındaki oyunun özetleri (sıralama ve benzer oyunlar bu pencerede çalışır).
async function sonYayinlar(store: ToplulukStore): Promise<ToplulukOzeti[]> {
  const out: ToplulukOzeti[] = [];
  let konum: number | null = null;
  while (out.length < EN_COK_TARAMA) {
    const ogeler = await store.sirali(konum, Math.min(SIRA_TARAMA, EN_COK_TARAMA - out.length));
    for (const oge of ogeler) if (oge.ozet) out.push(oge.ozet);
    if (ogeler.length < SIRA_TARAMA) break;
    konum = ogeler[ogeler.length - 1].skor;
  }
  return out;
}

export async function listele(
  store: ToplulukStore,
  filtre: ToplulukFiltresi,
  imlec: number | null,
  limit: number,
  siralama: Siralama = "yeni"
): Promise<{ oyunlar: ToplulukOzeti[]; sonraki: string | null }> {
  if (siralama === "yeni") return enYeniler(store, filtre, imlec, limit);
  // Diğer sıralamalar: en yeni EN_COK_TARAMA oyun filtrelenip bellekte sıralanır; imleç sayfanın başlangıç sırasıdır.
  const bas = imlec ?? 0;
  const uygun = (await sonYayinlar(store)).filter((o) => listelenir(o, filtre)).sort(siralamaKarsilastir(siralama));
  return { oyunlar: uygun.slice(bas, bas + limit), sonraki: bas + limit < uygun.length ? `o${bas + limit}` : null };
}

// Yayın tarihine göre azalan sıra; filtre bellekte uygulanır. Tek istekte en çok EN_COK_TARAMA kayıt taranır;
// sayfa dolmadan tarama sınırı biterse imleç kaldığı yeri gösterir (istemci "daha fazla" ile devam eder).
async function enYeniler(store: ToplulukStore, filtre: ToplulukFiltresi, imlec: number | null, limit: number): Promise<{ oyunlar: ToplulukOzeti[]; sonraki: string | null }> {
  const oyunlar: ToplulukOzeti[] = [];
  let konum = imlec;
  let taranan = 0;
  while (oyunlar.length < limit && taranan < EN_COK_TARAMA) {
    const ogeler = await store.sirali(konum, SIRA_TARAMA);
    if (ogeler.length === 0) return { oyunlar, sonraki: null };
    for (const oge of ogeler) {
      taranan++;
      konum = oge.skor;
      if (listelenir(oge.ozet, filtre)) oyunlar.push(oge.ozet);
      if (oyunlar.length === limit) break;
    }
    // Sıralı kümede bu partiden sonra kayıt yoksa (ham yanıt eksikse) liste bitmiştir.
    if (ogeler.length < SIRA_TARAMA && oyunlar.length < limit) return { oyunlar, sonraki: null };
  }
  return { oyunlar, sonraki: konum === null ? null : String(konum) };
}

// Oyun kartındaki "Benzer oyunlar": aynı sınıf ve ortak ünite, en yeni EN_COK_TARAMA yayın içinde; oyun yayında
// değilse null.
export async function benzerOyunOnerileri(store: ToplulukStore, id: string): Promise<ToplulukOzeti[] | null> {
  const [oyun] = await store.ozetleriOku([id]);
  if (!listelenir(oyun, {})) return null;
  return (await sonYayinlar(store))
    .filter((o) => listelenir(o, {}))
    .map((o) => ({ o, puan: benzerlikPuani(oyun, o) }))
    .filter((x): x is { o: ToplulukOzeti; puan: number } => x.puan !== null)
    .sort((a, b) => b.puan - a.puan || b.o.oynanma_sayisi - a.o.oynanma_sayisi)
    .slice(0, BENZER_EN_COK)
    .map((x) => x.o);
}

// "Oyunu Kullan": düzenleyicinin ihtiyaç duyduğu tam oyun ve bağlam. Oluşturan bilgisi dışarı verilmez.
export function kullanimDetayi(kayit: ToplulukKaydi) {
  // Gizli (olusturan, kaynak, onceki_id) ve iç durum alanları dışarı verilmez.
  const { olusturan: _o, kaynak: _k, onceki_id: _oi, durum: _d, gonderim_tarihi: _g, puan_ortalama: _p, puan_sayisi: _s, definition, dersler, ...ozet } = kayit;
  void [_o, _k, _oi, _d, _g, _p, _s];
  return { oyun: { ...ozet, definition, dersler }, ...duzenlemeBaglami(kayit.sinif, dersler, definition) };
}

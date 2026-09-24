import { parseComposerDefinition, parseComposerPublish } from "@/lib/composer/adapter";
import { toplulukKodunuBagla } from "@/lib/toplulukService";
import { kodKaynagaBagla } from "@/lib/istatistikService";
import { duzenlemeBaglami } from "@/lib/composer/duzenleme";
import { MAX_DURATION_MIN, MIN_DURATION_MIN, type PublicGame } from "@/lib/games";
import { hashToken, publishGame } from "@/lib/gamesService";
import { kutuphaneSahibi } from "@/lib/auth";
import { istekHesabi } from "@/lib/authRequest";
import type { GamesStore } from "@/lib/gamesStore";
import { isKutuphaneAnahtari, kayitOlustur, KUTUPHANE_HEADER, KUTUPHANE_LIMIT, type KutuphaneKaydi } from "@/lib/library";
import type { LibraryStore } from "@/lib/libraryStore";
import type { ValidationResult } from "@/lib/composer/validator";
import type { YonetisimSonucu } from "@/lib/composer/yonetisim";
import { IZ_SURUMU, parmakizi, surumKarari, type Parmakizi } from "@/lib/surum";

// Eski (hesap öncesi) kütüphaneler tarayıcı anahtarının özetine bağlıydı; yalnız hesaba taşımada kullanılır.
export const eskiSahipOf = (anahtar: string) => hashToken(anahtar);

// Kütüphanenin sahibi oturumdaki öğretmen hesabıdır.
export async function istekSahibi(req: Request): Promise<string | null> {
  const hesap = await istekHesabi(req);
  return hesap ? kutuphaneSahibi(hesap) : null;
}

function yeniId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
}

// Düzenleme kaydının sürüm sonucu: aynı içerik, aynı oyunun yeni sürümü ya da yeni varyant.
export type SurumBilgisi = { tur: "ayni" | "surum" | "varyant"; surum: number; oran: number; neden?: "oran" | "kimlik" };

export type KayitSonucu =
  | { ok: true; id: string; validation: ValidationResult; surum?: SurumBilgisi }
  | { ok: false; status: number; error: string };

// Öğretmenin "Kütüphaneye kaydet" isteği. Doğrulamadan geçmeyen oyun da saklanır; yayın ayrıca doğrular.
export async function kutuphaneyeEkle(store: LibraryStore, sahip: string, body: unknown, now = Date.now()): Promise<KayitSonucu> {
  const b = body as { definition?: unknown; dersler?: unknown } | null;
  const r = parseComposerDefinition(b?.definition, b?.dersler);
  if (!r.ok) return r;
  if ((await store.count(sahip)) >= KUTUPHANE_LIMIT) {
    return { ok: false, status: 409, error: `Kütüphane dolu (en fazla ${KUTUPHANE_LIMIT} oyun). Yer açmak için eski bir oyunu silin.` };
  }
  const kayit: KutuphaneKaydi = { ...kayitOlustur(yeniId(), r.definition, r.dersler, null, now), surum: 1, taban: parmakizi(r.definition) };
  kayit.soy_id = kayit.id;
  await store.put(sahip, kayit);
  return { ok: true, id: kayit.id, validation: r.validation };
}

const BULUNAMADI = { ok: false as const, status: 404, error: "Oyun kütüphanede bulunamadı" };
const CATISMA = { ok: false as const, status: 409, error: "Bu oyun başka bir sekmede ya da cihazda daha yeni bir sürümle kaydedilmiş. Kütüphaneden yeniden açıp tekrar dene." };

// Düzenlenen tanım aynı kayda yazılır. Ders/konu değiştirilemez (kayıtlı dersler ile eşleşmeli).
export async function kutuphaneKaydiniGuncelle(store: LibraryStore, sahip: string, id: string, body: unknown, now = Date.now()): Promise<KayitSonucu> {
  const kayit = await store.get(sahip, id);
  if (!kayit) return { ok: false, status: 404, error: "Oyun kütüphanede bulunamadı" };
  const r = parseComposerDefinition((body as { definition?: unknown } | null)?.definition, kayit.dersler);
  if (!r.ok) return r;
  const soy = kayit.soy_id ?? kayit.id;
  const surum = kayit.surum ?? 1;
  // İstemci düzenlediği sürümü gönderir: başka sekmede kaydedilmiş daha yeni sürümü ezmez.
  const istenen = (body as { surum?: unknown } | null)?.surum;
  const beklenen = Number.isInteger(istenen) ? (istenen as number) : surum;
  if (beklenen !== surum) return CATISMA;
  // Taban yoksa ya da eski biçimdeyse mevcut tanımdan yeniden hesaplanır (yanlış yorumlanmaz).
  const taban: Parmakizi = kayit.taban?.v === IZ_SURUMU ? (kayit.taban as Parmakizi) : parmakizi(kayit.definition);
  const karar = surumKarari(kayit.definition, r.definition, taban);
  if (karar.tur === "ayni") {
    // İçerik değişmedi: kayıt yerinde tutulur (bu arada silindiyse geri getirilmez, 404).
    const y = await store.replaceIfSurum(sahip, kayit, surum);
    if (y !== "ok") return y === "yok" ? BULUNAMADI : CATISMA;
    return { ok: true, id, validation: r.validation, surum: { tur: "ayni", surum, oran: 0 } };
  }

  // Anlamlı içeriğin %30'undan fazlası ya da oyunun kimliği değiştiyse: yeni varyant, özgün oyun yerinde kalır.
  if (karar.tur === "varyant") {
    if ((await store.count(sahip)) >= KUTUPHANE_LIMIT) {
      return { ok: false, status: 409, error: `Bu değişiklik yeni bir varyant oluşturuyor ama kütüphane dolu (en fazla ${KUTUPHANE_LIMIT} oyun). Yer açmak için eski bir oyunu silin.` };
    }
    const varyant: KutuphaneKaydi = {
      ...kayitOlustur(yeniId(), r.definition, kayit.dersler, null, now),
      soy_id: soy,
      surum: 1,
      turetildigi: { id: kayit.id, baslik: kayit.baslik },
      taban: parmakizi(r.definition),
    };
    await store.put(sahip, varyant);
    return { ok: true, id: varyant.id, validation: r.validation, surum: { tur: "varyant", surum: 1, oran: karar.oran, neden: karar.neden } };
  }

  const guncel: KutuphaneKaydi = {
    ...kayitOlustur(id, r.definition, kayit.dersler, kayit.sonKod, kayit.createdAt),
    sonYayin: kayit.sonYayin,
    soy_id: soy,
    surum: surum + 1,
    turetildigi: kayit.turetildigi ?? null,
    taban,
  };
  const y = await store.replaceIfSurum(sahip, guncel, surum);
  if (y !== "ok") return y === "yok" ? BULUNAMADI : CATISMA;
  return { ok: true, id, validation: r.validation, surum: { tur: "surum", surum: surum + 1, oran: karar.oran } };
}

// Düzenleyicinin ihtiyaç duyduğu bağlam: öğrenme çıktıları ve güncel doğrulama. Müfredat verisi sunucuda kalır.
export function kayitDetayi(kayit: KutuphaneKaydi) {
  // Sürüm tabanı iç izdir; istemciye verilmez.
  const { taban: _t, ...oyun } = kayit;
  void _t;
  return { oyun, ...duzenlemeBaglami(kayit.sinif, kayit.dersler, kayit.definition) };
}

export type YenidenYayinSonucu =
  | { ok: true; game: PublicGame; adminToken: string; yonetisim: YonetisimSonucu }
  | { ok: false; status: number; error: string; validation?: ValidationResult; yonetisim?: YonetisimSonucu };

export function parseSure(v: unknown): number | null | undefined {
  if (v === undefined || v === null) return undefined;
  return Number.isInteger(v) && (v as number) >= MIN_DURATION_MIN && (v as number) <= MAX_DURATION_MIN ? (v as number) : null;
}

// Kayıtlı oyunu yeni kodla yayınlar. Anthropic çağrısı yoktur; tanım yayın öncesi müfredata göre yeniden doğrulanır.
export async function yenidenYayinla(
  library: LibraryStore,
  games: GamesStore,
  sahip: string,
  id: string,
  sure: number | undefined,
  now = Date.now()
): Promise<YenidenYayinSonucu> {
  const kayit = await library.get(sahip, id);
  if (!kayit) return { ok: false, status: 404, error: "Oyun kütüphanede bulunamadı" };
  const composed = parseComposerPublish({ composer: { definition: kayit.definition, dersler: kayit.dersler } });
  if (!composed.ok) return composed;
  const published = await publishGame(games, { ...composed.request, durationMinutes: sure ?? composed.request.durationMinutes }, now);
  if (!published) return { ok: false, status: 503, error: "Benzersiz oyun kodu üretilemedi" };
  // Yayın sırasında gelen bir düzenleme ezilmesin: kaydın en güncel hâli okunup yalnız son kod/tarih yazılır.
  const guncel = (await library.get(sahip, id)) ?? kayit;
  await library.replace(sahip, { ...guncel, sonKod: published.game.code, sonYayin: now });
  await kodKaynagaBagla(published.game.code, `${sahip}:${id}`, published.game.expiresAt, now);
  await toplulukKodunuBagla(composed.request.definition!, published.game.code, published.game.expiresAt, now);
  return { ok: true, ...published, yonetisim: composed.yonetisim };
}

export function anahtarOf(req: Request): string | null {
  const v = req.headers.get(KUTUPHANE_HEADER);
  return isKutuphaneAnahtari(v) ? v : null;
}

// Tarayıcı anahtarına bağlı eski kütüphaneyi hesaba taşır. Hesap kütüphanesi dolarsa kalanlar eski yerinde bekler.
export async function kutuphaneyiTasi(store: LibraryStore, eskiSahip: string, yeniSahip: string): Promise<{ tasinan: number; kalan: number }> {
  const eskiler = (await store.list(eskiSahip)).sort((a, b) => b.createdAt - a.createdAt);
  let yer = KUTUPHANE_LIMIT - (await store.count(yeniSahip));
  let tasinan = 0;
  for (const kayit of eskiler) {
    if (yer <= 0) break;
    await store.put(yeniSahip, kayit);
    await store.remove(eskiSahip, kayit.id);
    tasinan++;
    yer--;
  }
  return { tasinan, kalan: eskiler.length - tasinan };
}

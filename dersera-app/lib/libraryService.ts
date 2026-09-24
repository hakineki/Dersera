import { parseComposerDefinition, parseComposerPublish } from "@/lib/composer/adapter";
import { getToplulukStore } from "@/lib/toplulukStore";
import { topluluguEkle } from "@/lib/toplulukService";
import { describeKonular, resolveKonular } from "@/lib/composer/input";
import { MAX_DURATION_MIN, MIN_DURATION_MIN, type PublicGame } from "@/lib/games";
import { hashToken, publishGame } from "@/lib/gamesService";
import { kutuphaneSahibi } from "@/lib/auth";
import { istekHesabi } from "@/lib/authRequest";
import type { GamesStore } from "@/lib/gamesStore";
import { isKutuphaneAnahtari, kayitOlustur, KUTUPHANE_HEADER, KUTUPHANE_LIMIT, type KutuphaneKaydi } from "@/lib/library";
import type { LibraryStore } from "@/lib/libraryStore";
import type { ValidationResult } from "@/lib/composer/validator";

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

export type KayitSonucu =
  | { ok: true; id: string; validation: ValidationResult }
  | { ok: false; status: number; error: string };

// Öğretmenin "Kütüphaneye kaydet" isteği. Doğrulamadan geçmeyen oyun da saklanır; yayın ayrıca doğrular.
export async function kutuphaneyeEkle(store: LibraryStore, sahip: string, body: unknown, now = Date.now()): Promise<KayitSonucu> {
  const b = body as { definition?: unknown; dersler?: unknown } | null;
  const r = parseComposerDefinition(b?.definition, b?.dersler);
  if (!r.ok) return r;
  if ((await store.count(sahip)) >= KUTUPHANE_LIMIT) {
    return { ok: false, status: 409, error: `Kütüphane dolu (en fazla ${KUTUPHANE_LIMIT} oyun). Yer açmak için eski bir oyunu silin.` };
  }
  const kayit = kayitOlustur(yeniId(), r.definition, r.dersler, null, now);
  await store.put(sahip, kayit);
  return { ok: true, id: kayit.id, validation: r.validation };
}

// Düzenlenen tanım aynı kayda yazılır. Ders/konu değiştirilemez (kayıtlı dersler ile eşleşmeli).
export async function kutuphaneKaydiniGuncelle(store: LibraryStore, sahip: string, id: string, body: unknown): Promise<KayitSonucu> {
  const kayit = await store.get(sahip, id);
  if (!kayit) return { ok: false, status: 404, error: "Oyun kütüphanede bulunamadı" };
  const r = parseComposerDefinition((body as { definition?: unknown } | null)?.definition, kayit.dersler);
  if (!r.ok) return r;
  const guncel: KutuphaneKaydi = { ...kayitOlustur(id, r.definition, kayit.dersler, kayit.sonKod, kayit.createdAt), sonYayin: kayit.sonYayin };
  if (!(await store.replace(sahip, guncel))) return { ok: false, status: 404, error: "Oyun kütüphanede bulunamadı" };
  return { ok: true, id, validation: r.validation };
}

// Düzenleyicinin ihtiyaç duyduğu bağlam: öğrenme çıktıları ve güncel doğrulama. Müfredat verisi sunucuda kalır.
export function duzenlemeBaglami(sinif: number, dersler: KutuphaneKaydi["dersler"], definition: KutuphaneKaydi["definition"]) {
  const r = resolveKonular(sinif, dersler);
  const d = r.ok ? describeKonular(r.konular) : null;
  const dogrulama = parseComposerDefinition(definition, dersler);
  return {
    hedefler: d?.ogrenmeCiktilari ?? [],
    hedefDersleri: d?.hedefDersleri ?? {},
    validation: dogrulama.ok ? dogrulama.validation : null,
  };
}

export function kayitDetayi(kayit: KutuphaneKaydi) {
  return { oyun: kayit, ...duzenlemeBaglami(kayit.sinif, kayit.dersler, kayit.definition) };
}

export type YenidenYayinSonucu =
  | { ok: true; game: PublicGame; adminToken: string }
  | { ok: false; status: number; error: string; validation?: ValidationResult };

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
  await topluluguEkleGuvenli(guncel.definition, guncel.dersler, sahip, published.game.code, published.game.expiresAt);
  return { ok: true, ...published };
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

// Topluluk kaydı yayının yan etkisidir: hata olursa yayın yine başarılı sayılır, yalnız loglanır.
export async function topluluguEkleGuvenli(definition: KutuphaneKaydi["definition"], dersler: KutuphaneKaydi["dersler"], olusturan: string | null, kod: string, expiresAt: number) {
  try {
    await topluluguEkle(getToplulukStore(), definition, dersler, olusturan, kod, expiresAt);
  } catch (err) {
    console.error("[topluluk] kayıt eklenemedi", err instanceof Error ? err.message : err);
  }
}

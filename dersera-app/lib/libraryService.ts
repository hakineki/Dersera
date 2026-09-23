import type { GameDefinition } from "@/lib/composer/definition";
import type { DersKonu } from "@/lib/composer/input";
import { parseComposerPublish } from "@/lib/composer/adapter";
import { MAX_DURATION_MIN, MIN_DURATION_MIN, type PublicGame } from "@/lib/games";
import { hashToken, publishGame } from "@/lib/gamesService";
import type { GamesStore } from "@/lib/gamesStore";
import { isKutuphaneAnahtari, kayitOlustur, KUTUPHANE_HEADER, KUTUPHANE_LIMIT, type KutuphaneKaydi } from "@/lib/library";
import type { LibraryStore } from "@/lib/libraryStore";
import type { ValidationResult } from "@/lib/composer/validator";

export const sahipOf = (anahtar: string) => hashToken(anahtar);

function yeniId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
}

// Composer yayınından sonra oyunu kütüphaneye ekler. Kütüphane doluysa null döner; yayın yine geçerlidir.
export async function kutuphaneyeEkle(
  store: LibraryStore,
  anahtar: string,
  definition: GameDefinition,
  dersler: DersKonu[],
  kod: string,
  now = Date.now()
): Promise<string | null> {
  const sahip = await sahipOf(anahtar);
  if ((await store.count(sahip)) >= KUTUPHANE_LIMIT) return null;
  const kayit = kayitOlustur(yeniId(), definition, dersler, kod, now);
  await store.put(sahip, kayit);
  return kayit.id;
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
  anahtar: string,
  id: string,
  sure: number | undefined,
  now = Date.now()
): Promise<YenidenYayinSonucu> {
  const sahip = await sahipOf(anahtar);
  const kayit = await library.get(sahip, id);
  if (!kayit) return { ok: false, status: 404, error: "Oyun kütüphanede bulunamadı" };
  const composed = parseComposerPublish({ composer: { definition: kayit.definition, dersler: kayit.dersler } });
  if (!composed.ok) return composed;
  const published = await publishGame(games, { ...composed.request, durationMinutes: sure ?? composed.request.durationMinutes }, now);
  if (!published) return { ok: false, status: 503, error: "Benzersiz oyun kodu üretilemedi" };
  const guncel: KutuphaneKaydi = { ...kayit, sonKod: published.game.code, sonYayin: now };
  await library.put(sahip, guncel);
  return { ok: true, ...published };
}

export function anahtarOf(req: Request): string | null {
  const v = req.headers.get(KUTUPHANE_HEADER);
  return isKutuphaneAnahtari(v) ? v : null;
}

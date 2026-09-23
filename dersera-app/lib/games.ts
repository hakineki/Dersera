import { AYLAR, CORE_DERSLER, DERS_ADI, type Ders } from "@/data/mufredat";
import { GENEL_HIKAYE, HIKAYE, stops as templates, type Stop } from "@/data/stops";
import type { GameDefinition } from "@/lib/composer/definition";

export const QR_COUNT = 20;
export const MIN_DURATION_MIN = 5;
export const MAX_DURATION_MIN = 8 * 60;
export const DURATION_PRESETS_MIN = [30, 60, 120] as const;

export interface GameStop {
  qr: number;
  name: string;
  emoji: string;
  dersKey: Ders;
  hikaye: string;
}

// İstemciye giden oyun görünümü; yönetici anahtarının özeti asla bu tipte yer almaz.
export interface PublicGame {
  code: string;
  stops: GameStop[];
  aylar: string[];
  createdAt: number;
  expiresAt: number;
  endedAt: number | null;
  // Game Composer ile üretilmiş oyunlar sahne tanımını taşır; yoksa klasik soru bankası oyunudur.
  definition?: GameDefinition;
}

// Composer oyununun yayında açık kalacağı süre: oyun süresinin iki katı, en az bir saat.
export function publishWindowMinutes(sureDk: number): number {
  return Math.max(60, sureDk * 2);
}

export interface PublishRequest {
  durationMinutes: number;
  aylar: string[];
  stops: GameStop[];
  definition?: GameDefinition;
}

const CODE_PATTERN = /^([A-Z]{3})-?(\d{3})$/;

export function normalizeGameCode(input: string): string | null {
  const m = input.trim().toLocaleUpperCase("tr-TR").replace(/\s+/g, "").match(CODE_PATTERN);
  return m ? `${m[1]}-${m[2]}` : null;
}

export function isGameActive(game: Pick<PublicGame, "expiresAt" | "endedAt">, now = Date.now()): boolean {
  return game.endedAt === null && now < game.expiresAt;
}

export function remainingSeconds(game: Pick<PublicGame, "expiresAt" | "endedAt">, now = Date.now()): number {
  if (game.endedAt !== null) return 0;
  return Math.max(0, Math.ceil((game.expiresAt - now) / 1000));
}

export function formatRemaining(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function defaultGameStop(index: number): GameStop {
  const t = templates[index];
  if (t) return { qr: index + 1, name: t.name, emoji: t.emoji, dersKey: t.dersKey, hikaye: HIKAYE[t.id] ?? GENEL_HIKAYE };
  return {
    qr: index + 1,
    name: `Durak ${index + 1}`,
    emoji: "📍",
    dersKey: CORE_DERSLER[index % CORE_DERSLER.length],
    hikaye: GENEL_HIKAYE,
  };
}

export function parseQrParam(value: string | null): number | null {
  if (value === null || !/^\d{1,2}$/.test(value)) return null;
  const n = Number(value);
  return n >= 1 && n <= QR_COUNT ? n : null;
}

export function stopId(qr: number): string {
  return `qr-${qr}`;
}

export function nextClueFor(stops: GameStop[], index: number): string {
  const next = stops[index + 1];
  if (!next) return "🏆 Tüm durakları tamamladın! Gizem çözüldü.";
  return `🎉 Harika! Sıradaki durak: ${next.emoji} ${next.name}. Oradaki ${next.qr} numaralı QR kodu bul!`;
}

export function toStops(stops: GameStop[]): Stop[] {
  return stops.map((s, i) => ({
    id: stopId(s.qr),
    order: i + 1,
    name: s.name,
    emoji: s.emoji,
    subject: DERS_ADI[s.dersKey],
    dersKey: s.dersKey,
    nextStopId: stops[i + 1] ? stopId(stops[i + 1].qr) : null,
    nextClue: nextClueFor(stops, i),
    hikaye: s.hikaye,
  }));
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function shortText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 && t.length <= max ? t : null;
}

const AY_SLUGS = new Set<string>(AYLAR.map((a) => a.ay));

export function parsePublishRequest(body: unknown): PublishRequest | null {
  if (!isPlainObject(body)) return null;

  const { durationMinutes, aylar, stops } = body;
  if (
    !Number.isInteger(durationMinutes) ||
    (durationMinutes as number) < MIN_DURATION_MIN ||
    (durationMinutes as number) > MAX_DURATION_MIN
  ) {
    return null;
  }

  if (!Array.isArray(aylar) || aylar.length === 0 || aylar.length > AY_SLUGS.size) return null;
  if (!aylar.every((a) => typeof a === "string" && AY_SLUGS.has(a))) return null;
  if (new Set(aylar).size !== aylar.length) return null;

  if (!Array.isArray(stops) || stops.length === 0 || stops.length > QR_COUNT) return null;
  const parsed: GameStop[] = [];
  const usedQr = new Set<number>();
  for (const s of stops) {
    if (!isPlainObject(s)) return null;
    const qr = s.qr;
    if (!Number.isInteger(qr) || (qr as number) < 1 || (qr as number) > QR_COUNT || usedQr.has(qr as number)) {
      return null;
    }
    const name = shortText(s.name, 40);
    const emoji = shortText(s.emoji, 8);
    const hikaye = shortText(s.hikaye, 400);
    const dersKey = s.dersKey;
    if (!name || !emoji || !hikaye || typeof dersKey !== "string" || !Object.hasOwn(DERS_ADI, dersKey)) {
      return null;
    }
    usedQr.add(qr as number);
    parsed.push({ qr: qr as number, name, emoji, dersKey: dersKey as Ders, hikaye });
  }

  return { durationMinutes: durationMinutes as number, aylar: aylar as string[], stops: parsed };
}

export function isPublicGame(v: unknown): v is PublicGame {
  if (!isPlainObject(v)) return false;
  return (
    typeof v.code === "string" &&
    Array.isArray(v.stops) &&
    Array.isArray(v.aylar) &&
    typeof v.expiresAt === "number" &&
    (v.endedAt === null || typeof v.endedAt === "number")
  );
}

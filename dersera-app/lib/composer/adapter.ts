import { PROGRAM_DERS_ADI } from "@/data/mufredat/programlar";
import type { Ders } from "@/data/mufredat";
import { GameDefinitionSchema, type GameDefinition } from "@/lib/composer/definition";
import { revalidate } from "@/lib/composer/service";
import type { ValidationResult } from "@/lib/composer/validator";
import type { GameStop, PublishRequest } from "@/lib/games";

// Game Definition → mevcut oyun kaydı. Kod üretimi, katılım, sonuçlar ve süre mevcut sistemden gelir.

export function publishWindowMinutes(sureDk: number): number {
  return Math.max(60, sureDk * 2);
}

function dersKeyOf(def: GameDefinition): Ders {
  return (Object.entries(PROGRAM_DERS_ADI).find(([, ad]) => ad === def.meta.ders)?.[0] ?? "genel-kultur") as Ders;
}

// Öğretmen paneli ve sonuç tablosu durakları bu listeden okur. Sanal sahneler QR'sız olduğundan sıra numarası alır.
export function definitionToStops(def: GameDefinition): GameStop[] {
  const dersKey = dersKeyOf(def);
  return def.duraklar.map((d, i) => ({
    qr: d.mekan.qr_durak_id ? Number(d.mekan.qr_durak_id.replace(/^qr-/, "")) : i + 1,
    name: d.isim.slice(0, 40),
    emoji: d.sahne_turu === "secim" ? "🔀" : d.mekan.tur === "qr" ? "📍" : "🎬",
    dersKey,
    hikaye: d.hikaye_metni.slice(0, 400),
  }));
}

export type ComposerPublishResult =
  | { ok: true; request: PublishRequest }
  | { ok: false; status: number; error: string; validation?: ValidationResult };

export const MAX_DEFINITION_BYTES = 64 * 1024;

export function parseComposerPublish(body: unknown): ComposerPublishResult {
  const composer = (body as { composer?: { definition?: unknown; konuId?: unknown } } | null)?.composer;
  if (JSON.stringify(composer?.definition ?? null).length > MAX_DEFINITION_BYTES) {
    return { ok: false, status: 413, error: "Oyun tanımı çok büyük" };
  }
  const parsed = GameDefinitionSchema.safeParse(composer?.definition);
  if (!parsed.success || typeof composer?.konuId !== "string") {
    return { ok: false, status: 422, error: "Geçersiz oyun tanımı" };
  }
  const validation = revalidate(parsed.data, composer.konuId);
  if (!validation) return { ok: false, status: 422, error: "Oyunun konusu müfredatta bulunamadı" };
  if (!validation.gecerli) {
    return { ok: false, status: 422, error: "Oyun doğrulamadan geçmedi; yayınlanamaz", validation };
  }
  return {
    ok: true,
    request: {
      durationMinutes: publishWindowMinutes(parsed.data.meta.sure_dk),
      aylar: [],
      stops: definitionToStops(parsed.data),
      definition: parsed.data,
    },
  };
}

import { PROGRAM_DERS_ADI } from "@/data/mufredat/programlar";
import type { Ders } from "@/data/mufredat";
import { GameDefinitionSchema, type GameDefinition } from "@/lib/composer/definition";
import { DersKonuSchema, type DersKonu } from "@/lib/composer/input";
import { z } from "zod";
import { revalidate } from "@/lib/composer/service";
import type { ValidationResult } from "@/lib/composer/validator";
import { publishWindowMinutes, type GameStop, type PublishRequest } from "@/lib/games";

// Game Definition → mevcut oyun kaydı. Kod üretimi, katılım, sonuçlar ve süre mevcut sistemden gelir.

// Birden çok ders seçildiyse klasik alanlar için ilk ders kullanılır.
function dersKeyOf(def: GameDefinition): Ders {
  const ilk = def.meta.ders.split(" + ")[0];
  return (Object.entries(PROGRAM_DERS_ADI).find(([, ad]) => ad === ilk)?.[0] ?? "genel-kultur") as Ders;
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
  | { ok: true; request: PublishRequest; dersler: DersKonu[] }
  | { ok: false; status: number; error: string; validation?: ValidationResult };

export const MAX_DEFINITION_BYTES = 64 * 1024;

export type ComposerDefinitionResult =
  | { ok: true; definition: GameDefinition; dersler: DersKonu[]; validation: ValidationResult }
  | { ok: false; status: number; error: string };

// Tanımı şemaya ve müfredata göre çözer; oyun kurallarının sonucu validation'da döner (geçersiz olabilir).
export function parseComposerDefinition(definition: unknown, derslerGirdi: unknown): ComposerDefinitionResult {
  if (JSON.stringify(definition ?? null).length > MAX_DEFINITION_BYTES) {
    return { ok: false, status: 413, error: "Oyun tanımı çok büyük" };
  }
  const parsed = GameDefinitionSchema.safeParse(definition);
  const dersler = z.array(DersKonuSchema).min(1).safeParse(derslerGirdi);
  if (!parsed.success || !dersler.success) {
    return { ok: false, status: 422, error: "Geçersiz oyun tanımı" };
  }
  const validation = revalidate(parsed.data, dersler.data);
  if (!validation) return { ok: false, status: 422, error: "Oyunun konusu müfredatta bulunamadı" };
  return { ok: true, definition: parsed.data, dersler: dersler.data, validation };
}

export function parseComposerPublish(body: unknown): ComposerPublishResult {
  const composer = (body as { composer?: { definition?: unknown; dersler?: unknown } } | null)?.composer;
  const r = parseComposerDefinition(composer?.definition, composer?.dersler);
  if (!r.ok) return r;
  const { definition, dersler, validation } = r;
  if (!validation.gecerli) {
    return { ok: false, status: 422, error: "Oyun doğrulamadan geçmedi; yayınlanamaz", validation };
  }
  return {
    ok: true,
    dersler,
    request: {
      durationMinutes: publishWindowMinutes(definition.meta.sure_dk),
      aylar: [],
      stops: definitionToStops(definition),
      definition,
    },
  };
}

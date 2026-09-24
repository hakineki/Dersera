import { PROGRAM_DERS_ADI, PROGRAM_DERSLERI } from "@/data/mufredat/programlar";
import { GameDefinitionSchema, type GameDefinition } from "@/lib/composer/definition";
import { DersKonuSchema, type DersKonu } from "@/lib/composer/input";
import { z } from "zod";
import { revalidate } from "@/lib/composer/service";
import type { ValidationResult } from "@/lib/composer/validator";
import { yonetisimDegerlendir, type YonetisimSonucu } from "@/lib/composer/yonetisim";
import type { YzDenetim } from "@/lib/composer/yzDenetim";
import { publishWindowMinutes, type DurakDersi, type GameStop, type PublishRequest } from "@/lib/games";

// Game Definition → mevcut oyun kaydı. Kod üretimi, katılım, sonuçlar ve süre mevcut sistemden gelir.

// Birden çok ders seçildiyse klasik alanlar için ilk ders kullanılır.
function dersKeyOf(def: GameDefinition): DurakDersi {
  const ilk = def.meta.ders.split(" + ")[0];
  return PROGRAM_DERSLERI.find((k) => PROGRAM_DERS_ADI[k] === ilk) ?? "genel-kultur";
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
  | { ok: true; request: PublishRequest; dersler: DersKonu[]; yonetisim: YonetisimSonucu; guvenlik: YzDenetim }
  | { ok: false; status: number; error: string; validation?: ValidationResult; yonetisim?: YonetisimSonucu; guvenlik?: YzDenetim; definition?: GameDefinition };

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

// Yapay zekâ denetimi yalnız doğrulamadan geçen tanım için istenir (geçersiz oyun zaten yayınlanamaz, çağrı boşa gider).
export async function parseComposerPublish(body: unknown, denetle: (def: GameDefinition) => Promise<YzDenetim>): Promise<ComposerPublishResult> {
  const composer = (body as { composer?: { definition?: unknown; dersler?: unknown } } | null)?.composer;
  const r = parseComposerDefinition(composer?.definition, composer?.dersler);
  if (!r.ok) return r;
  const { definition, dersler, validation } = r;
  // Yayın içerik yönetişimini atlayamaz: BLOCK yayını durdurur, REVIEW öğretmene gösterilir.
  if (!validation.gecerli) {
    return { ok: false, status: 422, error: "Oyun doğrulamadan geçmedi; yayınlanamaz", validation, yonetisim: yonetisimDegerlendir(definition, validation) };
  }
  const guvenlik = await denetle(definition);
  const yonetisim = yonetisimDegerlendir(definition, validation, guvenlik);
  if (yonetisim.karar === "BLOCK") {
    return { ok: false, status: 422, error: "Oyun içerik denetiminden geçmedi; yayınlanamaz", validation, yonetisim, guvenlik, definition };
  }
  return {
    ok: true,
    dersler,
    yonetisim,
    guvenlik,
    request: {
      durationMinutes: publishWindowMinutes(definition.meta.sure_dk),
      aylar: [],
      stops: definitionToStops(definition),
      definition,
    },
  };
}

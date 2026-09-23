import { z } from "zod";
import {
  PROGRAM_DERS_ADI,
  PROGRAM_DERSLERI,
  getUnite,
  type OgrenmeCiktisi,
  type ProgramDersi,
  type Unite,
} from "@/data/mufredat/programlar";
import { maxDersSayisi } from "@/lib/composer/recipe";

export const SURELER = [20, 40, 60] as const;
export const DENEYIMLER = ["macera", "dengeli", "ders"] as const;
export const ALANLAR = ["sinif", "okul"] as const;

export type Deneyim = (typeof DENEYIMLER)[number];
export type Alan = (typeof ALANLAR)[number];

export const DersKonuSchema = z.object({
  ders: z.enum(PROGRAM_DERSLERI),
  konuId: z.string().regex(/^\d{1,6}$/),
});
export type DersKonu = z.infer<typeof DersKonuSchema>;

// Öğretmenin seçimleri: sınıf, bir ya da daha çok ders (her birine bir konu), süre, deneyim, alan.
export const ComposeInputSchema = z
  .object({
    sinif: z.union([z.literal(9), z.literal(10), z.literal(11), z.literal(12)]),
    dersler: z.array(DersKonuSchema).min(1).max(PROGRAM_DERSLERI.length),
    sure: z.union([z.literal(20), z.literal(40), z.literal(60)]),
    deneyim: z.enum(DENEYIMLER),
    alan: z.enum(ALANLAR),
  })
  .strict();

export type ComposeInput = z.infer<typeof ComposeInputSchema>;

export interface SeciliKonu {
  ders: ProgramDersi;
  konuId: string;
  unite: Unite;
}

export interface ResolvedInput extends Omit<ComposeInput, "dersler"> {
  dersler: SeciliKonu[];
  ogrenmeCiktilari: OgrenmeCiktisi[];
  // Ders adı → o dersin öğrenme çıktısı kodları; disiplinler arası oyunda her ders en az bir görevde çalışılmalı.
  hedefDersleri: Record<string, string[]>;
  dersAdi: string;
  konuAdi: string;
}

export type InputResult = { ok: true; input: ResolvedInput } | { ok: false; error: string };

// Seçili ders/konu listesini müfredattan çözer; yayında da aynı kurallarla yeniden kullanılır.
export function resolveKonular(sinif: number, dersler: DersKonu[]): { ok: true; konular: SeciliKonu[] } | { ok: false; error: string } {
  if (new Set(dersler.map((d) => d.ders)).size !== dersler.length) return { ok: false, error: "Bir ders yalnız bir kez seçilebilir." };
  const konular: SeciliKonu[] = [];
  for (const d of dersler) {
    const unite = getUnite(sinif, d.ders, d.konuId);
    if (!unite || unite.ogrenmeCiktilari.length === 0) {
      return { ok: false, error: `Seçilen konu ${sinif}. sınıf ${PROGRAM_DERS_ADI[d.ders]} programında yok.` };
    }
    konular.push({ ders: d.ders, konuId: d.konuId, unite });
  }
  return { ok: true, konular };
}

export function describeKonular(konular: SeciliKonu[]) {
  return {
    ogrenmeCiktilari: konular.flatMap((k) => k.unite.ogrenmeCiktilari),
    hedefDersleri: Object.fromEntries(konular.map((k) => [PROGRAM_DERS_ADI[k.ders], k.unite.ogrenmeCiktilari.map((o) => o.kod)])),
    dersAdi: konular.map((k) => PROGRAM_DERS_ADI[k.ders]).join(" + "),
    konuAdi: konular.map((k) => k.unite.ad).join(" · "),
  };
}

export function parseComposeInput(body: unknown): InputResult {
  const parsed = ComposeInputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: "Geçersiz seçim." };
  const enFazla = maxDersSayisi(parsed.data.sure);
  if (parsed.data.dersler.length > enFazla) {
    return { ok: false, error: `${parsed.data.sure} dakikalık oyunda en fazla ${enFazla} ders seçilebilir.` };
  }
  const r = resolveKonular(parsed.data.sinif, parsed.data.dersler);
  if (!r.ok) return r;
  return { ok: true, input: { ...parsed.data, dersler: r.konular, ...describeKonular(r.konular) } };
}

import { z } from "zod";
import {
  PROGRAM_DERSLERI,
  getUnite,
  type OgrenmeCiktisi,
  type ProgramDersi,
  type Unite,
} from "@/data/mufredat/programlar";

export const SURELER = [20, 40, 60] as const;
export const DENEYIMLER = ["macera", "dengeli", "ders"] as const;
export const ALANLAR = ["sinif", "okul"] as const;

export type Deneyim = (typeof DENEYIMLER)[number];
export type Alan = (typeof ALANLAR)[number];

// Öğretmenin gönderdiği 6 seçim. Başka alan kabul edilmez.
export const ComposeInputSchema = z
  .object({
    sinif: z.union([z.literal(9), z.literal(10), z.literal(11), z.literal(12)]),
    ders: z.enum(PROGRAM_DERSLERI),
    konuId: z.string().regex(/^\d{1,6}$/),
    sure: z.union([z.literal(20), z.literal(40), z.literal(60)]),
    deneyim: z.enum(DENEYIMLER),
    alan: z.enum(ALANLAR),
  })
  .strict();

export type ComposeInput = z.infer<typeof ComposeInputSchema>;

export interface ResolvedInput extends ComposeInput {
  ders: ProgramDersi;
  unite: Unite;
  ogrenmeCiktilari: OgrenmeCiktisi[];
}

export type InputResult = { ok: true; input: ResolvedInput } | { ok: false; error: string };

export function parseComposeInput(body: unknown): InputResult {
  const parsed = ComposeInputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: "Geçersiz seçim." };
  const unite = getUnite(parsed.data.sinif, parsed.data.ders, parsed.data.konuId);
  if (!unite || unite.ogrenmeCiktilari.length === 0) {
    return { ok: false, error: "Seçilen konu bu sınıf ve derste müfredatta yok." };
  }
  return { ok: true, input: { ...parsed.data, unite, ogrenmeCiktilari: unite.ogrenmeCiktilari } };
}

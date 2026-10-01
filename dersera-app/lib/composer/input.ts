import { z } from "zod";
import {
  PROGRAM_DERS_ADI,
  PROGRAM_DERSLERI,
  SINIFLAR,
  getUnite,
  type OgrenmeCiktisi,
  type ProgramDersi,
  type Unite,
} from "@/data/mufredat/programlar";
import { buildRecipe, maxDersSayisi } from "@/lib/composer/recipe";
import { mekanOf } from "@/data/mekanlar";
import { MEKAN_SINIRLARI } from "@/lib/mekan";

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

import { SERBEST_NOT_MAX } from "@/lib/composer/limits";
import { gorunmezleriAt, KAYNAK, kaynakNormal } from "@/lib/composer/kaynak";

export { SERBEST_NOT_MAX };

// Öğretmenin seçimleri: sınıf, bir ya da daha çok ders (her birine bir konu), süre, deneyim, alan
// ve isteğe bağlı ön not (senaryo fikri). Not kontrol karakterlerinden arındırılır; boşsa yok sayılır.
// İsteğe bağlı kaynak: öğretmenin ders notu ya da PDF metni (lib/composer/kaynak.ts); yalnız istemde kullanılır, saklanmaz.
export const ComposeInputSchema = z
  .object({
    sinif: z.number().int().refine((s) => (SINIFLAR as readonly number[]).includes(s)),
    dersler: z.array(DersKonuSchema).min(1).max(PROGRAM_DERSLERI.length),
    sure: z.union([z.literal(20), z.literal(40), z.literal(60)]),
    deneyim: z.enum(DENEYIMLER),
    alan: z.enum(ALANLAR),
    serbest_not: z
      .string()
      .max(SERBEST_NOT_MAX)
      // Sekme boşluğa döner; kontrol, yön değiştirici ve sıfır genişlikli karakterler atılır (satır sonu kalır).
      .transform((s) => gorunmezleriAt(s.replace(/\t/g, " ")).trim())
      .optional(),
    kaynak: z.string().max(KAYNAK.enCok).transform(kaynakNormal).optional(),
    // Görsel zenginleştirme (lib/gorsel.ts); yalnız true anlamlıdır.
    gorsel: z.boolean().optional(),
    // Okul macerası (mekân rotası): öğretmenin durak sırasıyla seçtiği mekânlar; null olan durağın mekânını rehber seçer.
    // ad mekânın okuldaki adıdır (ör. "10-A sınıfı"); yoksa listedeki ad kullanılır. Her mekân bir kez.
    rota_secimi: z
      .array(
        z
          .object({
            mekan_id: z.string().max(40),
            ad: z
              .string()
              .max(MEKAN_SINIRLARI.adEnCok)
              .transform((s) => gorunmezleriAt(s).replace(/\s+/g, " ").trim())
              .optional(),
            // QR'ın yapıştırılacağı nokta (öğretmenin tarifi); varsa rehber bilmeceyi bu noktaya göre yazar.
            nokta: z
              .string()
              .max(MEKAN_SINIRLARI.noktaEnCok)
              .transform((s) => gorunmezleriAt(s).replace(/\s+/g, " ").trim())
              .optional(),
          })
          .strict()
          .nullable()
      )
      .max(12)
      .optional(),
  })
  .strict();

export type ComposeInput = z.infer<typeof ComposeInputSchema>;
export type RotaSecimi = { mekan_id: string; ad?: string; nokta?: string };

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
  // Öğrenme döngüsünden platform yöneticisince onaylanmış ek istem kuralları (lib/ogrenme.ts); oluşturmada eklenir.
  ekKurallar?: string[];
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
  if (!parsed.success) {
    const kaynakUzun = parsed.error.issues.some((i) => i.path[0] === "kaynak" && i.code === "too_big");
    return { ok: false, error: kaynakUzun ? `Kaynak metni en çok ${KAYNAK.enCok.toLocaleString("tr-TR")} karakter olabilir.` : "Geçersiz seçim." };
  }
  if (parsed.data.kaynak !== undefined && parsed.data.kaynak.length > 0 && parsed.data.kaynak.length < KAYNAK.enAz) {
    return { ok: false, error: `Kaynak metni en az ${KAYNAK.enAz} karakter olmalı.` };
  }
  const enFazla = maxDersSayisi(parsed.data.sure);
  if (parsed.data.dersler.length > enFazla) {
    return { ok: false, error: `${parsed.data.sure} dakikalık oyunda en fazla ${enFazla} ders seçilebilir.` };
  }
  const { serbest_not, kaynak, gorsel, rota_secimi, ...secimler } = parsed.data;
  const rota = rotaSecimiOf(rota_secimi, parsed.data);
  if (rota === null) return { ok: false, error: "Geçersiz rota seçimi." };
  const r = resolveKonular(parsed.data.sinif, parsed.data.dersler);
  if (!r.ok) return r;
  return {
    ok: true,
    input: {
      ...secimler,
      ...(serbest_not ? { serbest_not } : {}),
      ...(kaynak ? { kaynak } : {}),
      ...(gorsel ? { gorsel } : {}),
      ...(rota ? { rota_secimi: rota } : {}),
      dersler: r.konular,
      ...describeKonular(r.konular),
    },
  };
}

// Rota seçimi yalnız okul macerasında, durak sayısını aşmadan, bilinen ve tekrarsız mekânlarla geçerlidir (null: geçersiz).
// Hiç mekân seçilmediyse (hepsi rehbere) yok sayılır; listedeki adla aynı ya da boş ad atılır.
function rotaSecimiOf(secim: ComposeInput["rota_secimi"], g: Pick<ComposeInput, "alan" | "sure" | "deneyim">): (RotaSecimi | null)[] | undefined | null {
  if (!secim?.some(Boolean)) return undefined;
  const idler = secim.flatMap((s) => (s ? [s.mekan_id] : []));
  if (g.alan !== "okul" || secim.length > buildRecipe(g.sure, g.deneyim, "okul").anaGorev.max) return null;
  if (idler.some((id) => !mekanOf(id)) || new Set(idler).size !== idler.length) return null;
  return secim.map(
    (s) => s && { mekan_id: s.mekan_id, ...(s.ad && s.ad !== mekanOf(s.mekan_id)!.ad ? { ad: s.ad } : {}), ...(s.nokta ? { nokta: s.nokta } : {}) }
  );
}

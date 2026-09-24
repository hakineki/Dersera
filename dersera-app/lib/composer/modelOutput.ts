import { z } from "zod";
import { GameDefinitionSchema, type GameDefinition } from "@/lib/composer/definition";
import type { ResolvedInput } from "@/lib/composer/input";

// Modelin doldurduğu düz şema. Anthropic yapılandırılmış çıktıyı bir dilbilgisine derler; iç içe nesneler,
// null (anyOf) ve enum'lar dilbilgisini büyütür ve "compiled grammar is too large" hatasına yol açar.
// Bu yüzden burada yalnız düz metin/dizi alanları vardır; "yok" değeri boş metindir.
// Enum ve tüm oyun kuralları dönüşümden sonra GameDefinitionSchema ve doğrulayıcıda denetlenir.

const secim = z.object({ metin: z.string(), hedef_durak_id: z.string() });

export const DurakCiktisiSchema = z.object({
  id: z.string(),
  isim: z.string(),
  sahne_turu: z.string(),
  hikaye_metni: z.string(),
  qr_durak_id: z.string(),
  sonraki_durak_tarifi: z.string(),
  gorev_turu: z.string(),
  ogrenme_hedefi: z.string(),
  soru: z.string(),
  secenekler: z.array(z.string()),
  dogru_cevap: z.string(),
  ipucu_1: z.string(),
  ipucu_2: z.string(),
  destek_soru: z.string(),
  destek_secenekler: z.array(z.string()),
  destek_dogru_cevap: z.string(),
  destek_aciklama: z.string(),
  odul_id: z.string(),
  secimler: z.array(secim),
  varsayilan_sonraki_durak_id: z.string(),
});

export const ModelOutputSchema = z.object({
  baslik: z.string(),
  hikaye_giris: z.string(),
  oyun_amaci: z.string(),
  ogrenme_hedefleri: z.array(z.string()),
  envanter: z.array(z.object({ id: z.string(), tur: z.string(), isim: z.string(), final_icin_gerekli: z.boolean() })),
  // Final duraklardan ÖNCE: model önce finali ve gereken nesneleri tasarlar, sonra durakları bu nesneleri verecek biçimde yazar.
  final: z.object({
    hikaye_metni: z.string(),
    gerekli_nesneler: z.array(z.string()),
    ogrenme_hedefleri: z.array(z.string()),
    gorev_turu: z.string(),
    soru: z.string(),
    secenekler: z.array(z.string()),
    dogru_cevap: z.string(),
    basari_metni: z.string(),
  }),
  duraklar: z.array(DurakCiktisiSchema),
});

export type ModelOutput = z.infer<typeof ModelOutputSchema>;
export type DurakCiktisi = z.infer<typeof DurakCiktisiSchema>;

// Hatalı durakların yeniden yazımı için ikinci, küçük çağrının yanıtı.
export const DuzeltmeSchema = z.object({ duraklar: z.array(DurakCiktisiSchema) });
export type Duzeltme = z.infer<typeof DuzeltmeSchema>;

// Modelin ham JSON metni → şemadaki tip. Kesik ya da şemaya uymayan metin hata döner.
export function parseJsonText<T>(text: string, schema: z.ZodType<T>): { ok: true; output: T } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `Çıktı JSON olarak çözümlenemedi (${text.length} karakter): ${err instanceof Error ? err.message : err}` };
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? { ok: true, output: parsed.data } : { ok: false, error: "Çıktı şemaya uymadı" };
}

export const parseModelText = (text: string) => parseJsonText(text, ModelOutputSchema);

const orNull = (s: string) => (s.trim() ? s.trim() : null);
// Model kodun yanına açıklamayı da yazabiliyor ("FEL.10.1.1: Felsefenin ..."); yalnız kod tutulur.
const KOD = /([A-ZÇĞİÖŞÜ]{2,5}\.?)?\d+(\.\d+)+/u;
export const hedefKodu = (s: string) => s.match(KOD)?.[0] ?? s.trim();

// Düz çıktı → GameDefinition. meta modelden değil doğrulanmış girdiden gelir; mekân türü oyun alanından çıkar.
export function toDefinition(out: ModelOutput, input: ResolvedInput): { ok: true; definition: GameDefinition } | { ok: false; error: string } {
  const candidate = {
    meta: {
      baslik: out.baslik,
      sinif: input.sinif,
      ders: input.dersAdi,
      konu: input.konuAdi,
      sure_dk: input.sure,
      deneyim: input.deneyim,
      alan: input.alan,
    },
    hikaye_giris: out.hikaye_giris,
    oyun_amaci: out.oyun_amaci,
    ogrenme_hedefleri: out.ogrenme_hedefleri.map(hedefKodu),
    envanter: out.envanter,
    duraklar: out.duraklar.map((d) => ({
      id: d.id,
      isim: d.isim,
      sahne_turu: d.sahne_turu,
      hikaye_metni: d.hikaye_metni,
      mekan: {
        tur: input.alan === "okul" ? "qr" : "sanal",
        qr_durak_id: input.alan === "okul" ? orNull(d.qr_durak_id) : null,
        sonraki_durak_tarifi: d.sonraki_durak_tarifi,
      },
      gorev: {
        tur: d.gorev_turu,
        ogrenme_hedefi: hedefKodu(d.ogrenme_hedefi),
        soru: d.soru,
        secenekler: d.secenekler,
        dogru_cevap: d.dogru_cevap,
        ipucu_1: d.ipucu_1,
        ipucu_2: d.ipucu_2,
        destek_gorevi: {
          soru: d.destek_soru,
          secenekler: d.destek_secenekler,
          dogru_cevap: d.destek_dogru_cevap,
          aciklama: d.destek_aciklama,
        },
        odul_id: orNull(d.odul_id),
      },
      secimler: d.secimler,
      varsayilan_sonraki_durak_id: orNull(d.varsayilan_sonraki_durak_id),
    })),
    final: { ...out.final, ogrenme_hedefleri: out.final.ogrenme_hedefleri.map(hedefKodu) },
  };
  const parsed = GameDefinitionSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue.path.join(".")}: ${issue.message}` };
  }
  return { ok: true, definition: parsed.data };
}

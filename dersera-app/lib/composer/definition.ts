import { z } from "zod";

// Game Definition v1. Model çıktısı bu şemaya API seviyesinde (structured outputs) zorlanır.
// Oyuncu durumu (deneme, ipucu, envanter) burada tutulmaz; o, çalışma anındaki oyuncunun işidir.

export const GOREV_TURLERI = [
  "coktan_secmeli",
  "eslestirme",
  "siralama",
  "surukle_birak",
  "gorsel_secim",
  "sayisal",
] as const;
export type GorevTuru = (typeof GOREV_TURLERI)[number];

// Görev türlerinin cevap biçimi; oyuncu ve doğrulayıcı aynı kuralı kullanır.
export const CEVAP_AYRACI = " | ";
export const ESLESTIRME_AYRACI = " => ";

const secenekAciklama =
  "coktan_secmeli ve gorsel_secim: 2-5 seçenek, doğru cevap aynen içlerinde. " +
  "siralama ve surukle_birak: sıralanacak 3-6 öğe (karışık sırada). " +
  "eslestirme: 3-5 çift, her biri 'sol => sağ' biçiminde doğru eşleşme. " +
  "sayisal: boş dizi.";

const dogruCevapAciklama =
  "coktan_secmeli ve gorsel_secim: seçeneklerden biri, birebir aynı metin. " +
  "siralama ve surukle_birak: öğelerin doğru sırası ' | ' ile birleştirilmiş. " +
  "eslestirme: tüm çiftler seçeneklerdeki gibi ' | ' ile birleştirilmiş. " +
  "sayisal: yalnız sayı (ör. 12 veya 3.5).";

export const DestekGoreviSchema = z.object({
  soru: z.string().describe("Aynı öğrenme hedefini daha küçük adımla çalıştıran kolaylaştırılmış çoktan seçmeli soru"),
  secenekler: z.array(z.string()).describe("2-4 seçenek"),
  dogru_cevap: z.string().describe("Seçeneklerden biri, birebir aynı metin"),
  aciklama: z.string().describe("Doğru cevabın kısa, öğretici açıklaması"),
});

export const GorevSchema = z.object({
  tur: z.enum(GOREV_TURLERI),
  ogrenme_hedefi: z.string().describe("Verilen öğrenme çıktısı listesindeki kodlardan biri, birebir (ör. FİZ.11.1.4)"),
  soru: z.string(),
  secenekler: z.array(z.string()).describe(secenekAciklama),
  dogru_cevap: z.string().describe(dogruCevapAciklama),
  ipucu_1: z.string().describe("Cevabı vermeden yönlendiren ilk ipucu"),
  ipucu_2: z.string().describe("Daha güçlü ama yine cevabı söylemeyen ikinci ipucu"),
  destek_gorevi: DestekGoreviSchema,
  odul_id: z.string().nullable().describe("Görev tamamlanınca kazanılan envanter öğesinin id'si ya da null"),
});

export const DurakSchema = z.object({
  id: z.string().describe("Kısa, benzersiz, küçük harf id: d1, d2, ..."),
  isim: z.string(),
  sahne_turu: z.enum(["gorev", "secim", "birlesme"]),
  hikaye_metni: z.string(),
  mekan: z.object({
    tur: z.enum(["sanal", "qr"]),
    qr_durak_id: z.string().nullable().describe("Okul macerasında verilen QR id'lerinden biri; tek sınıfta null"),
    sonraki_durak_tarifi: z.string(),
  }),
  gorev: GorevSchema,
  secimler: z
    .array(z.object({ metin: z.string(), hedef_durak_id: z.string() }))
    .describe("Yalnız sahne_turu 'secim' ise 2-3 hikâye/strateji seçeneği; diğerlerinde boş dizi"),
  varsayilan_sonraki_durak_id: z
    .string()
    .nullable()
    .describe("Seçim sahnesinde null. Son duraklarda null (finale geçer)."),
});

export const EnvanterSchema = z.object({
  id: z.string().describe("Kısa, benzersiz id: n1, n2, ..."),
  tur: z.enum(["kanit", "anahtar", "parca"]),
  isim: z.string(),
  final_icin_gerekli: z.boolean(),
});

export const FinalSchema = z.object({
  hikaye_metni: z.string(),
  gerekli_nesneler: z.array(z.string()).describe("Finalde kullanılan envanter id'leri"),
  ogrenme_hedefleri: z.array(z.string()).describe("Finalin birleştirdiği öğrenme çıktısı kodları (en az 2)"),
  gorev_turu: z.enum(GOREV_TURLERI),
  soru: z.string(),
  secenekler: z.array(z.string()).describe(secenekAciklama),
  dogru_cevap: z.string().describe(dogruCevapAciklama),
  basari_metni: z.string(),
});

// Görsel zenginleştirme (lib/gorsel.ts): iş kimliği ve görseli hazır hedefler (kapak ya da durak id'si). Adres taşımaz.
export const GorsellerSchema = z.object({
  isId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
  hedefler: z
    .array(z.string().regex(/^[a-z0-9_-]{1,24}$/))
    .max(4)
    .refine((h) => new Set(h).size === h.length),
});

export const GameDefinitionSchema = z.object({
  meta: z.object({
    baslik: z.string(),
    sinif: z.number(),
    ders: z.string(),
    konu: z.string(),
    sure_dk: z.number(),
    deneyim: z.enum(["macera", "dengeli", "ders"]),
    alan: z.enum(["sinif", "okul"]),
    // Oyunun nasıl oluşturulduğu: "sablon", öğretmenin boş şablondan kendi yazdığı oyun (lib/composer/sablon.ts). Model
    // çıktısında yoktur (meta girdiden kurulur). Öğrenme döngüsü yapay zekâ üretiminin kalitesini ölçtüğü için bu oyunlar
    // sinyallere girmez. İstemcinin beyanıdır: yalnız bu sayaçları etkiler, yayın kapılarını değiştirmez.
    olusturma: z.literal("sablon").optional(),
  }),
  hikaye_giris: z.string(),
  oyun_amaci: z.string(),
  ogrenme_hedefleri: z.array(z.string()).describe("Oyunda çalışılan öğrenme çıktısı kodları"),
  envanter: z.array(EnvanterSchema),
  duraklar: z.array(DurakSchema).describe("İlk eleman başlangıç durağıdır"),
  final: FinalSchema,
  gorseller: GorsellerSchema.optional(),
});

export type GameDefinition = z.infer<typeof GameDefinitionSchema>;
export type Durak = z.infer<typeof DurakSchema>;
export type Gorev = z.infer<typeof GorevSchema>;
export type Final = z.infer<typeof FinalSchema>;

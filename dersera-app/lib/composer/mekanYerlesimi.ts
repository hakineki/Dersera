import { createHash } from "crypto";
import { mekanBilmeceleri } from "@/data/konumBilmeceleri";
import { MEKANLAR, mekanOf } from "@/data/mekanlar";
import { katla, metinleriTara } from "@/lib/composer/cocukGuvenligi";
import type { KonumYeri } from "@/lib/composer/definition";
import type { YasProfili } from "@/lib/yasProfili";

// Sunucu tarafı: mekân rotasında her durağa okul mekânı ve o mekânın konum bilmecelerinden biri atanır. Model mekânı
// listeden seçer; geçersiz ya da tekrarlanan mekân listedeki ilk boş mekânla değiştirilir. Bilmece, oyun başlığı ve
// durak kimliğinden türeyen bir sırayla seçilir (aynı oyun için her seferinde aynı).

function sira(anahtar: string, n: number): number {
  return parseInt(createHash("sha256").update(anahtar).digest("hex").slice(0, 8), 16) % n;
}

// Model kimliği ya da adı yazabilir ("kutuphane", "Kütüphane", "spor salonu"): büyük/küçük harf ve boşluk/tire farkı
// gözetilmeden eşleştirilir.
const mekanAnahtari = (s: string) => s.trim().toLocaleLowerCase("tr-TR").replace(/[\s_-]+/g, "-");
const ARAMA = new Map(MEKANLAR.flatMap((m) => [[mekanAnahtari(m.id), m.id], [mekanAnahtari(m.ad), m.id]]));

// Modelin yazdığı mekânın kimliği; listede yoksa undefined.
export const mekanKimligi = (girdi: string): string | undefined => ARAMA.get(mekanAnahtari(girdi)) ?? mekanOf(girdi.trim())?.id;

export function mekanlariAta(istenen: string[]): string[] {
  const kullanilan = new Set<string>();
  const secilen = istenen.map((girdi) => {
    const id = mekanKimligi(girdi);
    if (!id || kullanilan.has(id)) return null;
    kullanilan.add(id);
    return id;
  });
  return secilen.map((id, i) => {
    if (id) return id;
    // Listedeki ilk boş mekân; liste biterse (doğrulayıcının durak sınırı bunu önler) sırayla yeniden kullanılır.
    const bos = MEKANLAR.find((m) => !kullanilan.has(m.id)) ?? MEKANLAR[i % MEKANLAR.length];
    kullanilan.add(bos.id);
    return bos.id;
  });
}

export function konumYeri(mekanId: string, anahtar: string): KonumYeri {
  const m = mekanOf(mekanId);
  const bilmeceler = mekanBilmeceleri(mekanId);
  if (!m || bilmeceler.length === 0) throw new Error(`Bilinmeyen mekân: ${mekanId}`);
  const b = bilmeceler[sira(anahtar, bilmeceler.length)];
  return { mekan_id: m.id, mekan_adi: m.ad, nokta: b.nokta, bilmece: b.bilmece, ipucu_1: b.ipucu1, ipucu_2: b.ipucu2 };
}

// Rotanın yerleri: modelin seçtiği mekânlar atanır, her durağa o mekânın bankasından bir bilmece seçilir. Görev doldurma
// (rehber bilmeceyi uyarlar) ve tanıma dönüşüm aynı girdiden aynı yerleri bulur.
export function rotaYerleri(baslik: string, duraklar: { id: string; mekan_id: string }[]): KonumYeri[] {
  const mekanlar = mekanlariAta(duraklar.map((d) => d.mekan_id));
  return duraklar.map((d, i) => konumYeri(mekanlar[i], `${baslik}:${d.id}`));
}

// Rehberin sınıf düzeyine ve hikâyeye uyarladığı bilmece ve 1. ipucu. 2. ipucu bankadaki gibi kalır: noktayı adıyla
// söyler, uyarlama bilmeceyi bulanıklaştırsa da takım QR'ı bulur.
export interface KonumUyarlamasi {
  bilmece: string;
  ipucu_1: string;
}

// Uyarlamanın üst sınırı (karakter): bankada bilmece en çok 133, 1. ipucu en çok 116 karakterdir; lisede daha dolaylı
// ve hikâyeye bağlı bilmeceye yer kalır, ilkokulda kısa tutulur.
export const UYARLAMA_SINIRI: Record<YasProfili, { bilmece: number; ipucu: number }> = {
  PRESCHOOL_3_5: { bilmece: 140, ipucu: 120 },
  PRIMARY_6_10: { bilmece: 140, ipucu: 120 },
  MIDDLE_11_14: { bilmece: 200, ipucu: 150 },
  HIGH_15_18: { bilmece: 240, ipucu: 160 },
};

// Başka bir mekânı adıyla anan uyarlama takımı yanlış yere gönderebilir. Ayırt edici adlar (ekli hâlleri de içerir);
// sınıf, koridor ve merdiven bilmecelerde genel sözcük olarak geçtiği için sayılmaz.
const AYIRT_EDICI: Record<string, string> = {
  kutuphane: "kütüphane",
  bahce: "bahçe",
  "spor-salonu": "spor salon",
  kantin: "kantin",
  yemekhane: "yemekhane",
  "fen-laboratuvari": "laboratuvar",
  "bilisim-sinifi": "bilişim",
  "muzik-sinifi": "müzik sınıf",
  "resim-atolyesi": "resim atölye",
  "konferans-salonu": "konferans",
  "giris-holu": "giriş hol",
  "rehberlik-servisi": "rehberlik",
  "idare-onu": "idare",
  "ogretmenler-odasi": "öğretmenler oda",
  "toren-alani": "tören alan",
  "duyuru-panosu": "duyuru pano",
  "okul-kapisi": "okul kapı",
};

const ayni = (a: string, b: string) => katla(a).replace(/\s+/g, " ").trim() === katla(b).replace(/\s+/g, " ").trim();

// Uyarlamayı denetleyip uygular. Uygun değilse bankadaki yer aynen kalır; neden sunucu kaydı içindir.
export function uyarlamaUygula(yer: KonumYeri, u: KonumUyarlamasi | undefined, profil: YasProfili): { yer: KonumYeri; neden: string | null } {
  if (!u) return { yer, neden: null };
  const bilmece = u.bilmece.trim();
  const ipucu1 = u.ipucu_1.trim();
  const sinir = UYARLAMA_SINIRI[profil];
  const reddet = (neden: string) => ({ yer, neden });
  if (!bilmece || !ipucu1) return reddet("boş");
  if (bilmece.length > sinir.bilmece || ipucu1.length > sinir.ipucu) return reddet("uzun");
  if (ayni(bilmece, ipucu1) || ayni(ipucu1, yer.ipucu_2)) return reddet("ipucu aynı");
  const banka = katla([yer.nokta, yer.bilmece, yer.ipucu_1, yer.ipucu_2].join(" "));
  const yeni = katla(`${bilmece} ${ipucu1}`);
  const baskaYer = Object.entries(AYIRT_EDICI).find(([id, ad]) => id !== yer.mekan_id && yeni.includes(katla(ad)) && !banka.includes(katla(ad)));
  if (baskaYer) return reddet(`başka mekân: ${baskaYer[0]}`);
  if (metinleriTara([{ metin: bilmece, yer: "bilmece" }, { metin: ipucu1, yer: "ipucu" }]).length > 0) return reddet("güvenlik");
  return { yer: { ...yer, bilmece, ipucu_1: ipucu1 }, neden: null };
}

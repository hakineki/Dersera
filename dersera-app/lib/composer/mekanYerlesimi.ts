import { createHash } from "crypto";
import { mekanBilmeceleri } from "@/data/konumBilmeceleri";
import { MEKANLAR, mekanOf } from "@/data/mekanlar";
import { katla, metinleriTara } from "@/lib/composer/cocukGuvenligi";
import type { KonumYeri } from "@/lib/composer/definition";
import type { RotaSecimi } from "@/lib/composer/input";
import type { YasProfili } from "@/lib/yasProfili";

// Sunucu tarafı: mekân rotasında her durağa okul mekânı ve o mekânın konum bilmecelerinden biri atanır. Öğretmenin
// seçtiği mekânlar sabittir; kalan duraklarda model listeden seçer, geçersiz ya da tekrarlanan mekân listedeki ilk boş
// mekânla değiştirilir. Bilmece, oyun başlığı ve durak kimliğinden türeyen bir sırayla seçilir (aynı oyun için her seferinde aynı).

function sira(anahtar: string, n: number): number {
  return parseInt(createHash("sha256").update(anahtar).digest("hex").slice(0, 8), 16) % n;
}

// Model kimliği ya da adı yazabilir ("kutuphane", "Kütüphane", "spor salonu"): büyük/küçük harf ve boşluk/tire farkı
// gözetilmeden eşleştirilir.
const mekanAnahtari = (s: string) => s.trim().toLocaleLowerCase("tr-TR").replace(/[\s_-]+/g, "-");
const ARAMA = new Map(MEKANLAR.flatMap((m) => [[mekanAnahtari(m.id), m.id], [mekanAnahtari(m.ad), m.id]]));

// Modelin yazdığı mekânın kimliği; listede yoksa undefined.
export const mekanKimligi = (girdi: string): string | undefined => ARAMA.get(mekanAnahtari(girdi)) ?? mekanOf(girdi.trim())?.id;

// sabit: öğretmenin seçtiği mekânlar (durak sırasıyla; null olanı model seçer). Önceden ayrılır; modelin seçimi bunlarla
// çakışırsa ilk boş mekânla değişir.
export function mekanlariAta(istenen: string[], sabit: (string | null)[] = []): string[] {
  const kullanilan = new Set(sabit.slice(0, istenen.length).filter((id): id is string => !!id));
  const secilen = istenen.map((girdi, i) => {
    if (sabit[i]) return sabit[i];
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

// Rotanın yerleri: öğretmenin seçtiği mekânlar (ve okuldaki adları) sabit, kalanını model seçer; her durağa o mekânın
// bankasından bir bilmece seçilir. Görev doldurma (rehber bilmeceyi uyarlar) ve tanıma dönüşüm aynı girdiden aynı yerleri bulur.
export function rotaYerleri(baslik: string, duraklar: { id: string; mekan_id: string }[], secim: (RotaSecimi | null)[] = []): KonumYeri[] {
  const mekanlar = mekanlariAta(
    duraklar.map((d) => d.mekan_id),
    secim.map((s) => s?.mekan_id ?? null)
  );
  return duraklar.map((d, i) => {
    const s = secim[i];
    if (s?.nokta) return ogretmenNoktasiYeri(mekanlar[i], s.ad ?? mekanOf(mekanlar[i])!.ad, s.nokta);
    const yer = konumYeri(mekanlar[i], `${baslik}:${d.id}`);
    return s?.ad ? { ...yer, mekan_adi: s.ad } : yer;
  });
}

// Öğretmenin yazdığı nokta: bankadan bilmece seçilmez. Son ipucu öğretmenin metnini aynen söyler (takım QR'ı her durumda
// bulur); bilmece ve 1. ipucunu rehber görev doldurmada bu noktaya göre yazar, yazamazsa (denetimden geçmezse) aşağıdaki
// genel metin kalır.
export const ogretmenNoktasiIpucu = (nokta: string) => `QR'ı burada ara: ${nokta}`;
export const ogretmenNoktasiMi = (y: KonumYeri): boolean => y.ipucu_2 === ogretmenNoktasiIpucu(y.nokta);
export function ogretmenNoktasiYeri(mekanId: string, mekanAdi: string, nokta: string): KonumYeri {
  return {
    mekan_id: mekanId,
    mekan_adi: mekanAdi,
    nokta,
    bilmece: "Bu mekânda öğretmeninin seçtiği bir noktadayım. Etrafına dikkatle bak; gözden kaçan ayrıntılarda saklanırım.",
    ipucu_1: "Mekânda yavaşça dolaş; masalara, raflara, pencere kenarlarına ve duvarlara yakından bak.",
    ipucu_2: ogretmenNoktasiIpucu(nokta),
  };
}

// Rehberin sınıf düzeyine ve hikâyeye uyarladığı bilmece ve 1. ipucu. 2. ipucu bankadaki gibi kalır: noktayı adıyla
// söyler, uyarlama bilmeceyi bulanıklaştırsa da takım QR'ı bulur.
export interface KonumUyarlamasi {
  bilmece: string;
  ipucu_1: string;
}

// Uyarlamanın üst sınırı (karakter; istemde modele de söylenir): bankada bilmece en çok 133, 1. ipucu en çok 116
// karakterdir. İlkokulun "iki cümle, cümle başına en çok 10 kelime" kuralı ~150 karaktere varır (Türkçede kelime başına
// ~7 karakter); lisede daha dolaylı ve hikâyeye bağlı bilmeceye yer kalır.
export const UYARLAMA_SINIRI: Record<YasProfili, { bilmece: number; ipucu: number }> = {
  PRESCHOOL_3_5: { bilmece: 170, ipucu: 130 },
  PRIMARY_6_10: { bilmece: 170, ipucu: 130 },
  MIDDLE_11_14: { bilmece: 200, ipucu: 150 },
  HIGH_15_18: { bilmece: 240, ipucu: 160 },
};

// Başka bir mekânı adıyla anan uyarlama takımı yanlış yere gönderebilir. Ayırt edici adlar ve yaygın söylenişleri (ekli
// hâlleri de içerir: "kantine", "okulun kapısından"); sınıf, koridor ve merdiven bilmecelerde genel sözcük olarak geçtiği
// için sayılmaz. "idare et", "konferans vermek" gibi gündelik kullanımlar eşleşmesin diye adlar dar tutulur.
const AYIRT_EDICI: Record<string, string[]> = {
  kutuphane: ["kütüphane"],
  bahce: ["bahçe"],
  "spor-salonu": ["spor salon"],
  kantin: ["kantin"],
  yemekhane: ["yemekhane"],
  "fen-laboratuvari": ["laboratuvar", "laboratuar"],
  "bilisim-sinifi": ["bilişim"],
  "muzik-sinifi": ["müzik sınıf", "müzik oda"],
  "resim-atolyesi": ["resim atölye"],
  "konferans-salonu": ["konferans salon"],
  "giris-holu": ["giriş hol"],
  "rehberlik-servisi": ["rehberlik serv", "rehberlik oda"],
  "idare-onu": ["idare oda", "müdür oda"],
  "ogretmenler-odasi": ["öğretmenler oda", "öğretmen oda"],
  "toren-alani": ["tören alan"],
  "duyuru-panosu": ["duyuru pano"],
  "okul-kapisi": ["okul kapı", "okulun kapı"],
};

// Görevin cevabı: rehber bilmeceyi dersin kavramıyla bağlarken durağın görev cevabını önceden verebilir (bilmece takım
// o durağa varmadan gösterilir). Cevabın parçaları (sıralama/eşleştirme öğeleri) ayrı denetlenir; 4 karakterden kısa
// parçalar ("A", "12") gündelik metinde de geçtiği için sayılmaz.
export const cevapParcalari = (...cevaplar: string[]): string[] =>
  cevaplar.flatMap((c) => c.split(/\||=>/)).map((p) => katla(p).replace(/\s+/g, " ").trim()).filter((p) => p.length >= 4);

const ayni = (a: string, b: string) => katla(a).replace(/\s+/g, " ").trim() === katla(b).replace(/\s+/g, " ").trim();

// Uyarlamayı denetleyip uygular. Uygun değilse bankadaki yer aynen kalır; neden sunucu kaydı içindir.
export function uyarlamaUygula(
  yer: KonumYeri,
  u: KonumUyarlamasi | undefined,
  profil: YasProfili,
  cevaplar: string[] = []
): { yer: KonumYeri; neden: string | null } {
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
  const yeniAd = (ad: string) => yeni.includes(katla(ad)) && !banka.includes(katla(ad));
  const baskaYer = Object.entries(AYIRT_EDICI).find(([id, adlar]) => id !== yer.mekan_id && adlar.some(yeniAd));
  if (baskaYer) return reddet(`başka mekân: ${baskaYer[0]}`);
  // Noktanın adı yalnız son ipucunda söylenir; bilmece ya da 1. ipucu söylerse bilmece çözülmeden biter.
  const nokta = katla(yer.nokta).replace(/["“”']/g, "").trim();
  if (yeni.includes(nokta) && !katla(`${yer.bilmece} ${yer.ipucu_1}`).includes(nokta)) return reddet("nokta adı");
  if (cevaplar.some((c) => yeni.includes(c) && !banka.includes(c))) return reddet("cevap");
  if (metinleriTara([{ metin: bilmece, yer: "bilmece" }, { metin: ipucu1, yer: "ipucu" }]).length > 0) return reddet("güvenlik");
  return { yer: { ...yer, bilmece, ipucu_1: ipucu1 }, neden: null };
}

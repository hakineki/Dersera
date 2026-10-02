import { createHash } from "crypto";
import { mekanBilmeceleri } from "@/data/konumBilmeceleri";
import { MEKANLAR, mekanOf } from "@/data/mekanlar";
import { katla, metinleriTara } from "@/lib/composer/cocukGuvenligi";
import type { KonumYeri } from "@/lib/composer/definition";
import type { RotaSecimi } from "@/lib/composer/input";
import { gorunmezleriAt } from "@/lib/composer/kaynak";
import { MEKAN_SINIRLARI, ogretmenNoktasiIpucu } from "@/lib/mekan";
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
// bankasından bir bilmece seçilir (öğretmen noktayı yazdıysa seçilmez: ogretmenNoktasiYeri). Görev doldurma (rehber
// bilmeceyi uyarlar ya da yazar) ve tanıma dönüşüm aynı girdiden aynı yerleri bulur.
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
export const ogretmenNoktasiMi = (y: KonumYeri): boolean => y.ipucu_2 === ogretmenNoktasiIpucu(y.nokta);
export function ogretmenNoktasiYeri(mekanId: string, mekanAdi: string, nokta: string): KonumYeri {
  return {
    mekan_id: mekanId,
    mekan_adi: mekanAdi,
    nokta,
    bilmece: "Bu mekânda öğretmeninin seçtiği bir noktadayım. Etrafına dikkatle bak; gözden kaçan ayrıntılarda saklanırım.",
    ipucu_1: "Mekânda yavaşça dolaş; çevrendeki eşyalara ve köşelere yakından bak.",
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
const kacis = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Sözcük başında geçiyor mu: Türkçe ekler sayılır ("masa" → "masanın"), sözcük içi sayılmaz ("su" → "bulursun").
const sozcukBasinda = (metin: string, aranan: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${kacis(aranan)}`, "u").test(metin);

// Uyarlamayı denetleyip uygular. Uygun değilse gelen yer aynen kalır (bankadaki metin ya da öğretmen noktasında genel
// metin); neden sunucu kaydı içindir.
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
  // Bankada zaten geçen sözcükler (başka mekân adı, cevap) muaftır. Öğretmen noktasında bilmece ve 1. ipucu genel yedek
  // metindir, muafiyet yalnız öğretmenin tarifinden gelir.
  const ogretmen = ogretmenNoktasiMi(yer);
  const banka = katla((ogretmen ? [yer.nokta] : [yer.nokta, yer.bilmece, yer.ipucu_1, yer.ipucu_2]).join(" "));
  const yeni = katla(`${bilmece} ${ipucu1}`);
  const yeniAd = (ad: string) => yeni.includes(katla(ad)) && !banka.includes(katla(ad));
  const baskaYer = Object.entries(AYIRT_EDICI).find(([id, adlar]) => id !== yer.mekan_id && adlar.some(yeniAd));
  if (baskaYer) return reddet(`başka mekân: ${baskaYer[0]}`);
  // Noktanın adı yalnız son ipucunda söylenir; bilmece ya da 1. ipucu söylerse bilmece çözülmeden biter.
  // Tırnak ve kesme işaretleri (telefonun yazdığı ’ dahil) karşılaştırmada sayılmaz: "Atatürk'ün" = "Atatürk’ün".
  const tirnaksiz = (s: string) => katla(s).replace(/["“”'’‘]/g, "").trim();
  const nokta = tirnaksiz(yer.nokta);
  const bankaBilmecesi = ogretmen ? "" : tirnaksiz(`${yer.bilmece} ${yer.ipucu_1}`);
  if (sozcukBasinda(tirnaksiz(`${bilmece} ${ipucu1}`), nokta) && !bankaBilmecesi.includes(nokta)) return reddet("nokta adı");
  if (cevaplar.some((c) => yeni.includes(c) && !banka.includes(c))) return reddet("cevap");
  if (metinleriTara([{ metin: bilmece, yer: "bilmece" }, { metin: ipucu1, yer: "ipucu" }]).length > 0) return reddet("güvenlik");
  return { yer: { ...yer, bilmece, ipucu_1: ipucu1 }, neden: null };
}

// Yapay zekâyla güncelleme (mekân rotası): öğretmenin talimatı konumu istediyse rehber yeni nokta ve/veya bilmece yazar
// (boş metin = değişmez). Mekân değişmez. Yeni nokta öğretmen noktası gibi işlenir: son ipucu "QR'ı burada ara: <nokta>",
// bilmece uyarlama denetiminden geçmezse genel metin kalır. Sonra hâlâ boş alan varsa (öğretmen Düzenle'de silmiş olabilir)
// doldurulur ki oyun yayına çıkabilsin: nokta varsa genel metinle, yoksa mekânın bankasından.
export interface KonumGuncellemesi {
  konum_nokta: string;
  konum_bilmece: string;
  konum_ipucu_1: string;
}

const tekSatir = (s: string | undefined) =>
  gorunmezleriAt(s ?? "")
    .replace(/[\u00AD\u2060-\u2064]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Modelin önerdiği nokta benimsenmeden denetlenir: noktanın kendisi de öğrenciye gösterilir (son ipucu) ve bilmecenin
// muafiyet kaynağı olur. Başka bir mekânı anan nokta mekânı fiilen değiştirir; görev cevabını içeren nokta cevabı
// takım durağa varmadan söyler.
function noktaNedeni(nokta: string, yer: KonumYeri, cevaplar: string[]): string | null {
  if (nokta.length > MEKAN_SINIRLARI.noktaEnCok) return "nokta uzun";
  const n = katla(nokta);
  const kendi = katla(`${yer.mekan_adi} ${yer.nokta}`);
  const baska = Object.entries(AYIRT_EDICI).find(([id, adlar]) => id !== yer.mekan_id && adlar.some((a) => n.includes(katla(a)) && !kendi.includes(katla(a))));
  if (baska) return `nokta başka mekân: ${baska[0]}`;
  if (cevaplar.some((c) => n.includes(c) && !kendi.includes(c))) return "nokta cevap";
  if (metinleriTara([{ metin: nokta, yer: "nokta" }]).length > 0) return "nokta güvenlik";
  return null;
}

export function konumGuncelle(
  yer: KonumYeri,
  k: Partial<KonumGuncellemesi>,
  profil: YasProfili,
  cevaplar: string[],
  anahtar: string
): { yer: KonumYeri; neden: string | null; dolduruldu: "genel" | "banka" | null } {
  const nokta = tekSatir(k.konum_nokta);
  let taban = yer;
  if (nokta && katla(nokta) !== katla(yer.nokta.trim())) {
    // Nokta alınmazsa yeni noktaya göre yazılmış bilmece de alınmaz (eski noktayı anlatmaz).
    const n = noktaNedeni(nokta, yer, cevaplar);
    if (n) {
      const d = eksikleriDoldur(yer, anahtar);
      return { yer: d.yer, neden: n, dolduruldu: d.kaynak };
    }
    taban = ogretmenNoktasiYeri(yer.mekan_id, yer.mekan_adi, nokta);
  }
  // Yeni noktada bilmece yazılmadıysa genel metin kalır: öğretmen bunu da uyarıda görür.
  const genel = taban !== yer ? ("genel" as const) : null;
  // Eksik parçalar önce tamamlanır (bankadaki kayıt ya da genel metin); rehberin metni bunun üstüne denetlenir.
  const tam = eksikleriDoldur(taban, anahtar);
  const dolduruldu = tam.kaynak ?? genel;
  // Nokta boşken bankadan seçilen noktayı, nokta vermeden yazılmış bir bilmece anlatmaz.
  if (!taban.nokta.trim()) return { yer: tam.yer, neden: null, dolduruldu };
  const bilmece = tekSatir(k.konum_bilmece) || tam.yer.bilmece.trim();
  const ipucu1 = tekSatir(k.konum_ipucu_1) || tam.yer.ipucu_1.trim();
  // Değişmeyen metin (model mevcut konumu aynen döndürdü) yeniden denetlenmez.
  if (ayni(bilmece, tam.yer.bilmece) && ayni(ipucu1, tam.yer.ipucu_1)) return { yer: tam.yer, neden: null, dolduruldu };
  const r = uyarlamaUygula(tam.yer, { bilmece, ipucu_1: ipucu1 }, profil, cevaplar);
  return { yer: r.yer, neden: r.neden, dolduruldu: r.neden ? dolduruldu : null };
}

// Boş kalan konum alanları: nokta yoksa mekânın bankasından bir bilmece; nokta bankadaki bir noktaysa o kaydın metni,
// değilse genel metin. Mekân bilinmiyorsa dokunulmaz (doğrulama "konum bilmecesi eksik" der).
function eksikleriDoldur(y: KonumYeri, anahtar: string): { yer: KonumYeri; kaynak: "genel" | "banka" | null } {
  const m = mekanOf(y.mekan_id);
  if (!m) return { yer: y, kaynak: null };
  const ad = y.mekan_adi.trim() || m.ad;
  if (!y.nokta.trim()) return { yer: { ...konumYeri(m.id, anahtar), mekan_adi: ad }, kaynak: "banka" };
  if ([y.mekan_adi, y.bilmece, y.ipucu_1, y.ipucu_2].every((s) => s.trim())) return { yer: y, kaynak: null };
  const b = mekanBilmeceleri(m.id).find((x) => katla(x.nokta) === katla(y.nokta.trim()));
  const g = b ? { bilmece: b.bilmece, ipucu_1: b.ipucu1, ipucu_2: b.ipucu2 } : ogretmenNoktasiYeri(m.id, ad, y.nokta.trim());
  const yeni = {
    ...y,
    mekan_adi: ad,
    bilmece: y.bilmece.trim() ? y.bilmece : g.bilmece,
    ipucu_1: y.ipucu_1.trim() ? y.ipucu_1 : g.ipucu_1,
    ipucu_2: y.ipucu_2.trim() ? y.ipucu_2 : g.ipucu_2,
  };
  return { yer: yeni, kaynak: b ? "banka" : "genel" };
}

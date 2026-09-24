import { normalize, parseNumber } from "@/lib/composer/answers";
import { cocukGuvenligiTara, KATEGORI_ADI, metinleriTara, type GuvenlikEslesmesi } from "@/lib/composer/cocukGuvenligi";
import type { GameDefinition } from "@/lib/composer/definition";
import type { ValidationResult } from "@/lib/composer/validator";

// İçerik yönetişimi: her Composer çıktısı, düzenleme ve yayın aynı 8 kapıdan geçer (docs/URUN-BAGLAMI.md §9).
// Sonuç PASS / REVIEW / BLOCK. BLOCK yayını durdurur; REVIEW öğretmene gösterilir ve oyunu topluluğa otomatik
// göndermez. Saf ve deterministiktir: sunucu yayında, istemci önizlemede aynı sonucu hesaplar.

export type Karar = "PASS" | "REVIEW" | "BLOCK";

export const KAPILAR = [
  { id: "sema", ad: "Şema" },
  { id: "mufredat", ad: "Müfredat" },
  { id: "oyun-mantigi", ad: "Oyun mantığı" },
  { id: "ogrenme-kalitesi", ad: "Öğrenme kalitesi" },
  { id: "oyun-kalitesi", ad: "Oyun kalitesi" },
  { id: "cocuk-guvenligi", ad: "Çocuk güvenliği" },
  { id: "benzerlik", ad: "Benzerlik / kopya" },
  { id: "ekonomi", ad: "Ekonomi / kötüye kullanım" },
] as const;
export type KapiId = (typeof KAPILAR)[number]["id"];

export interface Bulgu {
  kod: string;
  mesaj: string;
  karar: Exclude<Karar, "PASS">;
  durakId?: string;
}

export interface KapiSonucu {
  kapi: KapiId;
  karar: Karar;
  bulgular: Bulgu[];
  // Kararı etkilemeyen bilgi (ör. yapı hedefinden sapma, bu bağlamda uygulanmayan kapı).
  notlar: string[];
}

export interface YonetisimSonucu {
  karar: Karar;
  kapilar: KapiSonucu[];
}

const SIRA: Record<Karar, number> = { PASS: 0, REVIEW: 1, BLOCK: 2 };
export const enAgir = (kararlar: Karar[]): Karar => kararlar.reduce<Karar>((a, b) => (SIRA[b] > SIRA[a] ? b : a), "PASS");

// Doğrulayıcı hata kodlarının kapıları; listede olmayan kod oyun mantığı kapısına düşer.
const HATA_KAPISI: Record<string, KapiId> = {
  "durak-yok": "sema",
  "durak-fazla": "sema",
  "nesne-fazla": "sema",
  "metin-uzun": "sema",
  "secenek-fazla": "sema",
  "durak-id-tekrar": "sema",
  "durak-id-bicim": "sema",
  "nesne-id-tekrar": "sema",
  "hedef-disi": "mufredat",
  "ders-eksik": "mufredat",
  "soru-bos": "ogrenme-kalitesi",
  "cevap-bicimi": "ogrenme-kalitesi",
  "ipucu-eksik": "ogrenme-kalitesi",
  "ipucu-ayni": "ogrenme-kalitesi",
  "destek-eksik": "ogrenme-kalitesi",
  "destek-aciklama": "ogrenme-kalitesi",
  "final-eksik": "ogrenme-kalitesi",
  "final-cevap": "ogrenme-kalitesi",
  "final-bagimsiz": "ogrenme-kalitesi",
};
// Tarif sapması uyarıları yayını etkilemez; oyun kalitesi notu olarak gösterilir.
const NOT_UYARILARI = new Set(["gorev-sayisi", "secim-sayisi"]);

type Toplayici = Record<KapiId, { bulgular: Bulgu[]; notlar: string[] }>;

// Aynı soru birden çok görevde: öğrenme tekrar değil, üretim hatasıdır.
function tekrarlananSorular(def: GameDefinition, ekle: (b: Bulgu) => void) {
  const gorulen = new Map<string, string>();
  for (const d of def.duraklar) {
    const s = normalize(d.gorev.soru);
    if (!s) continue;
    const onceki = gorulen.get(s);
    if (onceki) ekle({ kod: "soru-tekrar", karar: "REVIEW", durakId: d.id, mesaj: `"${d.isim}" görevinin sorusu "${onceki}" durağındakiyle aynı.` });
    else gorulen.set(s, d.isim);
  }
}

// Metindeki sayılar. Sıra sayısı ("2. yasa", "3.'sü") alınmaz; "1.000" binlik, "9,8" ve "9.8" ondalık okunur.
export function metindekiSayilar(metin: string): number[] {
  const out: number[] = [];
  for (const m of metin.matchAll(/(?<![\p{L}\p{N}])-?\d+(?:[.,]\d+)*(?![\p{L}\p{N}])/gu)) {
    const ham = m[0];
    const sonra = metin.slice(m.index + ham.length);
    // Sıra sayısı: noktadan sonra küçük harfle devam ("2. yasa") ya da kesme ("3.'sü"). Cümle sonu ("Cevap 12.") sayıdır.
    if (/^\.(\s+\p{Ll}|['’])/u.test(sonra)) continue;
    if (/^-?\d{1,3}(\.\d{3})+$/.test(ham)) out.push(Number(ham.replace(/\./g, "")));
    else {
      const n = parseNumber(ham);
      if (n !== null) out.push(n);
    }
  }
  return out;
}

// İpucu doğru cevabı açıkça söylüyorsa görev öğretmez. Cevap soruda zaten geçiyorsa ipucunda geçmesi sızıntı değildir.
function cevabiVerenIpuclari(def: GameDefinition, ekle: (b: Bulgu) => void) {
  for (const d of def.duraklar) {
    const g = d.gorev;
    const ipuclari = [g.ipucu_1, g.ipucu_2].map(normalize);
    let sizdi = false;
    if (g.tur === "sayisal") {
      const cevap = parseNumber(g.dogru_cevap);
      // Büyük/küçük harf sıra sayısı ayrımında gerektiğinden ham metin kullanılır.
      sizdi = cevap !== null && !metindekiSayilar(g.soru).includes(cevap) && [g.ipucu_1, g.ipucu_2].some((i) => metindekiSayilar(i).includes(cevap));
    } else if (g.tur === "coktan_secmeli" || g.tur === "gorsel_secim") {
      const cevap = normalize(g.dogru_cevap);
      sizdi = cevap.length >= 4 && !normalize(g.soru).includes(cevap) && ipuclari.some((i) => i.includes(cevap));
    }
    if (sizdi) ekle({ kod: "ipucu-cevap", karar: "REVIEW", durakId: d.id, mesaj: `"${d.isim}" görevinin ipucu doğru cevabı açıkça söylüyor.` });
  }
}

function bosHikayeler(def: GameDefinition, ekle: (b: Bulgu) => void) {
  if (!def.hikaye_giris.trim()) ekle({ kod: "giris-bos", karar: "REVIEW", mesaj: "Oyunun giriş hikâyesi boş." });
  for (const d of def.duraklar) {
    if (!d.hikaye_metni.trim()) ekle({ kod: "hikaye-bos", karar: "REVIEW", durakId: d.id, mesaj: `"${d.isim}" durağının hikâye metni boş.` });
  }
}

function guvenlikBulgusu(e: GuvenlikEslesmesi): Bulgu {
  return {
    kod: `guvenlik-${e.kategori}`,
    karar: e.engel ? "BLOCK" : "REVIEW",
    durakId: e.durakId,
    mesaj: `${e.yer}: "${e.terim}" ifadesi (${KATEGORI_ADI[e.kategori]}) ${e.engel ? "öğrenci oyununda kullanılamaz" : "yaşa uygunluk açısından gözden geçirilmeli"}.`,
  };
}

// Composer öncesi (klasik) oyunun öğretmence yazılabilen durak adı ve hikâyesi: yalnız engelleyen ifadeler aranır.
export function klasikDurakEngelleri(stops: { qr: number; name: string; hikaye: string }[]): Bulgu[] {
  const metinler = stops.flatMap((s) => [
    { metin: s.name, yer: `${s.qr}. durak · ad` },
    { metin: s.hikaye, yer: `${s.qr}. durak · hikâye` },
  ]);
  return metinleriTara(metinler).filter((e) => e.engel).map(guvenlikBulgusu);
}

// Topluluk listesinde yalnız özet görünür: başlık ve konuda engelleyen ifade varsa öğe gösterilmez.
export function ozetEngelli(o: { baslik: string; konu: string }): boolean {
  return metinleriTara([{ metin: `${o.baslik}\n${o.konu}`, yer: "özet" }]).some((e) => e.engel);
}

// Tanım şemadan geçmiş olmalıdır (şemadan geçmeyen tanım bu noktaya gelmeden 422 ile reddedilir).
export function yonetisimDegerlendir(def: GameDefinition, validation: ValidationResult): YonetisimSonucu {
  const t = Object.fromEntries(KAPILAR.map((k) => [k.id, { bulgular: [], notlar: [] }])) as unknown as Toplayici;
  const ekle = (kapi: KapiId) => (b: Bulgu) => t[kapi].bulgular.push(b);

  for (const h of validation.hatalar) ekle(HATA_KAPISI[h.kod] ?? "oyun-mantigi")({ ...h, karar: "BLOCK" });
  for (const u of validation.uyarilar) if (NOT_UYARILARI.has(u.kod)) t["oyun-kalitesi"].notlar.push(u.mesaj);

  tekrarlananSorular(def, ekle("ogrenme-kalitesi"));
  cevabiVerenIpuclari(def, ekle("ogrenme-kalitesi"));
  bosHikayeler(def, ekle("oyun-kalitesi"));

  cocukGuvenligiTara(def).map(guvenlikBulgusu).forEach(ekle("cocuk-guvenligi"));

  if (t.sema.bulgular.length === 0) t.sema.notlar.push("Oyun tanımı şemaya ve boyut sınırlarına uygun.");
  t.benzerlik.notlar.push("Sınıf yayınında uygulanmaz.");
  t.ekonomi.notlar.push("Oluşturma sınırları üretim sırasında denetlenir.");

  const kapilar = KAPILAR.map(({ id }) => ({ kapi: id, karar: enAgir(t[id].bulgular.map((b) => b.karar)), ...t[id] }));
  return { karar: enAgir(kapilar.map((k) => k.karar)), kapilar };
}

// Önizleme rozetleri (docs/URUN-BAGLAMI.md §11). Yayına Uygunluk genel karardır.
export const ROZETLER = ["Müfredat Uyumu", "Oyun Mantığı", "Öğrenme Kalitesi", "Çocuk Güvenliği", "Yayına Uygunluk"] as const;
const ROZET_KAPILARI: Record<Exclude<(typeof ROZETLER)[number], "Yayına Uygunluk">, KapiId[]> = {
  "Müfredat Uyumu": ["sema", "mufredat"],
  // Oyun kalitesi (ör. boş hikâye) oyunun akışıyla birlikte gösterilir.
  "Oyun Mantığı": ["oyun-mantigi", "oyun-kalitesi"],
  "Öğrenme Kalitesi": ["ogrenme-kalitesi"],
  "Çocuk Güvenliği": ["cocuk-guvenligi"],
};

export function rozetler(s: YonetisimSonucu): { ad: (typeof ROZETLER)[number]; karar: Karar }[] {
  const kapiKarari = (id: KapiId) => s.kapilar.find((k) => k.kapi === id)!.karar;
  return ROZETLER.map((ad) => ({ ad, karar: ad === "Yayına Uygunluk" ? s.karar : enAgir(ROZET_KAPILARI[ad].map(kapiKarari)) }));
}

// Doğrulayıcıdan gelmeyen (yönetişimin kendi eklediği) bulgular; önizleme doğrulama hatalarını zaten ayrıca gösterir.
export function ekBulgular(s: YonetisimSonucu, validation: ValidationResult): (Bulgu & { kapi: KapiId })[] {
  const dogrulamaKodlari = new Set(validation.hatalar.map((h) => `${h.kod}|${h.durakId ?? ""}|${h.mesaj}`));
  return s.kapilar.flatMap((k) => k.bulgular.filter((b) => !dogrulamaKodlari.has(`${b.kod}|${b.durakId ?? ""}|${b.mesaj}`)).map((b) => ({ ...b, kapi: k.kapi })));
}

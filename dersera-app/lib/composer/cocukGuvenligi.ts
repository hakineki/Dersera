import type { GameDefinition } from "@/lib/composer/definition";

// Çocuk güvenliği kapısının deterministik ilk katmanı: oyun metinlerinde K12 için uygunsuz ifade taraması.
// Bağlam önemlidir (biyolojide üreme, tarihte savaş/katliam, kimyada "(aq)", edebiyatta "esrar" otomatik düşmez):
// müfredatta meşru anlamı olan kelimeler listede yoktur, kökler dar tutulur. Yalnız müfredatta karşılığı olmayan
// küfür ve müstehcenlik yayını engeller; diğer eşleşmeler öğretmenin gözden geçirmesi için işaretlenir.
// Liste bilinçli olarak dardır: yanlış alarm öğretmenin güvenini kaybettirir; kalan kaçaklar yapay zekâ katmanının işidir.

export type GuvenlikKategorisi = "kufur" | "nefret" | "cinsel" | "kumar" | "madde" | "siddet" | "kendine-zarar" | "zorbalik" | "kisisel-veri";

export const KATEGORI_ADI: Record<GuvenlikKategorisi, string> = {
  kufur: "küfür / hakaret",
  nefret: "nefret / ayrımcılık",
  cinsel: "cinsel içerik",
  kumar: "kumar / bahis",
  madde: "uyuşturucu, alkol veya tütün",
  siddet: "aşırı şiddet",
  "kendine-zarar": "kendine zarar",
  zorbalik: "zorbalık / aşağılama",
  "kisisel-veri": "kişisel veri isteme",
};

interface Kural {
  kategori: GuvenlikKategorisi;
  // true: yayını engeller (BLOCK); false: gözden geçirme ister (REVIEW).
  engel: boolean;
  // tam: kelimenin kendisi; kok: kelime bu kökle başlar (Türkçe ekler için);
  // ifade: art arda kelimeler, "|" ile seçenekli. Son kelime kök olarak, öncekiler yalın ya da isim ekiyle
  // (belirtme/çoğul: "şarabı", "sigarayı", "alkolü") eşleşir.
  tam?: string[];
  kok?: string[];
  ifade?: string[];
}

// Karşılaştırma katlanmış biçimde yapılır: Türkçe küçük harf + ı/â/î/û sadeleştirme ("SIKTIR", "Gerizekâlı" yakalanır).
export function katla(s: string): string {
  return s
    .normalize("NFC")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/â/g, "a")
    .replace(/[îì]/g, "i")
    .replace(/û/g, "u");
}

const HAM_KURALLAR: Kural[] = [
  { kategori: "kufur", engel: true, tam: ["amk"], kok: ["siktir", "sikey", "orospu", "amcik", "pezevenk", "yavşak"], ifade: ["amina koy", "anani sik"] },
  { kategori: "kufur", engel: false, tam: ["piç", "kahpe"] },
  { kategori: "nefret", engel: true, kok: ["ibne"] },
  { kategori: "cinsel", engel: true, kok: ["porno", "erotik"] },
  { kategori: "cinsel", engel: false, tam: ["seks", "seksi"] },
  { kategori: "kumar", engel: false, kok: ["kumar", "iddaa", "rulet"], ifade: ["bahis oyna", "bahis sitesi", "bahis kupon"] },
  // Sigara/alkol sağlık derslerinde geçer: yalnız kullanım eylemi ("sigarayı yaktı", "şarabı içti") işaretlenir, öğretmen
  // bağlamı değerlendirir. Fiil çekimleri açıkça sayılır: "alkol içeren", "biraz içeri", "alkol için" eşleşmesin.
  {
    kategori: "madde",
    engel: false,
    // "rakı" kök olamaz ("rakım" = yükselti); ekli hâli ifade içinde yakalanır.
    tam: ["rakı"],
    kok: ["votka", "viski", "eroin", "kokain", "esrarkeş", "bonzai", "ekstazi", "sarhoş"],
    ifade: [
      "sigara|içki|alkol|şarap|şarab|bira|rakı|votka|viski içti|içtik|içtim|içmek|içme|içiyor|içelim|içerek|içip|içen|içmiş|içsin|içebil|içecek",
      "sigara yaktı|yakmak|yakıyor|yakalım|yakıp|yakan|yaksın",
      "sigara tüttür",
    ],
  },
  { kategori: "siddet", engel: false, kok: ["boğazladı", "boğazlama", "boğazlay", "bıçakladı", "bıçaklama", "bıçaklay"], ifade: ["kafasını kes", "kan gölü", "işkence et", "işkence yap", "katliam yap", "vahşice öldür"] },
  { kategori: "kendine-zarar", engel: false, kok: ["intihar"], ifade: ["kendini öldür", "kendine zarar", "kendini kes"] },
  { kategori: "zorbalik", engel: false, kok: ["gerizekal", "salak", "aptal", "şişko"], ifade: ["geri zekal"] },
  { kategori: "kisisel-veri", engel: false, tam: ["şifreni", "parolanı", "şifrenizi", "parolanızı"], ifade: ["telefon numaran", "ev adresin", "tc kimlik", "kimlik numaran", "adresini yaz"] },
];
const KURALLAR: Kural[] = HAM_KURALLAR.map((k) => ({ ...k, tam: k.tam?.map(katla), kok: k.kok?.map(katla), ifade: k.ifade?.map(katla) }));

export interface GuvenlikEslesmesi {
  kategori: GuvenlikKategorisi;
  // Metinde geçen asıl kelime(ler) — öğretmen metinde arayabilsin.
  terim: string;
  engel: boolean;
  // Metnin geçtiği yer ve alan (öğretmene gösterilir) ve varsa durak kimliği.
  yer: string;
  durakId?: string;
}

export interface TaranacakMetin {
  metin: string;
  yer: string;
  durakId?: string;
}

const AYIRICI = /[^\p{L}\p{M}\p{N}]+/u;
// İfadenin ilk kelimelerine gelebilecek isim ekleri (katlanmış): belirtme, yönelme, çoğul, iyelik + belirtme.
// Kapalı liste: açık uçlu önek eşleşmesi "biraz", "rakım" gibi kelimelerde yanlış alarm verir.
const ISIM_EKLERI = new Set([
  "", "i", "u", "ü", "yi", "yu", "yü", "ni", "nu", "nü", "a", "e", "ya", "ye",
  "lar", "ler", "lari", "leri", "ini", "unu", "ünü", "sini", "sunu", "larini", "lerini", "larindan", "lerinden",
]);
const ekliMi = (kelime: string, kok: string) => kelime.startsWith(kok) && ISIM_EKLERI.has(kelime.slice(kok.length));

function ifadeBul(ks: string[], ifade: string): number {
  const parcalar = ifade.split(" ").map((p) => p.split("|"));
  const son = parcalar.length - 1;
  return ks.findIndex((_, j) =>
    parcalar.every((secenekler, n) => {
      const w = ks[j + n];
      return w !== undefined && secenekler.some((s) => (n === son ? w.startsWith(s) : ekliMi(w, s)));
    })
  );
}

function metinTara({ metin, yer, durakId }: TaranacakMetin, out: GuvenlikEslesmesi[]) {
  if (!metin.trim()) return;
  // Katlama harf başına bire bir olduğundan görünen ve katlanmış kelimeler aynı sırada kalır.
  const gorunen = metin.normalize("NFC").toLocaleLowerCase("tr-TR").split(AYIRICI).filter(Boolean);
  const ks = gorunen.map(katla);
  for (const k of KURALLAR) {
    let i = ks.findIndex((w) => k.tam?.includes(w) || k.kok?.some((t) => w.startsWith(t)));
    let uzunluk = 1;
    if (i < 0 && k.ifade) {
      for (const ifade of k.ifade) {
        i = ifadeBul(ks, ifade);
        if (i >= 0) {
          uzunluk = ifade.split(" ").length;
          break;
        }
      }
    }
    if (i >= 0 && !out.some((e) => e.yer === yer && e.kategori === k.kategori && e.engel === k.engel)) {
      out.push({ kategori: k.kategori, terim: gorunen.slice(i, i + uzunluk).join(" "), engel: k.engel, yer, durakId });
    }
  }
}

export function metinleriTara(metinler: TaranacakMetin[]): GuvenlikEslesmesi[] {
  const out: GuvenlikEslesmesi[] = [];
  metinler.forEach((m) => metinTara(m, out));
  return out;
}

// Öğrencinin göreceği bütün metinler, alan adıyla birlikte taranır.
export function cocukGuvenligiTara(def: GameDefinition): GuvenlikEslesmesi[] {
  const metinler: TaranacakMetin[] = [];
  const ekle = (yer: string, durakId: string | undefined, alanlar: [string, string | string[]][]) => {
    for (const [alan, deger] of alanlar) {
      metinler.push({ metin: Array.isArray(deger) ? deger.join("\n") : deger, yer: `${yer} · ${alan}`, durakId });
    }
  };
  ekle("Oyun girişi", undefined, [
    ["başlık", def.meta.baslik],
    ["giriş hikâyesi", def.hikaye_giris],
    ["oyunun amacı", def.oyun_amaci],
    ["nesneler", def.envanter.map((e) => e.isim)],
  ]);
  for (const d of def.duraklar) {
    const g = d.gorev;
    ekle(`"${d.isim}" durağı`, d.id, [
      ["durak adı", d.isim],
      ["hikâye", d.hikaye_metni],
      ["yol tarifi", d.mekan.sonraki_durak_tarifi],
      ["soru", g.soru],
      ["seçenekler", [...g.secenekler, g.dogru_cevap]],
      ["ipuçları", [g.ipucu_1, g.ipucu_2]],
      ["destek görevi", [g.destek_gorevi.soru, ...g.destek_gorevi.secenekler, g.destek_gorevi.aciklama]],
      ["seçimler", d.secimler.map((s) => s.metin)],
    ]);
  }
  const f = def.final;
  ekle("Final", undefined, [
    ["hikâye", f.hikaye_metni],
    ["soru", f.soru],
    ["seçenekler", [...f.secenekler, f.dogru_cevap]],
    ["başarı metni", f.basari_metni],
  ]);
  return metinleriTara(metinler);
}

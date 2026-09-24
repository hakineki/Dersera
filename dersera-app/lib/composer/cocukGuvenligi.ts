import type { GameDefinition } from "@/lib/composer/definition";

// Çocuk güvenliği kapısının deterministik ilk katmanı: oyun metinlerinde K12 için uygunsuz ifade taraması.
// Bağlam önemlidir (biyolojide üreme, tarihte savaş otomatik düşmez): bu yüzden müfredat terimleri listede yoktur
// ve yalnız açık küfür/hakaret yayını engeller; diğer eşleşmeler öğretmenin gözden geçirmesi için işaretlenir.
// Liste bilinçli olarak dardır; yanlış alarm öğretmenin güvenini kaybettirir.

export type GuvenlikKategorisi = "kufur" | "nefret" | "cinsel" | "kumar" | "madde" | "siddet" | "kendine-zarar" | "zorbalik" | "kisisel-veri";

export const KATEGORI_ADI: Record<GuvenlikKategorisi, string> = {
  kufur: "küfür / hakaret",
  nefret: "nefret / ayrımcılık",
  cinsel: "cinsel içerik",
  kumar: "kumar / bahis",
  madde: "uyuşturucu, alkol veya tütün",
  siddet: "aşırı şiddet / korku",
  "kendine-zarar": "kendine zarar",
  zorbalik: "zorbalık / aşağılama",
  "kisisel-veri": "kişisel veri isteme",
};

interface Kural {
  kategori: GuvenlikKategorisi;
  // true: yayını engeller (BLOCK); false: gözden geçirme ister (REVIEW).
  engel: boolean;
  // tam: kelimenin kendisi; kok: kelime bu kökle başlar (Türkçe ekler için); ifade: art arda kelimeler.
  tam?: string[];
  kok?: string[];
  ifade?: string[];
}

const KURALLAR: Kural[] = [
  { kategori: "kufur", engel: true, tam: ["amk", "aq", "piç", "oç"], kok: ["siktir", "sikey", "orospu", "yavşak", "amına", "amcık", "pezevenk", "kahpe"] },
  { kategori: "nefret", engel: true, kok: ["ibne"] },
  { kategori: "cinsel", engel: false, tam: ["seks", "seksi", "çıplak"], kok: ["porno", "erotik"] },
  { kategori: "kumar", engel: false, kok: ["kumar", "bahis", "iddaa", "rulet"] },
  // "esrar" tam eşleşir: "esrarengiz" macera metinlerinde sık geçer.
  { kategori: "madde", engel: false, tam: ["esrar", "bira", "rakı", "votka", "viski"], kok: ["uyuşturucu", "eroin", "kokain", "esrarkeş", "bonzai", "ekstazi", "sarhoş", "sigara", "şarap"] },
  { kategori: "siddet", engel: false, kok: ["işkence", "vahşet", "katliam", "bıçakla", "boğazla"], ifade: ["kafasını kes", "kan gölü"] },
  { kategori: "kendine-zarar", engel: false, kok: ["intihar"], ifade: ["kendini öldür", "kendine zarar", "kendini kes"] },
  { kategori: "zorbalik", engel: false, kok: ["gerizekalı", "salak", "aptal", "şişko", "ezik"] },
  { kategori: "kisisel-veri", engel: false, kok: ["şifreni", "parolanı"], ifade: ["telefon numara", "ev adres", "tc kimlik", "kimlik numara", "adresini yaz"] },
];

export interface GuvenlikEslesmesi {
  kategori: GuvenlikKategorisi;
  terim: string;
  engel: boolean;
  // Metnin geçtiği yer (öğretmene gösterilir) ve varsa durak kimliği.
  yer: string;
  durakId?: string;
}

const kucuk = (s: string) => s.toLocaleLowerCase("tr-TR");
const kelimeler = (s: string) => kucuk(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

function metinTara(metin: string, yer: string, durakId: string | undefined, out: GuvenlikEslesmesi[]) {
  if (!metin.trim()) return;
  const ks = kelimeler(metin);
  const dizi = ` ${ks.join(" ")} `;
  for (const k of KURALLAR) {
    const bul = (terim: string) => out.push({ kategori: k.kategori, terim, engel: k.engel, yer, durakId });
    const tam = k.tam?.find((t) => ks.includes(t));
    const kok = k.kok?.find((t) => ks.some((w) => w.startsWith(t)));
    const ifade = k.ifade?.find((t) => dizi.includes(` ${t}`));
    const terim = tam ?? kok ?? ifade;
    if (terim) bul(terim);
  }
}

// Öğrencinin göreceği bütün metinler taranır; her yer + kategori bir kez raporlanır.
export function cocukGuvenligiTara(def: GameDefinition): GuvenlikEslesmesi[] {
  const out: GuvenlikEslesmesi[] = [];
  const tara = (metinler: string[], yer: string, durakId?: string) => metinTara(metinler.join("\n"), yer, durakId, out);
  tara([def.meta.baslik, def.hikaye_giris, def.oyun_amaci, ...def.envanter.map((e) => e.isim)], "Oyun girişi");
  for (const d of def.duraklar) {
    const g = d.gorev;
    tara(
      [
        d.isim,
        d.hikaye_metni,
        d.mekan.sonraki_durak_tarifi,
        g.soru,
        ...g.secenekler,
        g.dogru_cevap,
        g.ipucu_1,
        g.ipucu_2,
        g.destek_gorevi.soru,
        ...g.destek_gorevi.secenekler,
        g.destek_gorevi.aciklama,
        ...d.secimler.map((s) => s.metin),
      ],
      `"${d.isim}" durağı`,
      d.id
    );
  }
  const f = def.final;
  tara([f.hikaye_metni, f.soru, ...f.secenekler, f.dogru_cevap, f.basari_metni], "Final");
  return out;
}

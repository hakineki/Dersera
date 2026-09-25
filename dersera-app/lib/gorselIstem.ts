import type { Durak, GameDefinition } from "@/lib/composer/definition";
import { gorunmezleriAt } from "@/lib/composer/kaynak";
import { GORSEL, KAPAK } from "@/lib/gorsel";
import { yasProfiliOf, type YasProfili } from "@/lib/yasProfili";

// Görsel istemleri yalnız sunucuda, üretilmiş oyun tanımından kurulur (istemci istem gönderemez). İçerik kuralları her
// istemde sabittir: yazı yok, gerçek kişi yok, okulda gösterilebilir. Sağlayıcının kendi güvenlik süzgeci ayrıca çalışır.

export interface GorselHedefi {
  hedef: string;
  istem: string;
}

const TARZ: Record<YasProfili, string> = {
  PRESCHOOL_3_5: "yumuşak, sevimli ve çok sade şekilli; iri, yuvarlak karakterler",
  PRIMARY_6_10: "sevimli ve renkli; sade arka plan, iri ve anlaşılır nesneler",
  MIDDLE_11_14: "canlı bir macera havası; ayrıntılı ama karmaşık olmayan sahne",
  HIGH_15_18: "yarı gerçekçi, olgun ve sinematik; gençlere hitap eden",
};

const KURALLAR = [
  "Görselde hiçbir yazı, harf, rakam, logo ya da marka olmasın.",
  "Gerçek ya da tanınmış kişiler, gerçek kurum ve bayraklar çizilmesin.",
  "Şiddet, kan, korku, silah ya da yetişkinlere yönelik içerik olmasın; okulda çocuklara gösterilmeye uygun olsun.",
];

const kisalt = (s: string, n: number) => {
  const t = gorunmezleriAt(s).replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

function istem(def: GameDefinition, sahne: string): string {
  return [
    "Çocuklar için eğitsel bir macera oyununa tek bir illüstrasyon çiz.",
    `Tarz: sıcak renkli dijital çocuk kitabı illüstrasyonu; ${TARZ[yasProfiliOf(def.meta.sinif)]}. Yatay kadraj.`,
    ...KURALLAR,
    `Oyun: ${kisalt(def.meta.baslik, 120)} (${kisalt(def.meta.ders, 60)} · ${kisalt(def.meta.konu, 120)}).`,
    sahne,
  ].join("\n");
}

// Kapaktan sonra hikâyenin başı, ortası ve sonuna yakın üç durak; seçim sahneleri (yalnız karar metni) atlanır.
export function sahneDuraklari(def: GameDefinition): Durak[] {
  const adaylar = def.duraklar.filter((d) => d.sahne_turu !== "secim");
  const liste = adaylar.length >= GORSEL.sahne ? adaylar : def.duraklar;
  if (liste.length <= GORSEL.sahne) return liste;
  const idx = [0, Math.floor((liste.length - 1) / 2), liste.length - 1];
  return [...new Set(idx)].map((i) => liste[i]);
}

export function gorselIstemleri(def: GameDefinition): GorselHedefi[] {
  return [
    { hedef: KAPAK, istem: istem(def, `Kapak sahnesi: ${kisalt(def.hikaye_giris, 400)}`) },
    ...sahneDuraklari(def).map((d) => ({ hedef: d.id, istem: istem(def, `Sahne: ${kisalt(d.isim, 80)}. ${kisalt(d.hikaye_metni, 400)}`) })),
  ];
}

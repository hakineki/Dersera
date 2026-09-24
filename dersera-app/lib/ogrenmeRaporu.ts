import type { GameDefinition } from "@/lib/composer/definition";
import type { LeaderboardEntry } from "@/lib/gameState";

// Öğrenme raporu (docs/URUN-BAGLAMI.md çekirdek döngü: Player → Learning Data): composer oyununun sonuçlarından
// deterministik olarak hesaplanır, yapay zekâ kullanmaz. Composer oyununda durak başına kaydedilen sayı yanlış cevap
// sayısıdır: 1. yanlış ipucu 1, 2. yanlış ipucu 2, 3. yanlış destek görevi açar.

export const RAPOR_KURALLARI = {
  // Bir durak/hedef için bundan az öğrenci varsa oran yorumlanmaz.
  enAzOgrenci: 3,
  // İlk denemede doğru oranı: bu değerin üstü "iyi", altındaki eşiğin altı "zor".
  iyiEsigi: 0.7,
  zorEsigi: 0.4,
  destekYanlis: 3,
} as const;

export type Zorluk = "iyi" | "orta" | "zor" | "az-veri";

export interface DurakRaporu {
  id: string;
  isim: string;
  hedef: string;
  ulasan: number;
  ilkDenemeOrani: number | null;
  destekOrani: number | null;
  ortalamaYanlis: number | null;
  zorluk: Zorluk;
}

export interface HedefRaporu {
  kod: string;
  duraklar: string[];
  ulasan: number;
  ilkDenemeOrani: number | null;
  destekOrani: number | null;
  zorluk: Zorluk;
}

export interface OgrenmeRaporu {
  katilan: number | null;
  bitiren: number;
  // Oyuna katılıp bitirmeyen (sonucu gelmeyen) öğrenci; katılan bilinmiyorsa null.
  bitirmeyen: number | null;
  bitirmeOrani: number | null;
  medyanSureDk: number | null;
  duraklar: DurakRaporu[];
  // En çok zorlanılan önce.
  hedefler: HedefRaporu[];
}

const oran = (pay: number, payda: number) => (payda > 0 ? pay / payda : null);

function zorlukOf(ulasan: number, ilk: number | null): Zorluk {
  if (ulasan < RAPOR_KURALLARI.enAzOgrenci || ilk === null) return "az-veri";
  return ilk >= RAPOR_KURALLARI.iyiEsigi ? "iyi" : ilk < RAPOR_KURALLARI.zorEsigi ? "zor" : "orta";
}

function medyan(sayilar: number[]): number | null {
  if (sayilar.length === 0) return null;
  const s = [...sayilar].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const SIRA: Record<Zorluk, number> = { zor: 0, orta: 1, iyi: 2, "az-veri": 3 };

export function ogrenmeRaporu(def: GameDefinition, sonuclar: LeaderboardEntry[], katilan: number | null): OgrenmeRaporu {
  const duraklar: DurakRaporu[] = def.duraklar.map((d) => {
    const yanlislar = sonuclar.map((s) => s.stopDetails?.[d.id]?.hintsUsed).filter((x): x is number => typeof x === "number");
    const ulasan = yanlislar.length;
    const ilk = oran(yanlislar.filter((y) => y === 0).length, ulasan);
    return {
      id: d.id,
      isim: d.isim,
      hedef: d.gorev.ogrenme_hedefi,
      ulasan,
      ilkDenemeOrani: ilk,
      destekOrani: oran(yanlislar.filter((y) => y >= RAPOR_KURALLARI.destekYanlis).length, ulasan),
      ortalamaYanlis: oran(yanlislar.reduce((a, b) => a + b, 0), ulasan),
      zorluk: zorlukOf(ulasan, ilk),
    };
  });

  // Hedef bazında: o hedefi çalıştıran tüm durak denemeleri birlikte sayılır.
  const hedefMap = new Map<string, { duraklar: string[]; deneme: number; ilk: number; destek: number }>();
  for (const d of duraklar) {
    const h = hedefMap.get(d.hedef) ?? { duraklar: [], deneme: 0, ilk: 0, destek: 0 };
    h.duraklar.push(d.isim);
    h.deneme += d.ulasan;
    h.ilk += (d.ilkDenemeOrani ?? 0) * d.ulasan;
    h.destek += (d.destekOrani ?? 0) * d.ulasan;
    hedefMap.set(d.hedef, h);
  }
  const hedefler: HedefRaporu[] = [...hedefMap.entries()]
    .map(([kod, h]) => {
      const ilk = oran(Math.round(h.ilk), h.deneme);
      return { kod, duraklar: h.duraklar, ulasan: h.deneme, ilkDenemeOrani: ilk, destekOrani: oran(Math.round(h.destek), h.deneme), zorluk: zorlukOf(h.deneme, ilk) };
    })
    .sort((a, b) => SIRA[a.zorluk] - SIRA[b.zorluk] || (a.ilkDenemeOrani ?? 1) - (b.ilkDenemeOrani ?? 1));

  const bitiren = sonuclar.length;
  const katilanGecerli = katilan === null ? null : Math.max(katilan, bitiren);
  const sure = medyan(sonuclar.map((s) => s.netSeconds));
  return {
    katilan: katilanGecerli,
    bitiren,
    bitirmeyen: katilanGecerli === null ? null : katilanGecerli - bitiren,
    bitirmeOrani: katilanGecerli === null ? null : oran(bitiren, katilanGecerli),
    medyanSureDk: sure === null ? null : Math.round(sure / 6) / 10,
    duraklar,
    hedefler,
  };
}

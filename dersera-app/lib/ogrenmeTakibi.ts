import type { GameDefinition } from "@/lib/composer/definition";
import { SERBEST_NOT_MAX } from "@/lib/composer/limits";
import { alan } from "@/lib/ogrenme";
import { RAPOR_KURALLARI, type Zorluk } from "@/lib/ogrenmeRaporu";

// Öğretmenin öğrenme takibi (docs/URUN-BAGLAMI.md V2 "gelişmiş Learning Engine"): öğretmenin yayınladığı Composer
// oyunlarının öğrenci sonuçları öğrenme çıktısı (kazanım) ve görev türü bazında aylık sayaçlara yazılır. Tek oyunluk
// rapor (lib/ogrenmeRaporu.ts) sonuçlar silinince kaybolur; bu sayaçlar zaman içindeki gidişatı tutar. Öğrenci kimliği
// tutulmaz. Hesap deterministiktir, yapay zekâ kullanmaz. Bu dosya saf hesaptır; istemci de okur.

export const TAKIP = {
  // Pencere: seçilen ay ve önceki iki ay.
  aySayisi: 3,
  // Oran bu kadar denemeden azsa yorumlanmaz (tek oyunluk raporda eşik öğrenci sayısıdır; burada durak denemesi).
  enAzDeneme: 5,
  // İlk ve son veri olan ay arasında ilk denemede doğru oranı en az bu kadar değişirse gidişat yükseliyor/düşüyor.
  gidisatFarki: 0.1,
} as const;

// Çıktının programdaki yeri. Kod tek başına çıktıyı belirlemez (aynı kod farklı sınıf ve ünitelerde farklı metinle
// tekrar eder): sayaç ve rapor satırı ders + sınıf + ünite + koddur.
export interface KazanimYeri {
  ders: string;
  sinif: number;
  uniteId: string;
}
// Oyunun konularından çıktının yeri (sunucu müfredattan bulur); bulunamazsa o durak çıktı sayacına yazılmaz.
export type YerBulucu = (kod: string) => KazanimYeri | null;

const ciktiOnEki = (y: KazanimYeri, kod: string) => alan("k", y.ders, y.sinif, y.uniteId, kod);

// Öğrenci başına (oyun başına bir kez) sayılan alanlar: bitiren; çıktı (k|ders|sınıf|ünite|kod) ve görev türü (t|tür)
// için d = durak denemesi, i = ilk denemede doğru, s = destek görevi açıldı. Final görevi sayılmaz (tek oyunluk raporla
// aynı).
export function takipAlanlari(def: GameDefinition, durakYanlislari: Record<string, number>, yerOf: YerBulucu): string[] {
  const out = ["bitiren"];
  for (const d of def.duraklar) {
    const y = durakYanlislari[d.id];
    if (typeof y !== "number" || !Number.isFinite(y) || y < 0) continue;
    const yer = yerOf(d.gorev.ogrenme_hedefi);
    const onEkler = [alan("t", d.gorev.tur), ...(yer ? [ciktiOnEki(yer, d.gorev.ogrenme_hedefi)] : [])];
    for (const on of onEkler) {
      out.push(`${on}|d`);
      if (y === 0) out.push(`${on}|i`);
      if (y >= RAPOR_KURALLARI.destekYanlis) out.push(`${on}|s`);
    }
  }
  return out;
}

// Oyun başına bir kez (oyunun ilk sayılan öğrencisinde): oyun ve oyunun çalıştırdığı her çıktı.
export function oyunAlanlari(def: GameDefinition, yerOf: YerBulucu): string[] {
  const ciktilar = def.duraklar.flatMap((d) => {
    const yer = yerOf(d.gorev.ogrenme_hedefi);
    return yer ? [`${ciktiOnEki(yer, d.gorev.ogrenme_hedefi)}|o`] : [];
  });
  return ["oyun", ...new Set(ciktilar)];
}

export type Gidisat = "yukseliyor" | "dusuyor" | "sabit";

// Programdaki karşılığı (sunucu müfredattan doldurur); pekiştirme oyununun ders ve konusu buradan gelir.
export interface KazanimTanimi {
  metin: string;
  ders: string;
  dersAd: string;
  sinif: number;
  uniteId: string;
  uniteAd: string;
}

export interface Oranlar {
  deneme: number;
  ilkDenemeOrani: number | null;
  destekOrani: number | null;
}

export interface KazanimSatiri extends Oranlar {
  // Satırın tekil kimliği (ders|sınıf|ünite|kod).
  anahtar: string;
  kod: string;
  // Programda bulunamazsa null (yalnız kod gösterilir, pekiştirme önerilmez).
  tanim: KazanimTanimi | null;
  oyun: number;
  // Pencerenin her ayı için ilk denemede doğru oranı (az veride null), eskiden yeniye.
  aylar: (number | null)[];
  gidisat: Gidisat | null;
  zorluk: Zorluk;
}

export interface TurSatiri extends Oranlar {
  tur: string;
}

export interface TakipRaporu {
  aylar: string[];
  bitiren: number[];
  oyun: number[];
  // En çok zorlanılan önce.
  kazanimlar: KazanimSatiri[];
  turler: TurSatiri[];
}

export const oncekiAy = (ay: string) => {
  const [y, m] = ay.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};
export const sonrakiAy = (ay: string) => {
  const [y, m] = ay.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

// Eskiden yeniye: seçilen ay ve önceki aylar.
export function takipPenceresi(ay: string): string[] {
  const aylar = [ay];
  while (aylar.length < TAKIP.aySayisi) aylar.unshift(oncekiAy(aylar[0]));
  return aylar;
}

// onEk: "k|ders|sınıf|ünite|kod" ya da "t|tür"; alanlar onEk|d, onEk|i, onEk|s.
function oranlarOf(tablolar: Record<string, number>[], onEk: string): Oranlar {
  const topla = (x: string) => tablolar.reduce((a, t) => a + (t[`${onEk}|${x}`] ?? 0), 0);
  const deneme = topla("d");
  const yeterli = deneme >= TAKIP.enAzDeneme;
  return { deneme, ilkDenemeOrani: yeterli ? topla("i") / deneme : null, destekOrani: yeterli ? topla("s") / deneme : null };
}

function zorlukOf(ilk: number | null): Zorluk {
  if (ilk === null) return "az-veri";
  return ilk >= RAPOR_KURALLARI.iyiEsigi ? "iyi" : ilk < RAPOR_KURALLARI.zorEsigi ? "zor" : "orta";
}

// Veri olan ilk ve son ay karşılaştırılır; iki aydan azsa gidişat yok.
function gidisatOf(aylik: (number | null)[]): Gidisat | null {
  const v = aylik.filter((x): x is number => x !== null);
  if (v.length < 2) return null;
  const fark = Math.round((v[v.length - 1] - v[0]) * 1000) / 1000;
  return fark >= TAKIP.gidisatFarki ? "yukseliyor" : fark <= -TAKIP.gidisatFarki ? "dusuyor" : "sabit";
}

const SIRA: Record<Zorluk, number> = { zor: 0, orta: 1, iyi: 2, "az-veri": 3 };

// tablolar[i], aylar[i] ayının sayaçlarıdır.
export function takipRaporuHesapla(
  aylar: string[],
  tablolar: Record<string, number>[],
  tanimOf: (yer: KazanimYeri, kod: string) => KazanimTanimi | null
): TakipRaporu {
  const ciktilar = new Map<string, { yer: KazanimYeri; kod: string }>();
  const turler = new Set<string>();
  for (const t of tablolar)
    for (const a of Object.keys(t)) {
      const p = a.split("|");
      if (p[0] === "k" && p.length === 6) ciktilar.set(p.slice(1, 5).join("|"), { yer: { ders: p[1], sinif: Number(p[2]), uniteId: p[3] }, kod: p[4] });
      else if (p[0] === "t" && p.length === 3) turler.add(p[1]);
    }
  const kazanimlar: KazanimSatiri[] = [...ciktilar]
    .map(([anahtar, { yer, kod }]) => {
      const onEk = `k|${anahtar}`;
      const o = oranlarOf(tablolar, onEk);
      const aylik = tablolar.map((t) => oranlarOf([t], onEk).ilkDenemeOrani);
      return {
        anahtar,
        kod,
        tanim: tanimOf(yer, kod),
        oyun: tablolar.reduce((a, t) => a + (t[`${onEk}|o`] ?? 0), 0),
        ...o,
        aylar: aylik,
        gidisat: gidisatOf(aylik),
        zorluk: zorlukOf(o.ilkDenemeOrani),
      };
    })
    .sort((a, b) => SIRA[a.zorluk] - SIRA[b.zorluk] || (a.ilkDenemeOrani ?? 1) - (b.ilkDenemeOrani ?? 1) || b.deneme - a.deneme || a.anahtar.localeCompare(b.anahtar));
  return {
    aylar,
    bitiren: tablolar.map((t) => t.bitiren ?? 0),
    oyun: tablolar.map((t) => t.oyun ?? 0),
    kazanimlar,
    turler: [...turler].map((tur) => ({ tur, ...oranlarOf(tablolar, alan("t", tur)) })).sort((a, b) => b.deneme - a.deneme || a.tur.localeCompare(b.tur)),
  };
}

// Zorlanılan çıktı için Composer'ın ön notu: öğretmen formda görür ve değiştirebilir.
export function pekistirmeNotu(s: KazanimSatiri): string {
  const cikti = s.tanim ? `${s.kod} (${s.tanim.metin})` : s.kod;
  const oran = s.ilkDenemeOrani === null ? "" : ` (son ${TAKIP.aySayisi} ayda ilk denemede doğru %${Math.round(s.ilkDenemeOrani * 100)})`;
  return `Pekiştirme oyunu: sınıfım ${cikti} öğrenme çıktısında zorlandı${oran}. Durakların çoğu bu çıktıyı farklı görev türleriyle, kolaydan zora adım adım çalıştırsın; ipuçları olası kavram yanılgısını düzeltsin.`.slice(
    0,
    SERBEST_NOT_MAX
  );
}

// Composer'ı sınıf, ders, konu ve ön notla açan adres; çıktı programda yoksa null.
export function pekistirmeAdresi(s: KazanimSatiri): string | null {
  if (!s.tanim) return null;
  const q = new URLSearchParams({ sinif: String(s.tanim.sinif), ders: s.tanim.ders, konu: s.tanim.uniteId, not: pekistirmeNotu(s) });
  return `/composer?${q}`;
}

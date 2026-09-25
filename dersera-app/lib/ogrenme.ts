import type { GameDefinition } from "@/lib/composer/definition";

// Composer öğrenme döngüsü (docs/URUN-BAGLAMI.md V2): öneri önce, insan kontrollü; otomatik istem değişikliği yok.
// Sinyaller aylık, anonim sayaçlardır (öğretmen ya da öğrenci kimliği tutulmaz): üretim ve doğrulama, içerik
// denetimi, öğretmen düzenlemeleri ve öğrenci sonuçları. Rapor bu sayaçlardan kural tabanlı hesaplanır; yapay zekâ
// rapordan öneri yazar, platform yöneticisi onaylarsa öneri oluşturma istemine ek kural olarak girer (geri alınabilir).
// Optimizasyon hedefi yalnız öğrenci beğenisi değildir: ilk denemede doğru ve destek oranları öne çıkar.
// Bu dosya saf hesaptır; istemci de tür olarak okur.

export const OGRENME = {
  // Öneri istemek için en az veri: bu kadar üretim ya da öğrenci denemesi.
  enAzUretim: 10,
  enAzDeneme: 30,
  // Oranların yorumlanması için en az örnek.
  enAzOrnek: 5,
  enCokOneri: 5,
  kuralEnCok: 240,
  talimatSaklama: 200,
} as const;

// Sayaç alanları: "tür|anahtar…". Ayraç içerikte geçmesin diye değerlerden atılır.
const temiz = (s: string | number) => String(s).replace(/\|/g, "/").slice(0, 80);
export const alan = (...parcalar: (string | number)[]) => parcalar.map(temiz).join("|");
const dersOf = (def: GameDefinition) => def.meta.ders.split(" + ")[0];

// Üretim anı: ders/sınıf, geçersizlik, doğrulama kodları, durak görev türleri ve içerik denetimi kategorileri.
export function uretimAlanlari(
  def: GameDefinition,
  gecerli: boolean,
  kodlar: string[],
  denetim: { kategori: string; agirlik: string }[]
): string[] {
  const ds = [dersOf(def), def.meta.sinif] as const;
  return [
    alan("uret", ...ds),
    ...(gecerli ? [] : [alan("gecersiz", ...ds)]),
    ...[...new Set(kodlar)].map((k) => alan("kod", k)),
    ...def.duraklar.map((d) => alan("tur-uretilen", d.gorev.tur)),
    ...denetim.map((b) => alan("denetim", b.kategori, b.agirlik)),
  ];
}

// Kütüphanede kaydedilen yeni sürümde görevi ya da hikâyesi değişen duraklar (elle ya da yapay zekâyla).
export function duzenlemeAlanlari(onceki: GameDefinition, yeni: GameDefinition): string[] {
  const eski = new Map(onceki.duraklar.map((d) => [d.id, JSON.stringify([d.gorev, d.hikaye_metni])]));
  return yeni.duraklar.filter((d) => eski.has(d.id) && eski.get(d.id) !== JSON.stringify([d.gorev, d.hikaye_metni])).map((d) => alan("tur-duzenlenen", d.gorev.tur));
}

export const yzGuncellemeAlanlari = (def: GameDefinition, idler: string[]) =>
  def.duraklar.filter((d) => idler.includes(d.id)).map((d) => alan("tur-yz-guncellenen", d.gorev.tur));

// Öğrencinin ulaştığı her durak: durak başına kaydedilen sayı yanlış cevap sayısıdır (lib/ogrenmeRaporu.ts);
// 0: ilk denemede doğru, 3 ve üstü: destek görevi açıldı.
export function ogrenciAlanlari(def: GameDefinition, durakYanlislari: Record<string, number>): string[] {
  const ds = [dersOf(def), def.meta.sinif] as const;
  const out: string[] = [alan("ogr-bitiren", ...ds)];
  for (const d of def.duraklar) {
    const y = durakYanlislari[d.id];
    if (typeof y !== "number" || !Number.isFinite(y) || y < 0) continue;
    out.push(alan("ogr-deneme", d.gorev.tur), alan("ogr-ders-deneme", ...ds));
    if (y === 0) out.push(alan("ogr-ilk", d.gorev.tur), alan("ogr-ders-ilk", ...ds));
    if (y >= 3) out.push(alan("ogr-destek", d.gorev.tur));
  }
  return out;
}

// ── Rapor ────────────────────────────────────────────────────────────────────

export interface TurSatiri {
  tur: string;
  uretilen: number;
  duzenlenen: number;
  yzGuncellenen: number;
  duzenlenmeOrani: number | null;
  deneme: number;
  ilkDenemeOrani: number | null;
  destekOrani: number | null;
}

export interface DersSatiri {
  ders: string;
  sinif: number;
  uretim: number;
  gecersizOrani: number | null;
  bitiren: number;
  deneme: number;
  ilkDenemeOrani: number | null;
}

export interface OgrenmeRaporuOzeti {
  ay: string;
  turler: TurSatiri[];
  dersler: DersSatiri[];
  kodlar: { kod: string; sayi: number }[];
  denetim: { kategori: string; agirlik: string; sayi: number }[];
  toplam: { uretim: number; deneme: number };
}

const oran = (pay: number, payda: number) => (payda >= OGRENME.enAzOrnek ? Math.round((pay / payda) * 100) / 100 : null);

export function raporHesapla(ay: string, sayaclar: Record<string, number>): OgrenmeRaporuOzeti {
  const turler = new Map<string, Omit<TurSatiri, "duzenlenmeOrani" | "ilkDenemeOrani" | "destekOrani"> & { ilk: number; destek: number }>();
  const dersler = new Map<string, { ders: string; sinif: number; uretim: number; gecersiz: number; bitiren: number; deneme: number; ilk: number }>();
  const kodlar: { kod: string; sayi: number }[] = [];
  const denetim: { kategori: string; agirlik: string; sayi: number }[] = [];
  const tur = (t: string) => turler.get(t) ?? turler.set(t, { tur: t, uretilen: 0, duzenlenen: 0, yzGuncellenen: 0, deneme: 0, ilk: 0, destek: 0 }).get(t)!;
  const ders = (d: string, s: string) => {
    const k = `${d}|${s}`;
    return dersler.get(k) ?? dersler.set(k, { ders: d, sinif: Number(s), uretim: 0, gecersiz: 0, bitiren: 0, deneme: 0, ilk: 0 }).get(k)!;
  };
  for (const [a, n] of Object.entries(sayaclar)) {
    const [t, x, y] = a.split("|");
    switch (t) {
      case "uret":
        ders(x, y).uretim += n;
        break;
      case "gecersiz":
        ders(x, y).gecersiz += n;
        break;
      case "ogr-bitiren":
        ders(x, y).bitiren += n;
        break;
      case "ogr-ders-deneme":
        ders(x, y).deneme += n;
        break;
      case "ogr-ders-ilk":
        ders(x, y).ilk += n;
        break;
      case "kod":
        kodlar.push({ kod: x, sayi: n });
        break;
      case "denetim":
        denetim.push({ kategori: x, agirlik: y, sayi: n });
        break;
      case "tur-uretilen":
        tur(x).uretilen += n;
        break;
      case "tur-duzenlenen":
        tur(x).duzenlenen += n;
        break;
      case "tur-yz-guncellenen":
        tur(x).yzGuncellenen += n;
        break;
      case "ogr-deneme":
        tur(x).deneme += n;
        break;
      case "ogr-ilk":
        tur(x).ilk += n;
        break;
      case "ogr-destek":
        tur(x).destek += n;
        break;
    }
  }
  const turSatirlari = [...turler.values()]
    .map(({ ilk, destek, ...t }) => ({ ...t, duzenlenmeOrani: oran(t.duzenlenen, t.uretilen), ilkDenemeOrani: oran(ilk, t.deneme), destekOrani: oran(destek, t.deneme) }))
    .sort((a, b) => b.uretilen - a.uretilen);
  const dersSatirlari = [...dersler.values()]
    .map(({ gecersiz, ilk, ...d }) => ({ ...d, gecersizOrani: oran(gecersiz, d.uretim), ilkDenemeOrani: oran(ilk, d.deneme) }))
    .sort((a, b) => b.uretim - a.uretim || a.sinif - b.sinif);
  return {
    ay,
    turler: turSatirlari,
    dersler: dersSatirlari,
    kodlar: kodlar.sort((a, b) => b.sayi - a.sayi).slice(0, 15),
    denetim: denetim.sort((a, b) => b.sayi - a.sayi),
    toplam: { uretim: dersSatirlari.reduce((a, d) => a + d.uretim, 0), deneme: turSatirlari.reduce((a, t) => a + t.deneme, 0) },
  };
}

// ── Öneriler ve onaylı istem kuralları ──────────────────────────────────────

export type OneriDurumu = "bekliyor" | "aktif" | "reddedildi" | "pasif";

export interface OneriKapsami {
  ders: string | null;
  sinif: number | null;
}

export interface Oneri {
  id: string;
  tarih: number;
  baslik: string;
  gerekce: string;
  kural: string;
  kapsam: OneriKapsami;
  durum: OneriDurumu;
  karar?: { yonetici: string; tarih: number };
}

// Onaylı kural bu oyuna uygulanır mı: kapsam boşsa her oyuna; ders ve sınıf verildiyse eşleşene.
export function kapsamaUyar(k: OneriKapsami, dersler: string[], sinif: number): boolean {
  return (k.ders === null || dersler.includes(k.ders)) && (k.sinif === null || k.sinif === sinif);
}

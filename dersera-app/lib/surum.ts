import { createHash } from "crypto";
import type { Durak, GameDefinition } from "@/lib/composer/definition";

// Oyun sürümleme (docs/URUN-BAGLAMI.md §7): deterministik, yapay zekâ kullanmaz.
// Oyunun ilk sürümüne (tabana) göre anlamlı içeriğin en çok %30'u değiştiyse aynı oyunun yeni sürümüdür; daha fazlası
// ya da oyunun kimliğini (sınıf, ders, konu, alan, deneyim, süre) değiştiren düzenleme yeni bir varyant olarak ayrılır.
// Oran tabana göre hesaplanır: art arda küçük kayıtlarla oyun varyant açılmadan baştan sona değiştirilemez.
// Yayınlanmış oyun kodu yayın anındaki tanımı taşır: süren sınıf oturumu başladığı sürümle biter.

export const VARYANT_ESIGI = 0.3;

// Durak izi: kimlik, içerik (rota hedefleri hariç) ve rota hedeflerinin kimlikleri.
export interface DurakIzi {
  i: string;
  c: string;
  h: (string | null)[];
}

// İz biçimi değişirse artırılır: kayıttaki eski biçimli taban okunurken yeniden hesaplanır.
export const IZ_SURUMU = 1;

// Karşılaştırma için sıkıştırılmış iz (kayıtta taban olarak saklanır; tanımı iki kez tutmamak için).
export interface Parmakizi {
  v: number;
  giris: string;
  envanter: string;
  final: string;
  duraklar: DurakIzi[];
}

const iz = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

export function parmakizi(def: GameDefinition): Parmakizi {
  // Nesneler içerikleriyle: nesne kimliklerini yeniden adlandırmak değişiklik sayılmaz.
  const nesne = new Map(def.envanter.map((e) => [e.id, iz([e.tur, e.isim, e.final_icin_gerekli])]));
  const nesneIzi = (id: string | null) => (id === null ? null : (nesne.get(id) ?? "?"));
  const duraklar = def.duraklar.map((d: Durak) => {
    const { id, varsayilan_sonraki_durak_id: sonraki, secimler, gorev, ...icerik } = d;
    return {
      i: id,
      c: iz({ ...icerik, gorev: { ...gorev, odul_id: nesneIzi(gorev.odul_id) }, secimler: secimler.map((s) => s.metin) }),
      h: [...secimler.map((s) => s.hedef_durak_id), sonraki],
    };
  });
  return {
    v: IZ_SURUMU,
    giris: iz([def.meta.baslik, def.hikaye_giris, def.oyun_amaci, def.ogrenme_hedefleri]),
    envanter: iz([...nesne.values()].sort()),
    final: iz({ ...def.final, gerekli_nesneler: def.final.gerekli_nesneler.map(nesneIzi).sort() }),
    duraklar,
  };
}

// Değişen birimlerin oranı (0–1). Birimler: giriş, envanter, final ve her durak.
// Duraklar önce içerikçe, kalanlar kimlikçe eşleştirilir (yeniden numaralanan durak ve içeriği düzenlenen durak
// eşini bulur). Değişen durak: eşi olmayan (eklenen/silinen), içeriği değişen ya da rotası (eşleştirmeye göre
// hedefleri) değişen durak. Araya bir durak eklemek yalnız o durağı ve ona bağlanan durağı değiştirir.
export function degisimOrani(a: Parmakizi, b: Parmakizi): number {
  const eslesme = new Map<number, number>(); // b indeksi → a indeksi
  const aBos = new Set(a.duraklar.map((_, i) => i));
  // 1. içerik (aynı içerik birden çok duraktaysa önce aynı kimlik tercih edilir)
  b.duraklar.forEach((bd, bi) => {
    const adaylar = [...aBos].filter((ai) => a.duraklar[ai].c === bd.c);
    const ai = adaylar.find((x) => a.duraklar[x].i === bd.i) ?? adaylar[0];
    if (ai !== undefined) {
      eslesme.set(bi, ai);
      aBos.delete(ai);
    }
  });
  // 2. kimlik (içeriği düzenlenmiş durak)
  b.duraklar.forEach((bd, bi) => {
    if (eslesme.has(bi)) return;
    const ai = [...aBos].find((x) => a.duraklar[x].i === bd.i);
    if (ai !== undefined) {
      eslesme.set(bi, ai);
      aBos.delete(ai);
    }
  });
  // Rota karşılaştırması için b kimliği → a kimliği.
  const aKimlikOf = new Map([...eslesme].map(([bi, ai]) => [b.duraklar[bi].i, a.duraklar[ai].i]));
  const hedefA = (id: string | null) => (id === null ? null : (aKimlikOf.get(id) ?? `yeni:${id}`));

  let degisenDurak = a.duraklar.length - eslesme.size; // silinenler
  b.duraklar.forEach((bd, bi) => {
    const ai = eslesme.get(bi);
    if (ai === undefined) return void degisenDurak++; // eklenen
    const ad = a.duraklar[ai];
    const rota = bd.h.map(hedefA);
    if (ad.c !== bd.c || rota.length !== ad.h.length || rota.some((h, k) => h !== ad.h[k])) degisenDurak++;
  });
  const durak = Math.max(a.duraklar.length, b.duraklar.length);
  const degisen = degisenDurak + Number(a.giris !== b.giris) + Number(a.envanter !== b.envanter) + Number(a.final !== b.final);
  return Math.min(1, degisen / (durak + 3));
}

const KIMLIK_ALANLARI = ["sinif", "ders", "konu", "alan", "deneyim", "sure_dk"] as const;

export function kimlikDegisti(eski: GameDefinition, yeni: GameDefinition): boolean {
  return KIMLIK_ALANLARI.some((a) => eski.meta[a] !== yeni.meta[a]);
}

export type SurumKarari = { tur: "ayni" } | { tur: "surum"; oran: number } | { tur: "varyant"; oran: number; neden: "oran" | "kimlik" };

// onceki: son kaydedilen tanım (değişiklik var mı); taban: bu oyunun ilk sürümünün izi (ne kadar uzaklaştı).
export function surumKarari(onceki: GameDefinition, yeni: GameDefinition, taban: Parmakizi): SurumKarari {
  const oran = degisimOrani(taban, parmakizi(yeni));
  if (kimlikDegisti(onceki, yeni)) return { tur: "varyant", oran, neden: "kimlik" };
  if (JSON.stringify(onceki) === JSON.stringify(yeni)) return { tur: "ayni" };
  return oran > VARYANT_ESIGI ? { tur: "varyant", oran, neden: "oran" } : { tur: "surum", oran };
}

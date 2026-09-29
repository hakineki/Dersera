// Yapay zekâ maliyet kaydının tipleri ve fiyat varsayımları. Fiyatlar kodda sabittir ve TAHMİNDİR: sağlayıcının faturası
// esastır. Kaynak: fizibilite belgesi "Birim maliyet" tablosu (28 Eylül 2026). Fiyatı bilinmeyen model için token
// sayıları yine kaydedilir, tutar "fiyatsız" sayılır (yönetim sayfasında ayrıca gösterilir).
// Sayılmayanlar: yanıt gelmeden zaman aşımına uğrayan ya da bağlantısı kopan çağrılar (sağlayıcı bunları da
// faturalayabilir) ve görsel üretiminde görsel dönmeyen istekler. Anthropic önbellek yazma tokenları giriş sayılır.
// İstemci de okur: ağır modül içe aktarmamalı.

export const YZ_TURLERI = ["uretim", "guncelleme", "denetim", "oneri", "gorsel", "diger"] as const;
export type YzTuru = (typeof YZ_TURLERI)[number];
export const YZ_TURU_ADI: Record<YzTuru, string> = {
  uretim: "Oyun üretimi",
  guncelleme: "Yapay zekâyla güncelleme",
  denetim: "Çocuk güvenliği denetimi",
  oneri: "Öğrenme önerisi",
  gorsel: "Görsel",
  diger: "Diğer",
};

export interface YzKullanimi {
  model: string;
  // Önbellekten okunan giriş tokenları ayrıca sayılır (giris onları içermez).
  giris?: number;
  cikis?: number;
  onbellek?: number;
  gorsel?: number;
  kalite?: string;
}

// 1 milyon token başına dolar. Anahtar, modelin adının başıdır (sağlayıcı sürüm eki ekleyebilir).
export const TOKEN_FIYATLARI: Record<string, { giris: number; cikis: number; onbellek: number; kaynak: string }> = {
  "gpt-6-luna": { giris: 0.1, cikis: 0.5, onbellek: 0.1, kaynak: "Fizibilite belgesi (OpenAI fiyat sayfası, 28 Eylül 2026); önbellek fiyatı bilinmediği için giriş fiyatı alındı" },
  "claude-sonnet-4-6": { giris: 3, cikis: 15, onbellek: 0.3, kaynak: "Anthropic liste fiyatı varsayımı; doğrulanmadı" },
};

// Görsel başına dolar (kaliteye göre).
export const GORSEL_FIYATLARI: Record<string, { fiyat: Partial<Record<string, number>>; kaynak: string }> = {
  "gpt-image-2": { fiyat: { low: 0.006 }, kaynak: "Fizibilite belgesi: kodda ölçülen görsel başı ~0,6 sent (düşük kalite)" },
};

export const DOLAR_KURU = { tl: 48.98, tarih: "28 Eylül 2026", kaynak: "Fizibilite belgesi (Trading Economics)" };

// Model adı tam eşleşir ya da yalnız sürüm/tarih ekiyle uzar ("claude-sonnet-4-6-20260301"); "gpt-6-luna-mini" gibi
// başka bir model "gpt-6-luna" fiyatını almaz.
function fiyatOf<T>(tablo: Record<string, T>, model: string): T | null {
  const anahtar = Object.keys(tablo).find((k) => model === k || (model.startsWith(`${k}-`) && /[0-9]/.test(model.charAt(k.length + 1))));
  return anahtar ? tablo[anahtar] : null;
}

// Tahmini dolar; fiyat bilinmiyorsa null.
export function tahminiDolar(k: YzKullanimi): number | null {
  if (k.gorsel) {
    const birim = fiyatOf(GORSEL_FIYATLARI, k.model)?.fiyat[k.kalite ?? "low"];
    return typeof birim === "number" ? birim * k.gorsel : null;
  }
  const f = fiyatOf(TOKEN_FIYATLARI, k.model);
  if (!f) return null;
  return ((k.giris ?? 0) * f.giris + (k.cikis ?? 0) * f.cikis + (k.onbellek ?? 0) * f.onbellek) / 1_000_000;
}

// Depodaki aylık tablo: alan adları "t|<tür>|<model>|<ölçü>" ve "o|<okul ya da yok>|<ölçü>".
export const OLCULER = ["cagri", "giris", "cikis", "onbellek", "gorsel", "mikrodolar", "fiyatsiz"] as const;
export type Olcu = (typeof OLCULER)[number];
export type Olculer = Record<Olcu, number>;
export const bosOlculer = (): Olculer => ({ cagri: 0, giris: 0, cikis: 0, onbellek: 0, gorsel: 0, mikrodolar: 0, fiyatsiz: 0 });

export interface YzMaliyetRaporu {
  ay: string;
  toplam: Olculer;
  turler: { tur: YzTuru; model: string; olculer: Olculer }[];
  okullar: { okulId: string | null; olculer: Olculer }[];
}

const temiz = (s: string) => s.replace(/\|/g, "/").slice(0, 80);
export const turAlani = (tur: YzTuru, model: string, olcu: Olcu) => `t|${tur}|${temiz(model)}|${olcu}`;
export const okulAlani = (okulId: string | null, olcu: Olcu) => `o|${okulId ?? "yok"}|${olcu}`;

// Ham tablodan rapor (tür/model ve okul kırılımı, toplam).
export function raporOf(ay: string, tablo: Record<string, number>): YzMaliyetRaporu {
  const toplam = bosOlculer();
  const turler = new Map<string, { tur: YzTuru; model: string; olculer: Olculer }>();
  const okullar = new Map<string, Olculer>();
  for (const [alan, deger] of Object.entries(tablo)) {
    const p = alan.split("|");
    const olcu = p[p.length - 1] as Olcu;
    if (!(OLCULER as readonly string[]).includes(olcu)) continue;
    if (p[0] === "t" && p.length === 4) {
      const tur = ((YZ_TURLERI as readonly string[]).includes(p[1]) ? p[1] : "diger") as YzTuru;
      const k = `${tur}|${p[2]}`;
      const s = turler.get(k) ?? turler.set(k, { tur, model: p[2], olculer: bosOlculer() }).get(k)!;
      s.olculer[olcu] += deger;
      toplam[olcu] += deger;
    } else if (p[0] === "o" && p.length === 3) {
      const s = okullar.get(p[1]) ?? okullar.set(p[1], bosOlculer()).get(p[1])!;
      s[olcu] += deger;
    }
  }
  return {
    ay,
    toplam,
    turler: [...turler.values()].sort((a, b) => b.olculer.mikrodolar - a.olculer.mikrodolar || b.olculer.cagri - a.olculer.cagri),
    okullar: [...okullar].map(([id, olculer]) => ({ okulId: id === "yok" ? null : id, olculer })).sort((a, b) => b.olculer.mikrodolar - a.olculer.mikrodolar),
  };
}

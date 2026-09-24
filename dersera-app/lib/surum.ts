import { createHash } from "crypto";
import type { Durak, GameDefinition } from "@/lib/composer/definition";

// Oyun sürümleme (docs/URUN-BAGLAMI.md §7): deterministik, yapay zekâ kullanmaz.
// Oyunun ilk sürümüne (tabana) göre anlamlı içeriğin en çok %30'u değiştiyse aynı oyunun yeni sürümüdür; daha fazlası
// ya da oyunun kimliğini (sınıf, ders, konu, alan, deneyim, süre) değiştiren düzenleme yeni bir varyant olarak ayrılır.
// Oran tabana göre hesaplanır: art arda küçük kayıtlarla oyun varyant açılmadan baştan sona değiştirilemez.
// Yayınlanmış oyun kodu yayın anındaki tanımı taşır: süren sınıf oturumu başladığı sürümle biter.

export const VARYANT_ESIGI = 0.3;

// Karşılaştırma için sıkıştırılmış içerik izi (kayıtta taban olarak saklanır; tanımı iki kez tutmamak için).
export interface Parmakizi {
  giris: string;
  envanter: string;
  final: string;
  // Duraklar kimliksiz içerikleriyle: yeniden numaralanan durak değişmiş sayılmaz.
  duraklar: string[];
}

const iz = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

// Durak kimliği ve kimliklere işaret eden rota alanları çıkarılır; içerik (hikâye, görev, seçim metni) kalır.
function durakIcerigi(d: Durak) {
  const { id: _id, varsayilan_sonraki_durak_id: _s, secimler, ...icerik } = d;
  void [_id, _s];
  return { ...icerik, secimler: secimler.map((s) => s.metin) };
}

export function parmakizi(def: GameDefinition): Parmakizi {
  return {
    giris: iz([def.meta.baslik, def.hikaye_giris, def.oyun_amaci, def.ogrenme_hedefleri]),
    envanter: iz(def.envanter),
    final: iz(def.final),
    duraklar: def.duraklar.map((d) => iz(durakIcerigi(d))),
  };
}

// Değişen birimlerin oranı (0–1). Birimler: giriş, envanter, final ve her durak. Duraklar içerikçe eşleştirilir;
// eklenen, silinen ya da içeriği değişen her durak bir birimdir.
export function degisimOrani(a: Parmakizi, b: Parmakizi): number {
  const kalan = new Map<string, number>();
  for (const d of a.duraklar) kalan.set(d, (kalan.get(d) ?? 0) + 1);
  let eslesen = 0;
  for (const d of b.duraklar) {
    const n = kalan.get(d) ?? 0;
    if (n > 0) {
      eslesen++;
      kalan.set(d, n - 1);
    }
  }
  const durak = Math.max(a.duraklar.length, b.duraklar.length);
  const degisen = durak - eslesen + Number(a.giris !== b.giris) + Number(a.envanter !== b.envanter) + Number(a.final !== b.final);
  return degisen / (durak + 3);
}

const KIMLIK_ALANLARI = ["sinif", "ders", "konu", "alan", "deneyim", "sure_dk"] as const;

export function kimlikDegisti(eski: GameDefinition, yeni: GameDefinition): boolean {
  return KIMLIK_ALANLARI.some((a) => eski.meta[a] !== yeni.meta[a]);
}

export type SurumKarari = { tur: "ayni" } | { tur: "surum"; oran: number } | { tur: "varyant"; oran: number; neden: "oran" | "kimlik" };

// onceki: son kaydedilen tanım (değişiklik var mı); taban: bu oyunun ilk sürümünün izi (ne kadar uzaklaştı).
export function surumKarari(onceki: GameDefinition, yeni: GameDefinition, taban: Parmakizi): SurumKarari {
  const yeniIz = parmakizi(yeni);
  const oran = degisimOrani(taban, yeniIz);
  if (kimlikDegisti(onceki, yeni)) return { tur: "varyant", oran, neden: "kimlik" };
  if (degisimOrani(parmakizi(onceki), yeniIz) === 0 && JSON.stringify(onceki) === JSON.stringify(yeni)) return { tur: "ayni" };
  return oran > VARYANT_ESIGI ? { tur: "varyant", oran, neden: "oran" } : { tur: "surum", oran };
}

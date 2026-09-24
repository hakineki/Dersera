import type { GameDefinition } from "@/lib/composer/definition";
import type { DersKonu } from "@/lib/composer/input";
import type { PaylasimUygunlugu, ToplulukDurumOzeti } from "@/lib/toplulukPaylasim";

// Öğretmen oyun kütüphanesi: composer'dan yayınlanan oyunlar kalıcı saklanır, API çağrısı olmadan yeniden yayınlanır.
// Sahiplik tarayıcıda üretilen gizli bir anahtarla kurulur; sunucu yalnız anahtarın özetini tutar.

export const KUTUPHANE_ANAHTARI_KEY = "dersera:kutuphane-anahtari";
export const KUTUPHANE_HEADER = "x-kutuphane-anahtari";
export const KUTUPHANE_LIMIT = 50;

const ANAHTAR = /^[A-Za-z0-9_-]{32,64}$/;
const ID = /^[a-z0-9]{8,32}$/;

export const isKutuphaneAnahtari = (v: unknown): v is string => typeof v === "string" && ANAHTAR.test(v);
export const isKutuphaneId = (v: unknown): v is string => typeof v === "string" && ID.test(v);

export interface KutuphaneOzeti {
  id: string;
  baslik: string;
  ders: string;
  konu: string;
  sinif: number;
  sure_dk: number;
  deneyim: GameDefinition["meta"]["deneyim"];
  alan: GameDefinition["meta"]["alan"];
  durakSayisi: number;
  createdAt: number;
  sonKod: string | null;
  sonYayin: number | null;
  // Sürümleme (bu alanlardan önce kaydedilen oyunlarda yoktur: soy = kendi kimliği, sürüm = 1).
  soy_id?: string;
  surum?: number;
  // Varyantın türetildiği oyun.
  turetildigi?: { id: string; baslik: string } | null;
}

// Sürüm tabanı: oyunun ilk sürümünün içerik izi (lib/surum.ts). Liste yanıtına girmez.
export interface KutuphaneTabani {
  v?: number;
  giris: string;
  envanter: string;
  final: string;
  duraklar: { i: string; c: string; h: (string | null)[] }[];
}

// Liste yanıtında her oyunun saha istatistiği, topluluk durumu ve topluluğa gönderilebilirliği de gelir.
export interface KutuphaneListeOgesi extends KutuphaneOzeti {
  ogrenci_sayisi: number;
  puan_ortalama: number | null;
  puan_sayisi: number;
  topluluk: ToplulukDurumOzeti | null;
  paylasim: PaylasimUygunlugu;
}

export interface KutuphaneKaydi extends KutuphaneOzeti {
  definition: GameDefinition;
  dersler: DersKonu[];
  taban?: KutuphaneTabani;
}

export function kayitOlustur(id: string, definition: GameDefinition, dersler: DersKonu[], kod: string | null, now: number): KutuphaneKaydi {
  const m = definition.meta;
  return {
    id,
    baslik: m.baslik,
    ders: m.ders,
    konu: m.konu,
    sinif: m.sinif,
    sure_dk: m.sure_dk,
    deneyim: m.deneyim,
    alan: m.alan,
    durakSayisi: definition.duraklar.length,
    createdAt: now,
    sonKod: kod,
    sonYayin: kod ? now : null,
    definition,
    dersler,
  };
}

export function ozetOf(k: KutuphaneKaydi): KutuphaneOzeti {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { definition, dersler, taban, ...ozet } = k;
  return ozet;
}

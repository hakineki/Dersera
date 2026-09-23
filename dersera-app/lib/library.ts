import type { GameDefinition } from "@/lib/composer/definition";
import type { DersKonu } from "@/lib/composer/input";

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
}

export interface KutuphaneKaydi extends KutuphaneOzeti {
  definition: GameDefinition;
  dersler: DersKonu[];
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
  const { definition, dersler, ...ozet } = k;
  return ozet;
}

import type { PublishResponse } from "@/lib/gamesClient";
import type { OgrenmeCiktisi } from "@/data/mufredat/programlar";
import type { GameDefinition } from "@/lib/composer/definition";
import type { ValidationResult } from "@/lib/composer/validator";
import { KUTUPHANE_ANAHTARI_KEY, KUTUPHANE_HEADER, isKutuphaneAnahtari, type KutuphaneKaydi, type KutuphaneOzeti } from "@/lib/library";

async function istek(path: string, init: RequestInit = {}): Promise<Response | null> {
  try {
    return await fetch(path, { ...init, headers: { ...init.headers, "Content-Type": "application/json" } });
  } catch {
    return null;
  }
}

// Hesap öncesi sürüm kütüphaneyi bu tarayıcıdaki bir anahtara bağlıyordu. Girişten sonra o kütüphane hesaba taşınır;
// hepsi taşınınca anahtar silinir. Taşınan oyun sayısı döner.
export async function eskiKutuphaneyiTasi(): Promise<number> {
  let anahtar: string | null = null;
  try {
    anahtar = localStorage.getItem(KUTUPHANE_ANAHTARI_KEY);
  } catch {
    return 0;
  }
  if (!isKutuphaneAnahtari(anahtar)) return 0;
  const res = await istek("/api/library/tasi", { method: "POST", headers: { [KUTUPHANE_HEADER]: anahtar } });
  if (!res?.ok) return 0;
  const { tasinan, kalan } = (await res.json()) as { tasinan: number; kalan: number };
  if (kalan === 0) {
    try {
      localStorage.removeItem(KUTUPHANE_ANAHTARI_KEY);
    } catch {
      /* ignore */
    }
  }
  return tasinan;
}

export async function kutuphaneListesi(): Promise<KutuphaneOzeti[] | null> {
  const res = await istek("/api/library");
  return res?.ok ? ((await res.json()) as { oyunlar: KutuphaneOzeti[] }).oyunlar : null;
}

export interface KutuphaneDetayi {
  oyun: KutuphaneKaydi;
  hedefler: OgrenmeCiktisi[];
  hedefDersleri: Record<string, string[]>;
  validation: ValidationResult | null;
}

export async function kutuphaneOyunu(id: string): Promise<KutuphaneDetayi | null> {
  const res = await istek(`/api/library/${id}`);
  return res?.ok ? ((await res.json()) as KutuphaneDetayi) : null;
}

export type KayitYaniti = { id: string; validation: ValidationResult } | { error: string };

// id verilirse aynı kayıt güncellenir, yoksa yeni kayıt açılır.
export async function kutuphaneyeKaydet(definition: GameDefinition, dersler: { ders: string; konuId: string }[], id: string | null): Promise<KayitYaniti> {
  const res = id
    ? await istek(`/api/library/${id}`, { method: "PUT", body: JSON.stringify({ definition }) })
    : await istek("/api/library", { method: "POST", body: JSON.stringify({ definition, dersler }) });
  if (!res) return { error: "Bağlantı kurulamadı." };
  const json = await res.json().catch(() => ({}));
  return res.ok ? (json as { id: string; validation: ValidationResult }) : { error: json.error ?? "Oyun kütüphaneye kaydedilemedi." };
}

export async function kutuphanedenSil(id: string): Promise<boolean> {
  const res = await istek(`/api/library/${id}`, { method: "DELETE" });
  return !!res?.ok;
}

export async function kutuphanedenYayinla(id: string, durationMinutes: number): Promise<PublishResponse | { error: string }> {
  const res = await istek(`/api/library/${id}/publish`, { method: "POST", body: JSON.stringify({ durationMinutes }) });
  if (!res) return { error: "Bağlantı kurulamadı." };
  const json = await res.json().catch(() => ({}));
  return res.ok ? (json as PublishResponse) : { error: json.error ?? "Oyun yayınlanamadı." };
}

import type { PublishResponse } from "@/lib/gamesClient";
import { KUTUPHANE_ANAHTARI_KEY, KUTUPHANE_HEADER, isKutuphaneAnahtari, type KutuphaneKaydi, type KutuphaneOzeti } from "@/lib/library";

// Bu tarayıcının kütüphane anahtarı; yoksa üretilir. Anahtar silinirse kütüphaneye erişim kaybolur.
export function kutuphaneAnahtari(): string | null {
  try {
    const mevcut = localStorage.getItem(KUTUPHANE_ANAHTARI_KEY);
    if (isKutuphaneAnahtari(mevcut)) return mevcut;
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const yeni = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    localStorage.setItem(KUTUPHANE_ANAHTARI_KEY, yeni);
    return yeni;
  } catch {
    return null;
  }
}

async function istek(path: string, init: RequestInit = {}): Promise<Response | null> {
  const anahtar = kutuphaneAnahtari();
  if (!anahtar) return null;
  try {
    return await fetch(path, { ...init, headers: { ...init.headers, [KUTUPHANE_HEADER]: anahtar, "Content-Type": "application/json" } });
  } catch {
    return null;
  }
}

export async function kutuphaneListesi(): Promise<KutuphaneOzeti[] | null> {
  const res = await istek("/api/library");
  return res?.ok ? ((await res.json()) as { oyunlar: KutuphaneOzeti[] }).oyunlar : null;
}

export async function kutuphaneOyunu(id: string): Promise<KutuphaneKaydi | null> {
  const res = await istek(`/api/library/${id}`);
  return res?.ok ? ((await res.json()) as { oyun: KutuphaneKaydi }).oyun : null;
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

import type { OgrenmeCiktisi } from "@/data/mufredat/programlar";
import type { GameDefinition } from "@/lib/composer/definition";
import type { DersKonu } from "@/lib/composer/input";
import type { ValidationResult } from "@/lib/composer/validator";
import type { YonetisimSonucu } from "@/lib/composer/yonetisim";
import type { ToplulukDurumu, ToplulukOzeti } from "@/lib/topluluk";
import type { IncelemeOgesi } from "@/lib/toplulukPaylasim";

// Topluluğa gönderim ve öğretmen incelemesi istemcisi.

async function istek(path: string, init: RequestInit = {}): Promise<{ ok: boolean; json: Record<string, unknown> } | null> {
  try {
    const res = await fetch(path, { ...init, headers: { ...init.headers, "Content-Type": "application/json" } });
    return { ok: res.ok, json: await res.json().catch(() => ({})) };
  } catch {
    return null;
  }
}

const hataMetni = (json: Record<string, unknown>, varsayilan: string) => {
  const nedenler = Array.isArray(json.nedenler) ? (json.nedenler as string[]) : [];
  return [typeof json.error === "string" ? json.error : varsayilan, nedenler.join(" · ")].filter(Boolean).join(" ");
};

export async function toplulugaGonder(kutuphaneId: string): Promise<{ durum: ToplulukDurumu } | { error: string }> {
  const r = await istek(`/api/library/${kutuphaneId}/topluluk`, { method: "POST" });
  if (!r) return { error: "Bağlantı kurulamadı." };
  return r.ok ? { durum: r.json.durum as ToplulukDurumu } : { error: hataMetni(r.json, "Oyun topluluğa gönderilemedi.") };
}

export async function topluluktanGeriCekIstegi(kutuphaneId: string): Promise<true | { error: string }> {
  const r = await istek(`/api/library/${kutuphaneId}/topluluk`, { method: "DELETE" });
  if (!r) return { error: "Bağlantı kurulamadı." };
  return r.ok ? true : { error: hataMetni(r.json, "Oyun geri çekilemedi.") };
}

export interface IncelemeListesi {
  inceleyebilir: boolean;
  neden?: string;
  oyunlar: IncelemeOgesi[];
}

export async function incelemeListesi(): Promise<IncelemeListesi | null> {
  const r = await istek("/api/topluluk/inceleme");
  return r?.ok ? (r.json as unknown as IncelemeListesi) : null;
}

export interface IncelemeDetayi {
  oyun: Omit<ToplulukOzeti, "oynanma_sayisi"> & { definition: GameDefinition; dersler: DersKonu[] };
  hedefler: OgrenmeCiktisi[];
  validation: ValidationResult | null;
  yonetisim: YonetisimSonucu | null;
  kabul: number;
  ret: number;
}

export async function incelemeOyunu(id: string): Promise<IncelemeDetayi | { error: string }> {
  const r = await istek(`/api/topluluk/inceleme/${encodeURIComponent(id)}`);
  if (!r) return { error: "Bağlantı kurulamadı." };
  return r.ok ? (r.json as unknown as IncelemeDetayi) : { error: hataMetni(r.json, "Oyun açılamadı.") };
}

export interface OgretmenPuaniDurumu {
  ortalama: number | null;
  sayi: number;
  benim: number | null;
  uygun: boolean;
  neden?: string;
}

export async function ogretmenPuaniGetir(toplulukId: string): Promise<OgretmenPuaniDurumu | null> {
  const r = await istek(`/api/topluluk/${encodeURIComponent(toplulukId)}/ogretmen-puani`);
  return r?.ok ? (r.json as unknown as OgretmenPuaniDurumu) : null;
}

export async function ogretmenPuaniVer(toplulukId: string, puan: number): Promise<OgretmenPuaniDurumu | { error: string }> {
  const r = await istek(`/api/topluluk/${encodeURIComponent(toplulukId)}/ogretmen-puani`, { method: "POST", body: JSON.stringify({ puan }) });
  if (!r) return { error: "Bağlantı kurulamadı." };
  return r.ok ? (r.json as unknown as OgretmenPuaniDurumu) : { error: hataMetni(r.json, "Puan kaydedilemedi.") };
}

export async function incelemeGonder(id: string, karar: "kabul" | "ret", not: string): Promise<{ durum: ToplulukDurumu } | { error: string }> {
  const r = await istek(`/api/topluluk/inceleme/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({ karar, not }) });
  if (!r) return { error: "Bağlantı kurulamadı." };
  return r.ok ? { durum: r.json.durum as ToplulukDurumu } : { error: hataMetni(r.json, "İnceleme kaydedilemedi.") };
}

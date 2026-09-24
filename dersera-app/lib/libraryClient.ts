import type { PublishResponse } from "@/lib/gamesClient";
import type { OgrenmeCiktisi } from "@/data/mufredat/programlar";
import type { GameDefinition } from "@/lib/composer/definition";
import type { ValidationResult } from "@/lib/composer/validator";
import type { SurumBilgisi } from "@/lib/libraryService";
import { KUTUPHANE_ANAHTARI_KEY, KUTUPHANE_HEADER, isKutuphaneAnahtari, type KutuphaneKaydi, type KutuphaneListeOgesi } from "@/lib/library";

async function istek(path: string, init: RequestInit = {}): Promise<Response | null> {
  try {
    return await fetch(path, { ...init, headers: { ...init.headers, "Content-Type": "application/json" } });
  } catch {
    return null;
  }
}

// Hesap öncesi sürüm kütüphaneyi bu tarayıcıdaki bir anahtara bağlıyordu. Girişten sonra öğretmene sorulur;
// onaylarsa o kütüphane hesaba taşınır, hepsi taşınınca anahtar silinir.
function eskiAnahtar(): string | null {
  try {
    const a = localStorage.getItem(KUTUPHANE_ANAHTARI_KEY);
    return isKutuphaneAnahtari(a) ? a : null;
  } catch {
    return null;
  }
}

export async function eskiKutuphaneSayisi(): Promise<number> {
  const anahtar = eskiAnahtar();
  if (!anahtar) return 0;
  const res = await istek("/api/library/tasi", { headers: { [KUTUPHANE_HEADER]: anahtar } });
  return res?.ok ? ((await res.json()) as { bekleyen: number }).bekleyen : 0;
}

export async function eskiKutuphaneyiTasi(): Promise<{ tasinan: number; kalan: number } | null> {
  const anahtar = eskiAnahtar();
  if (!anahtar) return null;
  const res = await istek("/api/library/tasi", { method: "POST", headers: { [KUTUPHANE_HEADER]: anahtar } });
  if (!res?.ok) return null;
  const sonuc = (await res.json()) as { tasinan: number; kalan: number };
  if (sonuc.kalan === 0) {
    try {
      localStorage.removeItem(KUTUPHANE_ANAHTARI_KEY);
    } catch {
      /* ignore */
    }
  }
  return sonuc;
}

export interface KutuphaneListesi {
  oyunlar: KutuphaneListeOgesi[];
  hesap: { toplulukHazir: boolean; kalanGun: number };
}

export async function kutuphaneListesi(): Promise<KutuphaneListesi | null> {
  const res = await istek("/api/library");
  return res?.ok ? ((await res.json()) as KutuphaneListesi) : null;
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

export type KayitYaniti = { id: string; validation: ValidationResult; surum?: SurumBilgisi } | { error: string };

// id verilirse aynı kayıt güncellenir, yoksa yeni kayıt açılır.
// surum: düzenlenen sürüm; sunucu daha yeni bir sürümü ezmemek için denetler.
// toplulukId: topluluktan "Oyunu Kullan" ile açılan oyunun ilk kaydında kaynak (öğretmen puanı için).
export async function kutuphaneyeKaydet(
  definition: GameDefinition,
  dersler: { ders: string; konuId: string }[],
  id: string | null,
  surum?: number,
  toplulukId?: string | null
): Promise<KayitYaniti> {
  const res = id
    ? await istek(`/api/library/${id}`, { method: "PUT", body: JSON.stringify({ definition, ...(surum ? { surum } : {}) }) })
    : await istek("/api/library", { method: "POST", body: JSON.stringify({ definition, dersler, ...(toplulukId ? { toplulukId } : {}) }) });
  if (!res) return { error: "Bağlantı kurulamadı." };
  const json = await res.json().catch(() => ({}));
  return res.ok ? (json as { id: string; validation: ValidationResult; surum?: SurumBilgisi }) : { error: json.error ?? "Oyun kütüphaneye kaydedilemedi." };
}

export async function kutuphanedenSil(id: string): Promise<boolean> {
  const res = await istek(`/api/library/${id}`, { method: "DELETE" });
  return !!res?.ok;
}

export async function kutuphanedenYayinla(id: string, durationMinutes: number): Promise<PublishResponse | { error: string }> {
  const res = await istek(`/api/library/${id}/publish`, { method: "POST", body: JSON.stringify({ durationMinutes }) });
  if (!res) return { error: "Bağlantı kurulamadı." };
  const json = await res.json().catch(() => ({}));
  if (res.ok) return json as PublishResponse;
  const engeller = ((json.yonetisim?.kapilar ?? []) as { bulgular: { karar: string; mesaj: string }[] }[])
    .flatMap((k) => k.bulgular)
    .filter((b) => b.karar === "BLOCK")
    .map((b) => b.mesaj);
  return { error: [json.error ?? "Oyun yayınlanamadı.", ...engeller.slice(0, 3)].join(" ") };
}

// Topluluk kütüphanesindeki oyun ("Oyunu Kullan"): kütüphane detayıyla aynı biçimde gelir.
export async function toplulukOyunu(id: string): Promise<KutuphaneDetayi | null> {
  const res = await istek(`/api/topluluk/${encodeURIComponent(id)}`);
  return res?.ok ? ((await res.json()) as KutuphaneDetayi) : null;
}

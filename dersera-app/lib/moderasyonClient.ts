import type { ModerasyonKarari, ModerasyonKaydi, ModerasyonOzeti } from "@/lib/moderasyon";

type Hata = { error: string; status?: number };

async function iste<T>(url: string, init?: RequestInit): Promise<T | Hata> {
  try {
    const res = await fetch(url, { cache: "no-store", ...init });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json.error ?? "İstek başarısız.", status: res.status };
    return json as T;
  } catch {
    return { error: "Bağlantı kurulamadı." };
  }
}

export const moderasyonListesi = (durum: ModerasyonKaydi["durum"]) => iste<{ kayitlar: ModerasyonOzeti[] }>(`/api/moderasyon?durum=${durum}`);
export const moderasyonKaydi = (id: string) => iste<{ kayit: ModerasyonKaydi }>(`/api/moderasyon/${id}`);
export const moderasyonKarariGonder = (id: string, karar: ModerasyonKarari, not: string) =>
  iste<{ kayit: ModerasyonKaydi }>(`/api/moderasyon/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ karar, not }) });

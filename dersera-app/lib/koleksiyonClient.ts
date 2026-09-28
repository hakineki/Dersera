import type { Koleksiyon } from "@/lib/koleksiyon";
import type { ToplulukOzeti } from "@/lib/topluluk";

// Öğretmen koleksiyonları ve topluluk "benzer oyunlar" istemcisi. Hata → { error } (kullanıcıya gösterilir).

type Hata = { error: string };
// Gövdesi kullanılmayan başarılı yanıt.
type Bos = { bos?: never };

async function istek<T>(path: string, init: RequestInit = {}, varsayilan = "İşlem yapılamadı."): Promise<T | Hata> {
  try {
    const res = await fetch(path, { cache: "no-store", ...init, headers: { ...init.headers, ...(init.body ? { "Content-Type": "application/json" } : {}) } });
    const json = await res.json().catch(() => ({}));
    return res.ok ? (json as T) : { error: typeof json.error === "string" ? json.error : varsayilan };
  } catch {
    return { error: "Bağlantı kurulamadı." };
  }
}

const k = (id: string) => `/api/koleksiyon/${encodeURIComponent(id)}`;

export const koleksiyonlarGetir = () => istek<{ koleksiyonlar: Koleksiyon[] }>("/api/koleksiyon", {}, "Koleksiyonlar okunamadı.");
export const koleksiyonGetir = (id: string) =>
  istek<{ koleksiyon: Koleksiyon; oyunlar: (ToplulukOzeti | { oyun_id: string; kaldirildi: true })[] }>(k(id), {}, "Koleksiyon okunamadı.");
export const koleksiyonOlustur = (ad: string) => istek<{ koleksiyon: Koleksiyon }>("/api/koleksiyon", { method: "POST", body: JSON.stringify({ ad }) });
export const koleksiyonAdDegistir = (id: string, ad: string) => istek<Bos>(k(id), { method: "PUT", body: JSON.stringify({ ad }) });
export const koleksiyonSil = (id: string) => istek<Bos>(k(id), { method: "DELETE" });
export const koleksiyonaEkle = (id: string, oyunId: string) => istek<Bos>(`${k(id)}/oyunlar`, { method: "POST", body: JSON.stringify({ oyunId }) });
export const koleksiyondanCikar = (id: string, oyunId: string) => istek<Bos>(`${k(id)}/oyunlar/${encodeURIComponent(oyunId)}`, { method: "DELETE" });
export const benzerOyunlarGetir = (oyunId: string) =>
  istek<{ oyunlar: ToplulukOzeti[] }>(`/api/topluluk/${encodeURIComponent(oyunId)}/benzer`, {}, "Benzer oyunlar okunamadı.");

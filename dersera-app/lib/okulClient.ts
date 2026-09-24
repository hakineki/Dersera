import type { KutuphaneDetayi } from "@/lib/libraryClient";
import type { HavuzluOkul, OkulPanosu, OkulumYaniti, PaylasimListesiOgesi } from "@/lib/okulService";

type Hata = { error: string; status?: number };

async function iste<T>(url: string, init?: RequestInit): Promise<T | Hata> {
  try {
    const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json.error ?? "İşlem yapılamadı.", status: res.status };
    return json as T;
  } catch {
    return { error: "Bağlantı kurulamadı." };
  }
}
const gonder = <T>(url: string, body: unknown = {}) => iste<T>(url, { method: "POST", body: JSON.stringify(body) });

export const okulBilgisi = () => iste<OkulumYaniti>("/api/okul");
export const okulOlustur = (ad: string) => gonder<OkulumYaniti>("/api/okul", { ad });
export const okulaKatil = (kod: string) => gonder<OkulumYaniti>("/api/okul/katil", { kod });
export const okuldanAyril = () => gonder<object>("/api/okul/ayril");
export const davetYenile = () => gonder<{ davetKodu: string }>("/api/okul/davet");
export const okulPanosu = () => iste<OkulPanosu>("/api/okul/pano");
export const okulKrediSiniri = (sinir: number) => gonder<{ sinir: number | null }>("/api/okul/kredi", { sinir });
export const uyeCikar = (hesapId: string) => iste<object>(`/api/okul/uyeler/${encodeURIComponent(hesapId)}`, { method: "DELETE" });
export const okulPaylasimlari = () => iste<{ oyunlar: PaylasimListesiOgesi[] }>("/api/okul/paylasim");
export const okullaPaylas = (kutuphaneId: string) => gonder<{ id: string }>("/api/okul/paylasim", { kutuphaneId });
export const okulPaylasimKaldir = (id: string) => iste<object>(`/api/okul/paylasim/${encodeURIComponent(id)}`, { method: "DELETE" });

// Composer'da "Kullan": kütüphane detayıyla aynı biçim.
export async function okulOyunu(id: string): Promise<KutuphaneDetayi | null> {
  const r = await iste<KutuphaneDetayi>(`/api/okul/paylasim/${encodeURIComponent(id)}`);
  return "error" in r ? null : r;
}

// Platform yöneticisi: okul kredi havuzları (app/yonetim/okul-havuzu).
export const havuzListesiGetir = () => iste<{ ay: string; okullar: HavuzluOkul[] }>("/api/yonetim/okul-havuzu");
export const havuzOkulBul = (kod: string) => gonder<{ okul: HavuzluOkul }>("/api/yonetim/okul-havuzu", { kod });
export const havuzAta = (okulId: string, hak: number) => iste<{ okul: HavuzluOkul }>("/api/yonetim/okul-havuzu", { method: "PUT", body: JSON.stringify({ okulId, hak }) });

// Öğretmen hesabı istemcisi. Oturum httpOnly çerezdedir; tarayıcı kodu belirteci hiç görmez.

export interface HesapOzeti {
  kullaniciAdi: string;
  olusturma: number;
}

export type AuthYaniti = { hesap: HesapOzeti } | { error: string };

// Hesap öncesi sürümün tarayıcıda bıraktığı yerel giriş bilgileri (düz metin şifre dahil) silinir.
const ESKI_YEREL_ANAHTARLAR = ["dersera:teacher-creds", "dersera:teacher-session"];

export function eskiYerelGirisiTemizle(): void {
  try {
    ESKI_YEREL_ANAHTARLAR.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

async function gonder(path: string, body: unknown): Promise<AuthYaniti> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    return res.ok ? { hesap: json.hesap } : { error: json.error ?? "İşlem yapılamadı." };
  } catch {
    return { error: "Bağlantı kurulamadı." };
  }
}

// null: giriş yok; undefined: sunucuya ulaşılamadı.
export async function oturumBilgisi(): Promise<{ hesap: HesapOzeti | null; davetGerekli: boolean; kayitKapali: boolean; yonetici: boolean } | undefined> {
  try {
    const res = await fetch("/api/auth/ben", { cache: "no-store" });
    if (!res.ok) return undefined;
    const json = await res.json();
    return { hesap: json.hesap ?? null, davetGerekli: !!json.davetGerekli, kayitKapali: !!json.kayitKapali, yonetici: !!json.yonetici };
  } catch {
    return undefined;
  }
}

export const girisYap = (kullaniciAdi: string, sifre: string) => gonder("/api/auth/giris", { kullaniciAdi, sifre });
export const kayitOl = (kullaniciAdi: string, sifre: string, davetKodu: string, kosulOnayi: boolean) =>
  gonder("/api/auth/kayit", { kullaniciAdi, sifre, davetKodu, kosulOnayi });
export const sifreDegistir = (mevcutSifre: string, yeniSifre: string) => gonder("/api/auth/sifre", { mevcutSifre, yeniSifre });
export const kullaniciAdiDegistir = (yeniKullaniciAdi: string, sifre: string) => gonder("/api/auth/ad", { yeniKullaniciAdi, sifre });
// Başarıda sunucu oturum çerezini de siler.
export const hesabimiSil = (sifre: string) => gonder("/api/auth/hesap-sil", { sifre });

// E-posta ve şifre sıfırlama: yanıt gövdesi ya da { error }.
export type Yanit<T> = T | { error: string };
async function istek<T>(path: string, body?: unknown): Promise<Yanit<T>> {
  try {
    const res = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    return res.ok ? (json as T) : { error: json.error ?? "İşlem yapılamadı." };
  } catch {
    return { error: "Bağlantı kurulamadı." };
  }
}
export interface EpostaDurumu {
  adres: string;
  dogrulandi: boolean;
}
export const epostaDurumuAl = () => istek<{ eposta: EpostaDurumu | null }>("/api/auth/eposta");
export const epostaKaydet = (adres: string, sifre: string) => istek<{ eposta: EpostaDurumu }>("/api/auth/eposta", { adres, sifre });
export const epostaSil = (sifre: string) => istek<{ ok: true }>("/api/auth/eposta/kaldir", { sifre });
export const epostaDogrula = (t: string) => istek<{ adres: string }>("/api/auth/eposta/dogrula", { t });
export const sifirlamaIste = (girdi: string) => istek<{ mesaj: string }>("/api/auth/sifre-sifirlama/iste", { girdi });
export const sifreSifirla = (t: string, yeniSifre: string) => istek<{ ok: true }>("/api/auth/sifre-sifirlama", { t, yeniSifre });

export async function cikisYap(): Promise<void> {
  try {
    await fetch("/api/auth/cikis", { method: "POST" });
  } catch {
    /* çerez sunucuda silinemese de istemci giriş ekranına döner */
  }
}

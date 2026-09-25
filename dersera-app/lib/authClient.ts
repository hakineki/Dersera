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

export async function cikisYap(): Promise<void> {
  try {
    await fetch("/api/auth/cikis", { method: "POST" });
  } catch {
    /* çerez sunucuda silinemese de istemci giriş ekranına döner */
  }
}

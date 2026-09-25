import type { GameDefinition } from "@/lib/composer/definition";
import type { DersKonu } from "@/lib/composer/input";

// Topluluk kütüphanesi: yayınlanan composer oyunlarının herkese açık listesi.
// Liste yalnız özet taşır (cevaplar yok); tam oyun yalnız öğretmen oturumuyla okunur.

export const TOPLULUK_SAYFA = 20;

export interface ToplulukOzeti {
  oyun_id: string;
  baslik: string;
  ders: string;
  konu: string;
  sinif: number;
  sure_dk: number;
  alan: GameDefinition["meta"]["alan"];
  deneyim: GameDefinition["meta"]["deneyim"];
  yayin_tarihi: number;
  oynanma_sayisi: number;
  // Öğrenci puanı (kovalı anlık görüntü).
  puan_ortalama: number | null;
  puan_sayisi: number;
  // Oyunu sınıfında oynatan öğretmenlerin puanı (en az ogretmenPuaniGosterim öğretmen puanlayınca görünür).
  ogretmen_puan_ortalama: number | null;
  ogretmen_puan_sayisi: number;
  aktif: boolean;
}

// Topluluğa giriş (docs/URUN-BAGLAMI.md §8): kütüphanedeki oyun kalite eşiğini geçince öğretmen gönderir, iki bağımsız
// öğretmen incelemesiyle yayına girer. Kurallar tek yerde; ödül politikası kredi ekonomisiyle eklenecek.
export const TOPLULUK_KURALLARI = {
  enAzOgrenci: 10,
  enAzPuan: 3.5,
  hesapYasiGun: 3,
  gunlukGonderim: 1,
  gerekliKabul: 2,
  redEsigi: 2,
  // Başlangıç dönemi: toplulukta yayındaki oyun bu sayıya ulaşana kadar gönderim incelemesiz yayına girer; öğrenci/puan
  // eşiği, hesap yaşı ve günlük sınır uygulanmaz, topluluk kredi ödülü verilmez. Otomatik içerik kapıları her zaman
  // geçerlidir; kayıt yöneticinin moderasyon kuyruğuna "incelemesiz" olarak düşer.
  baslangicYayinSayisi: 100,
  notEnAz: 10,
  notEnCok: 300,
  // Öğretmen puanı: yalnız oyunu kendi sınıfında oynatan (yayınladığı kodlarda en az bu kadar öğrenci bitiren) öğretmen.
  ogretmenPuaniEnAzOgrenci: 5,
  ogretmenPuaniGosterim: 3,
} as const;

export const ogretmenOrtalamasi = (toplam: number, sayi: number): number | null =>
  sayi >= TOPLULUK_KURALLARI.ogretmenPuaniGosterim ? Math.round((toplam / sayi) * 10) / 10 : null;

// "inceleme": kuyrukta; "yayinda": listede; "reddedildi": iki ret; "geri-cekildi": sahibi kaldırdı.
export type ToplulukDurumu = "inceleme" | "yayinda" | "reddedildi" | "geri-cekildi";

export interface Inceleme {
  // İnceleyen hesabın kütüphane sahibi kimliği; hiçbir yanıtta dışarı verilmez.
  inceleyen: string;
  karar: "kabul" | "ret";
  not: string;
  tarih: number;
}

// Depodaki tam kayıt. Gizli alanlar (olusturan, kaynak, onceki_id) herkese açık yanıtlara girmez.
export interface ToplulukKaydi extends Omit<ToplulukOzeti, "oynanma_sayisi" | "ogretmen_puan_ortalama" | "ogretmen_puan_sayisi"> {
  olusturan: string;
  definition: GameDefinition;
  dersler: DersKonu[];
  // Bu alanlardan önce açılmış kayıtlarda yoktur: durumu olmayan kayıt yayındadır.
  durum?: ToplulukDurumu;
  // Gönderen kütüphane kaydı ("sahip:kutuphaneId") ve onaylanınca yerini alacağı, o an yayındaki önceki sürüm.
  kaynak?: string;
  onceki_id?: string | null;
  gonderim_tarihi?: number;
  // Başlangıç döneminde incelemesiz yayına girdi (topluluk ödülü verilmedi).
  onaysiz?: true;
}

// Durumu olmayan eski kayıt: aktifse yayında, değilse (eski sürüm olarak pasife alınmış) geri çekilmiş sayılır.
export const durumOf = (k: Pick<ToplulukKaydi, "durum" | "aktif">): ToplulukDurumu => k.durum ?? (k.aktif ? "yayinda" : "geri-cekildi");

export interface ToplulukFiltresi {
  ders?: string; // ders adı, ör. "Fizik"
  sinif?: number;
  alan?: GameDefinition["meta"]["alan"];
  deneyim?: GameDefinition["meta"]["deneyim"];
  q?: string;
}

const norm = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();

export function filtredenGecer(o: ToplulukOzeti, f: ToplulukFiltresi): boolean {
  if (!o.aktif || o.oynanma_sayisi < 0) return false;
  if (f.ders && !o.ders.split(" + ").includes(f.ders)) return false;
  if (f.sinif && o.sinif !== f.sinif) return false;
  if (f.alan && o.alan !== f.alan) return false;
  if (f.deneyim && o.deneyim !== f.deneyim) return false;
  if (f.q) {
    const q = norm(f.q);
    if (![o.baslik, o.ders, o.konu].some((alan) => norm(alan).includes(q))) return false;
  }
  return true;
}

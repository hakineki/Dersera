import type { GameDefinition } from "@/lib/composer/definition";
import type { Bulgu, KapiId, YonetisimSonucu } from "@/lib/composer/yonetisim";

// Moderasyon kuyruğu (docs/URUN-BAGLAMI.md V2): içerik kapılarından (çocuk güvenliği, benzerlik) uyarı ya da engel
// alan yayınlar yöneticinin önüne gelir. Pedagojik uyarılar (ör. ipucu cevabı söylüyor) kuyruğa girmez.
// "sinif-yayini": uyarıyla yayınlanmış sınıf oyunu (kaldırılırsa oyun biter).
// "topluluk": uyarıyla topluluğa gönderilmiş oyun (kaldırılırsa reddedilir).
// "engellenen": yayını engellenmiş içerik (yalnız bilgi; kötüye kullanımı görmek için).

export const MODERASYON = {
  // Kuyrukta tutulan en çok kayıt; eskiler kuyruktan düşer ve saklama süresi sonunda silinir.
  enCokKayit: 300,
  saklamaGun: 30,
  // Oturumsuz yayın uç noktasından saatte en çok bu kadar kayıt (IP başına).
  ipSaatlik: 20,
  notEnCok: 300,
} as const;

export const MODERASYON_KAPILARI: KapiId[] = ["cocuk-guvenligi", "benzerlik"];

export type ModerasyonTuru = "sinif-yayini" | "topluluk" | "engellenen";
export type ModerasyonKarari = "temiz" | "kaldir";

export interface ModerasyonBulgusu {
  kapi: string;
  karar: "REVIEW" | "BLOCK";
  mesaj: string;
}

export interface ModerasyonSonucu {
  karar: ModerasyonKarari;
  not: string;
  yonetici: string;
  tarih: number;
}

export interface ModerasyonKaydi {
  id: string;
  tur: ModerasyonTuru;
  tarih: number;
  karar: "REVIEW" | "BLOCK";
  baslik: string;
  sinif: number | null;
  ders: string;
  // Gönderen öğretmen (kütüphane sahibi kimliği); oturumsuz yayında null.
  sahip: string | null;
  kod?: string;
  toplulukId?: string;
  bulgular: ModerasyonBulgusu[];
  definition?: GameDefinition;
  durum: "bekliyor" | "kapatildi";
  sonuc?: ModerasyonSonucu;
}

// Listede tanım taşınmaz (boyut); ayrıntıda gelir.
export type ModerasyonOzeti = Omit<ModerasyonKaydi, "definition">;
export function ozetOf(k: ModerasyonKaydi): ModerasyonOzeti {
  const o: ModerasyonOzeti & { definition?: unknown } = { ...k };
  delete o.definition;
  return o;
}

// Kuyruğa girer mi: içerik kapılarından biri PASS değilse.
export function moderasyonGerekli(y: YonetisimSonucu): boolean {
  return y.kapilar.some((k) => MODERASYON_KAPILARI.includes(k.kapi) && k.karar !== "PASS");
}

// Yöneticiye tüm kapıların bulguları gösterilir (içerik kapıları önce).
export function bulgulariOf(y: YonetisimSonucu): ModerasyonBulgusu[] {
  const sira = (kapi: string) => (MODERASYON_KAPILARI.includes(kapi as KapiId) ? 0 : 1);
  return [...y.kapilar]
    .sort((a, b) => sira(a.kapi) - sira(b.kapi))
    .flatMap((k) => k.bulgular.map((b) => ({ kapi: k.kapi, karar: b.karar, mesaj: b.mesaj })));
}

export const klasikBulgulari = (b: Bulgu[]): ModerasyonBulgusu[] => b.map((x) => ({ kapi: "cocuk-guvenligi", karar: x.karar, mesaj: x.mesaj }));

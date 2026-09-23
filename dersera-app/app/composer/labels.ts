import type { GorevTuru } from "@/lib/composer/definition";

export const GOREV_TUR_ADI: Record<GorevTuru, string> = {
  coktan_secmeli: "Çoktan seçmeli",
  eslestirme: "Eşleştirme",
  siralama: "Sıralama",
  surukle_birak: "Sürükle-bırak",
  gorsel_secim: "Görsel seçim",
  sayisal: "Sayısal",
};

export const DENEYIM_SECENEKLERI = [
  { key: "macera", ikon: "🎮", ad: "Macera Ağırlıklı", aciklama: "Güçlü hikâye, keşif ve seçimler" },
  { key: "dengeli", ikon: "⚖️", ad: "Dengeli", aciklama: "Hikâye ve ders eşit ağırlıkta" },
  { key: "ders", ikon: "📚", ad: "Ders Ağırlıklı", aciklama: "Yoğun öğrenme, hafif hikâye" },
] as const;

export const ALAN_SECENEKLERI = [
  { key: "sinif", ikon: "🏫", ad: "Tek Sınıf", aciklama: "Sınıftan çıkmadan, sanal sahnelerle" },
  { key: "okul", ikon: "🗺️", ad: "Okul Macerası", aciklama: "QR kütüphanesindeki duraklarla" },
] as const;

export const CEVAP_BICIMI: Record<GorevTuru, string> = {
  coktan_secmeli: "Seçeneklerden birini aynen yazın.",
  gorsel_secim: "Seçeneklerden birini aynen yazın.",
  siralama: "Öğeleri doğru sırayla ' | ' ile ayırın.",
  surukle_birak: "Öğeleri doğru sırayla ' | ' ile ayırın.",
  eslestirme: "Tüm çiftleri ' | ' ile ayırın (her satır 'sol => sağ').",
  sayisal: "Yalnızca sayı (ör. 12 veya 3,5). Seçenek bırakmayın.",
};

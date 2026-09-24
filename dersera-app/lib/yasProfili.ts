// Yaş profilleri (docs/URUN-BAGLAMI.md §5): öğrenci deneyimi ve üretilen içeriğin dili sınıfa göre değişir.
// Profil sınıftan türetilir; kayıtlı oyunlarda ayrı bir alan tutulmaz. Müfredat verisi ilkokul (1–4), ortaokul (5–8)
// ve lise (9–12) içindir; okul öncesi profili o kademenin programı eklenince açılır.

export type YasProfili = "PRESCHOOL_3_5" | "PRIMARY_6_10" | "MIDDLE_11_14" | "HIGH_15_18";

export interface ProfilTanimi {
  ad: string;
  yas: string;
  // Üretim istemine eklenen profil kuralları.
  istem: string[];
}

export const PROFILLER: Record<YasProfili, ProfilTanimi> = {
  PRESCHOOL_3_5: {
    ad: "Okul öncesi",
    yas: "3–5",
    istem: ["Gör → dinle → dokun: en az metin, büyük dokunma alanları, sese dayalı yönerge.", "Sıralama ya da yarış baskısı yok."],
  },
  PRIMARY_6_10: {
    ad: "İlkokul",
    yas: "6–10",
    istem: [
      "Görsel keşif ve çok kısa metin: bir cümle en çok 12 kelime; hikâye metni en çok üç kısa cümle.",
      "1. ve 2. sınıfta okuma yeni gelişir: soru ve seçenekler birkaç kelime; metin öğretmen tarafından yüksek sesle okunabilecek sadelikte.",
      "Eşleştirme, sıralama, sürükle-bırak ve görsel seçim görevleri öncelikli; sayısal görevde küçük, somut sayılar.",
      "Somut ve tanıdık bağlam (aile, okul, oyun, hayvanlar, doğa); soyut terim kullanma ya da hemen örnekle açıkla.",
      "Envanter basit: az sayıda, kolay tanınan nesne.",
    ],
  },
  MIDDLE_11_14: {
    ad: "Ortaokul",
    yas: "11–14",
    istem: [
      "Görev/macera kurgusu: dallanma, kanıt toplama ve bulmaca merkezde.",
      "Dil kısa ve somut: bir cümle en çok 20 kelime; hikâye metni birkaç cümle.",
      "Soyut kavramları öğrencinin tanıdığı günlük hayat bağlamıyla (okul, ev, mahalle, oyun, doğa) kur.",
      "İpuçları adım adım yönlendirir; öğrencinin yaşına uygun sözcükler kullanılır, terimler ilk geçtiği yerde açıklanır.",
    ],
  },
  HIGH_15_18: {
    ad: "Lise",
    yas: "15–18",
    istem: [
      "Araştırma, karar ve sentez: öğrenci kanıtı değerlendirir, gerekçeli karar verir, bilgileri birleştirir.",
      "Olgun ve atmosferik anlatım; çocuksu maskot ya da sevimli karakterlere dayanma.",
      "Görevler çıkarım, karşılaştırma ve yorum gerektirir; tek adımlı ezber sorularından kaçın.",
    ],
  },
};

export function yasProfiliOf(sinif: number): YasProfili {
  if (sinif <= 0) return "PRESCHOOL_3_5";
  if (sinif <= 4) return "PRIMARY_6_10";
  if (sinif <= 8) return "MIDDLE_11_14";
  return "HIGH_15_18";
}

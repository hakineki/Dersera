import type { Ders } from "./mufredat";

export interface Stop {
  id: string;
  order: number;
  name: string;
  emoji: string;
  subject: string;   // görüntü adı
  dersKey: Ders;     // müfredat arama anahtarı
  nextStopId: string | null;
  nextClue: string;
  hikaye?: string;
}

export const HIKAYE: Record<string, string> = {
  bahce:
    "Okul müdürünün masasından gizli bir dosya çalındı! Tek ipucu bahçede bırakılmış. Matematik şifreni çöz ve dosyanın izini sürdür...",
  koridor:
    "Birinci iz çözüldü! Kamera görüntüleri şüpheliyi koridorda gösteriyor. Fizik bilginle koridordaki gizemi aç!",
  "kimya-lab":
    "İz laboratuvara uzanıyor! Masada kimyasal bir not bırakılmış. Kimya sorusunu çöz ve ipucunu yakala!",
  kutuphane:
    "Laboratuvardan çıkan iz kütüphaneye ulaştı. Eski kitabın içine gizlenmiş şifreli mesaj var. Türk Dili ve Edebiyatı bilginle kilidi aç!",
  "mudur-odasi":
    "Son adım! Dosyanın müdür odasında saklandığı kesinleşti. Son soruyu çöz ve dosyayı kurtar!",
};

export const GENEL_HIKAYE = "Yeni bir iz buldun! Soruyu çöz ve gizemin peşine düş.";

export const stops: Stop[] = [
  {
    id: "bahce",
    order: 1,
    name: "Bahçe",
    emoji: "🌳",
    subject: "Matematik",
    dersKey: "matematik",
    nextStopId: "koridor",
    nextClue:
      "🎉 Matematik sihirini kullandın! Sıradaki durak: Okulun içinden uzanan, sınıfları birbirine bağlayan uzun yolda bir QR kod seni bekliyor. Koridora git! 🚶",
  },
  {
    id: "koridor",
    order: 2,
    name: "Koridor",
    emoji: "🏫",
    subject: "Fizik",
    dersKey: "fizik",
    nextStopId: "kimya-lab",
    nextClue:
      "🎉 Fiziği çok iyi biliyorsun! Sıradaki durak: Deneylerin ve ölçümlerin yapıldığı, kimyasal tepkimelerin gözlemlendiği o özel odayı bul. Laboratuvara git! ⚗️",
  },
  {
    id: "kimya-lab",
    order: 3,
    name: "Laboratuvar",
    emoji: "⚗️",
    subject: "Kimya",
    dersKey: "kimya",
    nextStopId: "kutuphane",
    nextClue:
      "🎉 Kimya dahisi! Sıradaki durak: Binlerce kitabın sessiz nöbet tuttuğu, bilginin biriktiği o özel mekânı bul. Kütüphaneye git! 📚",
  },
  {
    id: "kutuphane",
    order: 4,
    name: "Kütüphane",
    emoji: "📚",
    subject: "Türk Dili ve Edebiyatı",
    dersKey: "turk-dili",
    nextStopId: "mudur-odasi",
    nextClue:
      "🎉 Edebiyat dahisi! Son durak çok önemli bir yerde: Okulun kalbinde, en önemli kararların alındığı kapının önünde son meydan okuma seni bekliyor. Müdür Odası'nın kapısına git! 🚪",
  },
  {
    id: "mudur-odasi",
    order: 5,
    name: "Müdür Odası Kapısı",
    emoji: "🚪",
    subject: "Matematik",
    dersKey: "matematik",
    nextStopId: null,
    nextClue:
      "🏆 TEBRİKLER! Tüm 5 durağı tamamladın! Bahçeden başlayıp Müdür Odası'na kadar gelen bu macera yolculuğunu tamamladın! Sen gerçek bir bilgi kâşifisin! Öğretmenine git ve ödülünü al! 🌟",
  },
];


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
}

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
    nextStopId: "fizik-lab",
    nextClue:
      "🎉 Fiziği çok iyi biliyorsun! Sıradaki durak: Deneylerin ve ölçümlerin yapıldığı, kimyasal tepkimelerin gözlemlendiği o özel odayı bul. Laboratuvara git! ⚗️",
  },
  {
    id: "fizik-lab",
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
    subject: "Türk Edebiyatı",
    dersKey: "edebiyat",
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

export function getStop(id: string): Stop | undefined {
  return stops.find((s) => s.id === id);
}

export function getNextStop(currentId: string): Stop | undefined {
  const current = getStop(currentId);
  if (!current?.nextStopId) return undefined;
  return getStop(current.nextStopId);
}

export interface Stop {
  id: string;
  order: number;
  name: string;
  emoji: string;
  subject: string;
  question: string;
  options: string[];
  correctIndex: number;
  hint: string;
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
    question: "x² − 5x + 6 = 0 denkleminin kökleri hangi seçenekte doğru verilmiştir?",
    options: ["x = 2 ve x = 3", "x = −2 ve x = −3", "x = 1 ve x = 6", "x = −1 ve x = −6"],
    correctIndex: 0,
    hint: "💡 İpucu: Denklemi çarpanlarına ayır. Hangi iki sayının çarpımı 6, toplamı 5 eder?",
    nextStopId: "koridor",
    nextClue:
      "🎉 Muhteşem! Matematik sihirini kullandın! Sıradaki durak: Okulun içinden uzanan, sınıfları birbirine bağlayan uzun yolda bir QR kod sizi bekliyor. Koridora gidin! 🚶",
  },
  {
    id: "koridor",
    order: 2,
    name: "Koridor",
    emoji: "🏫",
    subject: "Biyoloji",
    question:
      "Hücre bölünmesi (mitoz) öncesinde DNA'nın kopyalanması hangi evrede gerçekleşir?",
    options: ["İnterfaz", "Profaz", "Metafaz", "Anafaz"],
    correctIndex: 0,
    hint: "💡 İpucu: Bölünme başlamadan önce hücrenin hazırlık yaptığı evreyi düşün. Mitoz öncesi geçen uzun süre...",
    nextStopId: "fizik-lab",
    nextClue:
      "🎉 Harika! Biyolojiyi çok iyi biliyorsun! Sıradaki durak: Deneylerin ve ölçümlerin yapıldığı, elektrik devrelerinin kurulduğu o özel odayı bul. Fizik Laboratuvarı seni bekliyor! ⚡",
  },
  {
    id: "fizik-lab",
    order: 3,
    name: "Fizik Laboratuvarı",
    emoji: "⚗️",
    subject: "Fizik",
    question:
      "Ohm Kanunu'na göre direnç sabit kalırken voltaj 2 katına çıkarılırsa akım ne olur?",
    options: [
      "2 katına çıkar",
      "Yarıya iner",
      "Değişmez",
      "4 katına çıkar",
    ],
    correctIndex: 0,
    hint: "💡 İpucu: V = I × R formülünü kullan. R sabit kalıyor, V ikiyle çarpılıyor. I ne olur?",
    nextStopId: "kutuphane",
    nextClue:
      "🎉 Elektrik gibi zekisin! Sıradaki durak: Binlerce kitabın sessiz nöbet tuttuğu, bilginin biriktiği o özel mekânı bul. Kütüphaneye git! 📚",
  },
  {
    id: "kutuphane",
    order: 4,
    name: "Kütüphane",
    emoji: "📚",
    subject: "Türk Edebiyatı",
    question:
      "Aşağıdaki şairlerden hangisi Servet-i Fünun (Edebiyat-ı Cedide) döneminin öncü ismidir?",
    options: ["Tevfik Fikret", "Namık Kemal", "Yahya Kemal Beyatlı", "Mehmet Akif Ersoy"],
    correctIndex: 0,
    hint: "💡 İpucu: 1896'da Servet-i Fünun dergisinin başına geçen ve 'Sis' şiiriyle tanınan şairi düşün.",
    nextStopId: "mudur-odasi",
    nextClue:
      "🎉 Edebiyat dahisi! Son durak çok önemli bir yerde: Okulun kalbinde, en önemli kararların alındığı kapının önünde son meydan okuma seni bekliyor. Müdür Odası'nın kapısına git! 🚪",
  },
  {
    id: "mudur-odasi",
    order: 5,
    name: "Müdür Odası Kapısı",
    emoji: "🚪",
    subject: "Tarih",
    question: "Osmanlı Devleti hangi yılda kurulmuştur?",
    options: ["1299", "1389", "1453", "1517"],
    correctIndex: 0,
    hint: "💡 İpucu: Osman Bey'in bağımsızlığını ilan ettiği yılı düşün. 13. yüzyılın sonları...",
    nextStopId: null,
    nextClue:
      "🏆 TEBRİKLER! Tüm 5 durakta başarılı oldun! Bahçeden başlayıp Müdür Odası'na kadar gelen bu macera yolculuğunu tamamladın! Sen gerçek bir bilgi kâşifisin! Öğretmenine git ve ödülünü al! 🌟",
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

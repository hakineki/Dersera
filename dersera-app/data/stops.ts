export interface Stop {
  id: string;
  order: number;
  name: string;
  emoji: string;
  subject: string;
  question: string;
  options: string[];
  correctIndex: number;
  hint1: string;
  hint2: string;
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
    hint1: "💡 İpucu 1: Denklemi çarpanlarına ayır. (x − a)(x − b) = 0 biçimini kullan.",
    hint2: "💡 İpucu 2: Hangi iki sayının çarpımı 6, toplamı 5 eder? Cevap: 2 ve 3.",
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
    hint1: "💡 İpucu 1: Mitoz'un 4 evresi vardır: Profaz, Metafaz, Anafaz, Telofaz. DNA eşlenmesi bunlardan önce gelir.",
    hint2: "💡 İpucu 2: Bölünme başlamadan önce hücrenin hazırlandığı evre 'İnterfaz'dır. Bu evrede DNA kopyalanır.",
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
    hint1: "💡 İpucu 1: Ohm Kanunu'nu formül olarak yaz: V = I × R. Değişken ve sabit olan ne?",
    hint2: "💡 İpucu 2: R sabit, V = 2V₀ → 2V₀ = I × R → I = 2V₀/R = 2 × (V₀/R). Akım 2 katına çıkar.",
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
    hint1: "💡 İpucu 1: Servet-i Fünun 1895–1901 yılları arasında çıkan bir dergiydi. Şiirleri hem öz hem biçim bakımından yenileyen şairi düşün.",
    hint2: "💡 İpucu 2: 'Sis' ve 'Haluk'un Defteri' şiirleriyle tanınan bu şair, Servet-i Fünun dergisinin başına 1896'da geçti.",
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
    hint1: "💡 İpucu 1: Osmanlı Devleti'ni kuran bey, Ertuğrul Gazi'nin oğluydu. Kuruluş 13. yüzyılın son çeyreğine denk gelir.",
    hint2: "💡 İpucu 2: Osman Bey 1281'de beyi oldu; devlet resmen 1299'da kuruldu — şıklara bir daha bak.",
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

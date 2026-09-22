// Şablon: sinif9.ts, sinif11.ts, sinif12.ts aynı AylikPlan[] yapısını kullanır.

export type Ders =
  | "matematik"
  | "fizik"
  | "kimya"
  | "turk-dili"
  | "biyoloji"
  | "tarih"
  | "cografya"
  | "felsefe"
  | "din-kulturu"
  | "genel-kultur";

export interface Soru {
  soru: string;
  secenekler: [string, string, string, string];
  dogruIndex: 0 | 1 | 2 | 3;
  ipucu1: string;
  ipucu2: string;
}

export interface Konu {
  ad: string;
  sorular: [Soru, Soru, Soru];
}

export interface AylikPlan {
  ay: string;
  ayAdi: string;
  dersler: Partial<Record<Ders, Konu>>;
}

export const sinif10: AylikPlan[] = [
  {
    ay: "eylul",
    ayAdi: "Eylül",
    dersler: {
      matematik: {
        ad: "Permütasyon ve Kombinasyon",
        sorular: [
          {
            soru: "5 farklı kitap rafa kaç farklı biçimde dizilir?",
            secenekler: ["60", "120", "20", "24"],
            dogruIndex: 1,
            ipucu1: "💡 n farklı nesnenin sıralı dizilme sayısı n! ile hesaplanır.",
            ipucu2: "💡 5! = 5 × 4 × 3 × 2 × 1 = 120",
          },
          {
            soru: "P(5, 2) değeri kaçtır?",
            secenekler: ["10", "20", "25", "5"],
            dogruIndex: 1,
            ipucu1: "💡 P(n, r) = n! / (n − r)! formülünü kullan.",
            ipucu2: "💡 P(5, 2) = 5! / 3! = 5 × 4 = 20",
          },
          {
            soru: "C(6, 2) kombinasyon değeri kaçtır?",
            secenekler: ["30", "15", "12", "9"],
            dogruIndex: 1,
            ipucu1: "💡 C(n, r) = n! / (r! × (n − r)!) formülünü kullan.",
            ipucu2: "💡 C(6, 2) = (6 × 5) / (2 × 1) = 15",
          },
        ],
      },
      fizik: {
        ad: "Elektrik Akımı ve Direnç",
        sorular: [
          {
            soru: "Elektrik akımının SI birim sistemi cinsinden birimi nedir?",
            secenekler: ["Volt", "Ohm", "Amper", "Watt"],
            dogruIndex: 2,
            ipucu1: "💡 Elektrik akımı birim zamanda geçen yük miktarıdır.",
            ipucu2: "💡 Akım = Yük / Zaman; birimi Amper (A).",
          },
          {
            soru: "I = Q / t formülünde Q neyi simgeler?",
            secenekler: ["Güç", "Elektrik yükü", "Direnç", "Gerilim"],
            dogruIndex: 1,
            ipucu1: "💡 I akım, t zaman — diğer harf hangi büyüklüktür?",
            ipucu2: "💡 Q, 'charge' (yük) sözcüğünden gelir; birimi Coulomb.",
          },
          {
            soru: "Bir iletkende direnci artıran etken hangisidir?",
            secenekler: [
              "Kesit alanını artırmak",
              "Boyunu kısaltmak",
              "Boyunu uzatmak",
              "Sıcaklığı düşürmek",
            ],
            dogruIndex: 2,
            ipucu1: "💡 Direnç, uzunlukla doğru; kesit alanıyla ters orantılıdır.",
            ipucu2: "💡 R = ρL/A — L arttıkça R artar.",
          },
        ],
      },
      kimya: {
        ad: "Kimyanın Temel Kanunları",
        sorular: [
          {
            soru: "Lavoisier'in kütlenin korunumu yasasına göre tepkimeye giren kütlelerin toplamı çıkan ürünlerin toplamına nasıldır?",
            secenekler: [
              "Her zaman eşittir",
              "Ürünler daha ağırdır",
              "Reaktifler daha ağırdır",
              "Yalnızca gaz tepkimelerinde eşittir",
            ],
            dogruIndex: 0,
            ipucu1: "💡 Madde ne yaratılabilir ne yok edilebilir.",
            ipucu2: "💡 Kütlenin korunumu: m_girişen = m_ürün",
          },
          {
            soru: "Sabit oranlar kanununa göre bir bileşiğin elementlerinin kütlece oranı nasıldır?",
            secenekler: [
              "Değişkendir",
              "Her zaman sabittir",
              "Sıcaklığa bağlıdır",
              "Basınca göre değişir",
            ],
            dogruIndex: 1,
            ipucu1: "💡 Her saf bileşiğin kendine özgü bir bileşimi vardır.",
            ipucu2: "💡 Su (H₂O) her zaman 1:8 oranında H ve O içerir.",
          },
          {
            soru: "Katlı oranlar kanunu hangi bilim insanına aittir?",
            secenekler: ["Dalton", "Lavoisier", "Proust", "Avogadro"],
            dogruIndex: 0,
            ipucu1: "💡 Bu bilim insanı atom teorisini de geliştirdi.",
            ipucu2: "💡 John Dalton (1766–1844) katlı oranlar kanununu keşfetti.",
          },
        ],
      },
      "turk-dili": {
        ad: "Edebiyat-Tarih İlişkisi ve Türk Alfabesi",
        sorular: [
          {
            soru: "Türkiye'de Latin alfabesine geçiş hangi yılda gerçekleşmiştir?",
            secenekler: ["1923", "1928", "1932", "1924"],
            dogruIndex: 1,
            ipucu1: "💡 Harf Devrimi Cumhuriyet'in ilk yıllarında yaşandı.",
            ipucu2: "💡 1 Kasım 1928'de yürürlüğe girdi.",
          },
          {
            soru: "Edebi eserlerin dönemin koşullarıyla ilişkilendirilmesinin amacı nedir?",
            secenekler: [
              "Eserleri yalnızca sanatsal açıdan değerlendirmek",
              "Eserleri hem tarihsel hem toplumsal bağlamda anlamak",
              "Yalnızca yazarın hayatını incelemek",
              "Eserlerin dilini sadeleştirmek",
            ],
            dogruIndex: 1,
            ipucu1: "💡 Edebi eserler, yazıldıkları dönemin aynasıdır.",
            ipucu2: "💡 Tarihsel bağlam eserin hem içeriğini hem biçimini etkiler.",
          },
          {
            soru: "Osmanlı Türkçesi hangi alfabeyle yazılıyordu?",
            secenekler: ["Latin", "Kiril", "Arap", "Grek"],
            dogruIndex: 2,
            ipucu1: "💡 Bu alfabe sağdan sola yazılır.",
            ipucu2: "💡 İslam kültürünün etkisiyle Arap alfabesi benimsendi.",
          },
        ],
      },
    },
  },
  {
    ay: "ekim",
    ayAdi: "Ekim",
    dersler: {
      matematik: {
        ad: "Olasılık ve Binom Teoremi",
        sorular: [
          {
            soru: "Madeni para 3 kez atıldığında tam 2 tura gelme olasılığı nedir?",
            secenekler: ["1/4", "3/8", "1/2", "1/8"],
            dogruIndex: 1,
            ipucu1: "💡 C(3,2) olası biçimleri, 2³ toplam çıktıyı verir.",
            ipucu2: "💡 P = C(3,2) / 2³ = 3/8",
          },
          {
            soru: "3 kırmızı, 2 mavi top içeren torbadan rastgele çekilen topun kırmızı olma olasılığı nedir?",
            secenekler: ["2/5", "3/5", "1/2", "3/2"],
            dogruIndex: 1,
            ipucu1: "💡 Olasılık = İstenen sonuç / Toplam eşit olası sonuç",
            ipucu2: "💡 P(kırmızı) = 3 / (3+2) = 3/5",
          },
          {
            soru: "(1 + x)³ açılımında x² katsayısı kaçtır?",
            secenekler: ["1", "2", "3", "6"],
            dogruIndex: 2,
            ipucu1: "💡 Binom teoremi: C(n, k) × aⁿ⁻ᵏ × bᵏ",
            ipucu2: "💡 k=2 için: C(3,2) × 1¹ × x² = 3x²",
          },
        ],
      },
      fizik: {
        ad: "Ohm Kanunu ve Elektrik Devreleri",
        sorular: [
          {
            soru: "Ohm Kanunu'na göre direnç sabitken voltaj 3 katına çıkarılırsa akım ne olur?",
            secenekler: [
              "1/3'e düşer",
              "Değişmez",
              "3 katına çıkar",
              "9 katına çıkar",
            ],
            dogruIndex: 2,
            ipucu1: "💡 V = I × R → I = V / R",
            ipucu2: "💡 R sabit, V → 3V: I = 3V/R = 3 × I₀",
          },
          {
            soru: "2 Ω ve 3 Ω'luk iki direnç seri bağlandığında toplam direnç nedir?",
            secenekler: ["1,2 Ω", "2,5 Ω", "5 Ω", "6 Ω"],
            dogruIndex: 2,
            ipucu1: "💡 Seri bağlantıda dirençler toplanır.",
            ipucu2: "💡 R_toplam = 2 + 3 = 5 Ω",
          },
          {
            soru: "İki özdeş 6 Ω'luk direnç paralel bağlandığında eşdeğer direnç nedir?",
            secenekler: ["12 Ω", "6 Ω", "3 Ω", "1 Ω"],
            dogruIndex: 2,
            ipucu1: "💡 Paralel bağlantıda: 1/R = 1/R₁ + 1/R₂",
            ipucu2: "💡 1/R = 1/6 + 1/6 = 2/6 → R = 3 Ω",
          },
        ],
      },
      kimya: {
        ad: "Mol Kavramı",
        sorular: [
          {
            soru: "1 mol madde kaç tanecik içerir?",
            secenekler: [
              "6,02 × 10²³",
              "6,02 × 10²²",
              "3,01 × 10²³",
              "1,20 × 10²⁴",
            ],
            dogruIndex: 0,
            ipucu1: "💡 Bu sayı Avogadro sayısı olarak bilinir.",
            ipucu2: "💡 Nₐ = 6,02 × 10²³ mol⁻¹",
          },
          {
            soru: "18 g suyun mol sayısı kaçtır? (H₂O molar kütlesi = 18 g/mol)",
            secenekler: ["0,5 mol", "1 mol", "2 mol", "18 mol"],
            dogruIndex: 1,
            ipucu1: "💡 n = m / M formülünü kullan.",
            ipucu2: "💡 n = 18 / 18 = 1 mol",
          },
          {
            soru: "Aşağıdakilerden hangisi molar kütlenin birimidir?",
            secenekler: ["g", "mol", "g/mol", "mol/g"],
            dogruIndex: 2,
            ipucu1: "💡 Molar kütle, 1 mol maddenin kütlesidir.",
            ipucu2: "💡 Birim: gram / mol = g·mol⁻¹",
          },
        ],
      },
      "turk-dili": {
        ad: "Halk Hikayesi ve Dede Korkut",
        sorular: [
          {
            soru: "Dede Korkut Hikâyeleri'nin dili hangi özelliği taşır?",
            secenekler: [
              "Arapça-Farsça ağırlıklı",
              "Sade ve anlaşılır Türkçe",
              "Eski Osmanlıca",
              "Çağatay Türkçesi",
            ],
            dogruIndex: 1,
            ipucu1: "💡 Bu hikayeler Oğuz Türklerinin sözlü geleneğinden derlendi.",
            ipucu2: "💡 Destan dili halkın konuştuğu sade Türkçedir.",
          },
          {
            soru: "Halk hikâyesi ile masalın temel farkı nedir?",
            secenekler: [
              "Masallarda olaylar gerçekçidir",
              "Halk hikâyelerinde olağanüstü unsurlar yoktur",
              "Halk hikâyelerinde aşk ve kahramanlık ön plandadır",
              "Masallar hep şiir biçiminde yazılır",
            ],
            dogruIndex: 2,
            ipucu1: "💡 Halk hikâyelerinde genellikle âşık ve sevgilinin kavuşma yolculuğu anlatılır.",
            ipucu2: "💡 Aşk, kahramanlık ve saz geleneği halk hikâyelerinin temel unsurlarıdır.",
          },
          {
            soru: "Kerem ile Aslı, Âşık Garip gibi eserler hangi edebi türe örnektir?",
            secenekler: ["Destan", "Masal", "Halk hikâyesi", "Mesnevi"],
            dogruIndex: 2,
            ipucu1: "💡 Bu eserler ozanlar tarafından saz eşliğinde aktarılırdı.",
            ipucu2: "💡 Aşk temalı, nesir-şiir karışımı olan bu türe 'halk hikâyesi' denir.",
          },
        ],
      },
    },
  },
  {
    ay: "kasim",
    ayAdi: "Kasım",
    dersler: {
      matematik: {
        ad: "Polinomlar",
        sorular: [
          {
            soru: "p(x) = x³ − 3x² + 2x + 1 için p(1) kaçtır?",
            secenekler: ["0", "1", "2", "−1"],
            dogruIndex: 1,
            ipucu1: "💡 x = 1 değerini doğrudan yerine koy.",
            ipucu2: "💡 p(1) = 1 − 3 + 2 + 1 = 1",
          },
          {
            soru: "(x + 3)(x − 2) çarpımını açınız.",
            secenekler: [
              "x² + x − 6",
              "x² − x − 6",
              "x² + x + 6",
              "x² − x + 6",
            ],
            dogruIndex: 0,
            ipucu1: "💡 (a+b)(c+d) = ac + ad + bc + bd",
            ipucu2: "💡 x² − 2x + 3x − 6 = x² + x − 6",
          },
          {
            soru: "x² + 5x + 6 ifadesinin çarpanları hangi seçenekte doğru verilmiştir?",
            secenekler: [
              "(x + 1)(x + 6)",
              "(x + 2)(x + 3)",
              "(x − 2)(x − 3)",
              "(x + 6)(x − 1)",
            ],
            dogruIndex: 1,
            ipucu1: "💡 Çarpımı 6, toplamı 5 olan iki sayıyı bul.",
            ipucu2: "💡 2 × 3 = 6 ve 2 + 3 = 5 → (x + 2)(x + 3)",
          },
        ],
      },
      fizik: {
        ad: "Basınç ve Kaldırma Kuvveti",
        sorular: [
          {
            soru: "Basınç formülü aşağıdakilerden hangisidir?",
            secenekler: ["P = F × A", "P = F / A", "P = A / F", "P = m × g"],
            dogruIndex: 1,
            ipucu1: "💡 Basınç, birim alana uygulanan kuvvettir.",
            ipucu2: "💡 P = F / A; birimi Pascal (Pa) = N/m²",
          },
          {
            soru: "Arşimet ilkesine göre sıvıya daldırılan cisme uygulanan kaldırma kuvveti neye eşittir?",
            secenekler: [
              "Cismin ağırlığına",
              "Cismin hacmine",
              "Cismin kapladığı sıvının ağırlığına",
              "Sıvının toplam ağırlığına",
            ],
            dogruIndex: 2,
            ipucu1: "💡 'Kaldırma kuvveti, cismin yerinden ettiği sıvı ağırlığına eşittir.'",
            ipucu2: "💡 F_K = ρ_sıvı × V_cisim × g",
          },
          {
            soru: "Suyun yoğunluğu yaklaşık kaçtır?",
            secenekler: ["0,5 g/cm³", "1 g/cm³", "2 g/cm³", "10 g/cm³"],
            dogruIndex: 1,
            ipucu1: "💡 Yoğunluk = Kütle / Hacim; 1 mL su ≈ 1 g",
            ipucu2: "💡 1 cm³ su = 1 g → ρ = 1 g/cm³",
          },
        ],
      },
      kimya: {
        ad: "Kimyasal Hesaplamalar",
        sorular: [
          {
            soru: "44 g CO₂'nin mol sayısı kaçtır? (C=12, O=16)",
            secenekler: ["0,5 mol", "1 mol", "2 mol", "4 mol"],
            dogruIndex: 1,
            ipucu1: "💡 M(CO₂) = 12 + 2×16 = 44 g/mol",
            ipucu2: "💡 n = 44 / 44 = 1 mol",
          },
          {
            soru: "2 mol H₂O kaç gram eder? (H=1, O=16)",
            secenekler: ["9 g", "18 g", "36 g", "2 g"],
            dogruIndex: 2,
            ipucu1: "💡 m = n × M formülünü kullan.",
            ipucu2: "💡 M(H₂O) = 18 g/mol → m = 2 × 18 = 36 g",
          },
          {
            soru: "STP koşullarında 1 mol ideal gaz kaç litre hacim kaplar?",
            secenekler: ["11,2 L", "22,4 L", "44,8 L", "2,24 L"],
            dogruIndex: 1,
            ipucu1: "💡 STP = 0°C, 1 atm",
            ipucu2: "💡 Molar hacim = 22,4 L/mol (STP)",
          },
        ],
      },
      "turk-dili": {
        ad: "Mesnevi Türü ve Fiilimsiler",
        sorular: [
          {
            soru: "Mevlânâ Celâleddîn-i Rûmî'nin Türk edebiyatındaki en uzun mesnevi olarak bilinen eseri hangisidir?",
            secenekler: [
              "Leyla ile Mecnun",
              "Mesnevi",
              "Kutadgu Bilig",
              "Şehname",
            ],
            dogruIndex: 1,
            ipucu1: "💡 Bu eser Farsça yazılmış ve 25.000'den fazla beyitten oluşur.",
            ipucu2: "💡 Rûmî'nin 'Mesnevi' adlı eseri en uzun mesnevi olarak kabul edilir.",
          },
          {
            soru: "Aşağıdakilerden hangisi isim-fiil (mastar) ekidir?",
            secenekler: ["-en", "-arak", "-mek", "-dığında"],
            dogruIndex: 2,
            ipucu1: "💡 İsim-fiiller, fiile isim işlevi kazandırır.",
            ipucu2: "💡 '-mak/-mek' ekleri fiilin mastar biçimini oluşturur.",
          },
          {
            soru: "'Gülerek girdi odaya' cümlesinde 'gülerek' hangi fiilimsi türüdür?",
            secenekler: ["İsim-fiil", "Sıfat-fiil", "Zarf-fiil", "Yüklem"],
            dogruIndex: 2,
            ipucu1: "💡 Bu sözcük eylemi 'nasıl' yapıldığını belirtiyor.",
            ipucu2: "💡 '-arak/-erek' eki zarf-fiil (ulaç) eki oluşturur.",
          },
        ],
      },
    },
  },
  {
    ay: "aralik",
    ayAdi: "Aralık",
    dersler: {
      matematik: {
        ad: "İkinci Derece Denklemler",
        sorular: [
          {
            soru: "x² − 7x + 12 = 0 denkleminin kökleri hangi seçenekte doğru verilmiştir?",
            secenekler: [
              "x = 3 ve x = 4",
              "x = −3 ve x = −4",
              "x = 6 ve x = 2",
              "x = 1 ve x = 12",
            ],
            dogruIndex: 0,
            ipucu1: "💡 Çarpımı 12, toplamı 7 olan iki pozitif sayı ara.",
            ipucu2: "💡 3 × 4 = 12, 3 + 4 = 7 → (x−3)(x−4) = 0",
          },
          {
            soru: "ax² + bx + c = 0 denkleminde Δ = b² − 4ac < 0 ise köklerin durumu nedir?",
            secenekler: [
              "İki farklı gerçel kök",
              "Çakışık gerçel kök",
              "Gerçel kök yok",
              "Bir gerçel, bir sanal kök",
            ],
            dogruIndex: 2,
            ipucu1: "💡 Diskriminant Δ'nın işareti köklerin türünü belirler.",
            ipucu2: "💡 Δ < 0 → negatif karekök → gerçel sayı yok",
          },
          {
            soru: "x² − 4 = 0 denkleminin kökleri hangi seçenekte doğru verilmiştir?",
            secenekler: [
              "x = 2",
              "x = 4 ve x = −4",
              "x = 2 ve x = −2",
              "x = 0 ve x = 4",
            ],
            dogruIndex: 2,
            ipucu1: "💡 x² = 4 eşitliğini çöz.",
            ipucu2: "💡 x² = 4 → x = ±√4 = ±2",
          },
        ],
      },
      fizik: {
        ad: "Basınç ve Kaldırma Kuvveti (devam)",
        sorular: [
          {
            soru: "Bir cisim suya tamamen daldırıldığında yoğunluğu sudan büyükse ne olur?",
            secenekler: ["Yüzer", "Batar", "Askıda kalır", "Erir"],
            dogruIndex: 1,
            ipucu1: "💡 Yoğunluğu sıvı yoğunluğuyla karşılaştır.",
            ipucu2: "💡 ρ_cisim > ρ_sıvı → ağırlık > kaldırma kuvveti → cisim batar.",
          },
          {
            soru: "Hava basıncını ölçmek için kullanılan alet hangisidir?",
            secenekler: ["Termometre", "Barometre", "Dinamometre", "Voltmetre"],
            dogruIndex: 1,
            ipucu1: "💡 Meteorolojide sıkça kullanılan bu alet basınç ölçer.",
            ipucu2: "💡 Baro- (basınç) + -metre (ölçer) = Barometre",
          },
          {
            soru: "Deniz seviyesindeki standart atmosfer basıncı yaklaşık kaç Pascal'dır?",
            secenekler: ["10.000 Pa", "101.325 Pa", "760 Pa", "1.000.000 Pa"],
            dogruIndex: 1,
            ipucu1: "💡 1 atm = 760 mmHg = ? Pa",
            ipucu2: "💡 1 atm ≈ 101.325 Pa",
          },
        ],
      },
      kimya: {
        ad: "Kimyasal Bağlar",
        sorular: [
          {
            soru: "İyonik bağ hangi tür atomlar arasında oluşur?",
            secenekler: [
              "İki ametal arasında",
              "Metal ile ametal arasında",
              "İki metal arasında",
              "Yalnızca gazlar arasında",
            ],
            dogruIndex: 1,
            ipucu1: "💡 Elektron aktarımı gerçekleşir.",
            ipucu2: "💡 Metal elektron verir (+), ametal alır (−) → iyonik bağ.",
          },
          {
            soru: "H₂O molekülündeki bağ türü nedir?",
            secenekler: [
              "İyonik bağ",
              "Polar kovalent bağ",
              "Apolar kovalent bağ",
              "Metalik bağ",
            ],
            dogruIndex: 1,
            ipucu1: "💡 H ve O arasındaki elektronegatiflik farkını düşün.",
            ipucu2: "💡 Elektron çifti paylaşılır; O daha elektronegatif → polar kovalent.",
          },
          {
            soru: "Kovalent bağ nasıl oluşur?",
            secenekler: [
              "Elektron aktarımıyla",
              "Elektron çifti paylaşımıyla",
              "Proton alışverişiyle",
              "Nötron paylaşımıyla",
            ],
            dogruIndex: 1,
            ipucu1: "💡 Kovalent bağ genellikle iki ametal arasında oluşur.",
            ipucu2: "💡 Her iki atom da ortak elektron çiftine katkıda bulunur.",
          },
        ],
      },
      "turk-dili": {
        ad: "Destan ve Efsane",
        sorular: [
          {
            soru: "Ergenekon destanının ana teması nedir?",
            secenekler: [
              "Aşk ve ayrılık",
              "Bir vadiden kurtuluş ve yeniden doğuş",
              "Deniz yolculuğu",
              "Tanrılara isyan",
            ],
            dogruIndex: 1,
            ipucu1: "💡 Bu destanda Türkler dağla çevrili bir yerde sıkışıp kalır.",
            ipucu2: "💡 Bozkurt önderliğinde dağı eriterek Ergenekon'dan çıkış anlatılır.",
          },
          {
            soru: "Destan ile efsanenin temel farkı nedir?",
            secenekler: [
              "Destanlarda olay yoktur",
              "Efsaneler yalnızca yazılıdır",
              "Destanlar toplumsal kahramanlıkları, efsaneler bir yere bağlı olayları anlatır",
              "İkisi de aynıdır",
            ],
            dogruIndex: 2,
            ipucu1: "💡 Efsaneler genellikle kısa ve tek bir olayı konu alır.",
            ipucu2: "💡 Destanlar geniş kapsamlı, toplumun büyük olaylarını anlatan uzun anlatılardır.",
          },
          {
            soru: "İlk Türk destanları ağızdan ağıza geçen bu aktarım biçimine ne ad verilir?",
            secenekler: ["Tezkire", "Sözlü edebiyat", "Divan edebiyatı", "Halk tiyatrosu"],
            dogruIndex: 1,
            ipucu1: "💡 Yazının yaygınlaşmadığı dönemlerde hikayeler nasıl aktarılırdı?",
            ipucu2: "💡 Ağızdan ağıza geçen eserler 'sözlü edebiyat' kapsamındadır.",
          },
        ],
      },
    },
  },
  {
    ay: "ocak",
    ayAdi: "Ocak",
    dersler: {
      matematik: {
        ad: "Trigonometri",
        sorular: [
          {
            soru: "sin²x + cos²x değeri nedir?",
            secenekler: ["0", "2", "1", "sin x"],
            dogruIndex: 2,
            ipucu1: "💡 Bu temel trigonometrik özdeşliktir.",
            ipucu2: "💡 Birim çember tanımından türetilir: sin²x + cos²x = 1",
          },
          {
            soru: "sin 30° kaçtır?",
            secenekler: ["√3/2", "√2/2", "1/2", "1"],
            dogruIndex: 2,
            ipucu1: "💡 Özel açılar tablosunu hatırla: 30°-60°-90° üçgeni.",
            ipucu2: "💡 sin 30° = 1/2, cos 30° = √3/2",
          },
          {
            soru: "tan 45° kaçtır?",
            secenekler: ["0", "1", "√3", "1/√3"],
            dogruIndex: 1,
            ipucu1: "💡 tan x = sin x / cos x",
            ipucu2: "💡 tan 45° = (√2/2) / (√2/2) = 1",
          },
        ],
      },
      fizik: {
        ad: "Dalgalar",
        sorular: [
          {
            soru: "Bir dalganın frekansı ile periyodu arasındaki ilişki nedir?",
            secenekler: ["f = T", "f = T²", "f = 1/T", "f = 2T"],
            dogruIndex: 2,
            ipucu1: "💡 Frekans = birim zamandaki titreşim; periyot = bir tam titreşimin süresi.",
            ipucu2: "💡 f = 1/T; T = 1/f",
          },
          {
            soru: "Dalga boyu (λ), frekans (f) ve hız (v) arasındaki ilişki nedir?",
            secenekler: ["v = λ/f", "v = λ × f", "v = f/λ", "λ = v × f"],
            dogruIndex: 1,
            ipucu1: "💡 Dalga denklemini hatırla.",
            ipucu2: "💡 v = λ × f",
          },
          {
            soru: "Enine dalgada titreşim yönü ile ilerleme yönü arasındaki açı nedir?",
            secenekler: ["0°", "45°", "90°", "180°"],
            dogruIndex: 2,
            ipucu1: "💡 Enine dalgada titreşim yönünü düşün.",
            ipucu2: "💡 Enine dalgada titreşim, ilerleme yönüne diktir (90°).",
          },
        ],
      },
      kimya: {
        ad: "Kimyasal Tepkimeler",
        sorular: [
          {
            soru: "H₂ + Cl₂ → 2HCl tepkimesinde ürün hangisidir?",
            secenekler: ["H₂", "Cl₂", "HCl", "H₂Cl"],
            dogruIndex: 2,
            ipucu1: "💡 Tepkime okunun sağında ürünler yer alır.",
            ipucu2: "💡 Ürün HCl (hidrojen klorür) gazıdır.",
          },
          {
            soru: "Yanma tepkimesinde oksijen hangi rolü oynar?",
            secenekler: ["Ürün", "Katalizör", "Reaktif (giren)", "Çözücü"],
            dogruIndex: 2,
            ipucu1: "💡 Yanma: yakıt + oksijen → CO₂ + H₂O + ısı",
            ipucu2: "💡 Oksijen yanma tepkimesine giren maddedir (reaktif).",
          },
          {
            soru: "Aşağıdakilerden hangisi sentez (birleşme) tepkimesine örnektir?",
            secenekler: [
              "2H₂O → 2H₂ + O₂",
              "2H₂ + O₂ → 2H₂O",
              "NaCl → Na + Cl",
              "CaCO₃ → CaO + CO₂",
            ],
            dogruIndex: 1,
            ipucu1: "💡 Sentez: birden fazla madde birleşerek tek ürün oluşturur.",
            ipucu2: "💡 A + B → AB biçimindeki tepkime sentezdir.",
          },
        ],
      },
      "turk-dili": {
        ad: "Roman ve Tanzimat Edebiyatı",
        sorular: [
          {
            soru: "Türk edebiyatındaki ilk roman olarak kabul edilen eser hangisidir?",
            secenekler: [
              "Araba Sevdası",
              "İntibah",
              "Taaşşuk-ı Talât ve Fıtnat",
              "Zehra",
            ],
            dogruIndex: 2,
            ipucu1: "💡 Bu eser Şemsettin Sami tarafından 1872'de yazıldı.",
            ipucu2: "💡 'Taaşşuk-ı Talât ve Fıtnat' Türk edebiyatının ilk roman denemesidir.",
          },
          {
            soru: "Tanzimat edebiyatının temel özelliği nedir?",
            secenekler: [
              "Divan şiiri geleneğini sürdürmek",
              "Batı edebiyatı türlerini Türk edebiyatına kazandırmak",
              "Yalnızca halk edebiyatına yönelmek",
              "Dini konulara odaklanmak",
            ],
            dogruIndex: 1,
            ipucu1: "💡 Tanzimat Fermanı 1839'da ilan edildi; edebiyatta da dönüşüm başladı.",
            ipucu2: "💡 Roman, tiyatro, gazete gibi Batı'ya özgü türler bu dönemde Türk edebiyatına girdi.",
          },
          {
            soru: "Namık Kemal'in 'Vatan yahut Silistre' adlı eseri hangi edebi türdedir?",
            secenekler: ["Roman", "Tiyatro", "Şiir", "Makale"],
            dogruIndex: 1,
            ipucu1: "💡 'Vatan' vurgusu ve toplumsal mesaj içeren bu eser sahnelendi.",
            ipucu2: "💡 Namık Kemal 'Vatan yahut Silistre'yi 1873'te tiyatro türünde yazdı.",
          },
        ],
      },
    },
  },
  {
    ay: "subat",
    ayAdi: "Şubat",
    dersler: {
      matematik: {
        ad: "Fonksiyonlar",
        sorular: [
          {
            soru: "f(x) = 3x − 5 için f(3) kaçtır?",
            secenekler: ["4", "5", "6", "9"],
            dogruIndex: 0,
            ipucu1: "💡 x = 3 değerini fonksiyona koy.",
            ipucu2: "💡 f(3) = 3(3) − 5 = 9 − 5 = 4",
          },
          {
            soru: "f(x) = x² fonksiyonunun tanım kümesi R ise görüntü kümesi nedir?",
            secenekler: ["R", "[0, +∞)", "(−∞, 0]", "R \\ {0}"],
            dogruIndex: 1,
            ipucu1: "💡 x² her zaman negatif olamaz.",
            ipucu2: "💡 x² ≥ 0 her x ∈ R için geçerli → görüntü [0, +∞)",
          },
          {
            soru: "f(x) = 2x + 1 ve g(x) = x − 3 ise (f∘g)(2) kaçtır?",
            secenekler: ["−3", "0", "−1", "2"],
            dogruIndex: 2,
            ipucu1: "💡 (f∘g)(x) = f(g(x)). Önce g(2) hesapla.",
            ipucu2: "💡 g(2) = −1; f(−1) = 2(−1) + 1 = −1",
          },
        ],
      },
      fizik: {
        ad: "Ses Dalgaları",
        sorular: [
          {
            soru: "Sesin havadaki yaklaşık hızı (20°C'de) nedir?",
            secenekler: ["300 m/s", "343 m/s", "1500 m/s", "3×10⁸ m/s"],
            dogruIndex: 1,
            ipucu1: "💡 Ses ışıktan çok daha yavaş ilerler.",
            ipucu2: "💡 20°C'de havada sesin hızı ≈ 343 m/s.",
          },
          {
            soru: "Ses dalgaları hangi tür dalgalardır?",
            secenekler: [
              "Enine (transversal) dalgalar",
              "Boyuna (longitudinal) dalgalar",
              "Elektromanyetik dalgalar",
              "Durma dalgaları",
            ],
            dogruIndex: 1,
            ipucu1: "💡 Seste titreşim yönünü düşün.",
            ipucu2: "💡 Ses dalgalarında titreşim yönü ilerleme yönüyle aynıdır → boyuna dalga.",
          },
          {
            soru: "Ses hangi ortamda en hızlı ilerler?",
            secenekler: ["Hava", "Su", "Katı (çelik)", "Boşluk"],
            dogruIndex: 2,
            ipucu1: "💡 Ses iletiminde ortamın elastikiyeti belirleyicidir.",
            ipucu2: "💡 Katı maddelerde parçacıklar birbirine yakın → ses daha hızlı iletilir.",
          },
        ],
      },
      kimya: {
        ad: "Asit-Baz ve pH",
        sorular: [
          {
            soru: "pH = 7 olan çözelti hangi özelliği taşır?",
            secenekler: ["Asidik", "Bazik", "Nötr", "Tuzlu"],
            dogruIndex: 2,
            ipucu1: "💡 pH ölçeği 0–14 arasındadır.",
            ipucu2: "💡 pH < 7 → asidik; pH = 7 → nötr; pH > 7 → bazik",
          },
          {
            soru: "HCl (hidroklorik asit) suda ne oluşturur?",
            secenekler: ["OH⁻ iyonları", "H⁺ iyonları", "Nötr moleküller", "CO₂ gazı"],
            dogruIndex: 1,
            ipucu1: "💡 Arrhenius tanımına göre asitler suda ne verir?",
            ipucu2: "💡 HCl → H⁺ + Cl⁻; H⁺ iyonları asiditeden sorumludur.",
          },
          {
            soru: "NaOH (sodyum hidroksit) hangi özellikte bir maddedir?",
            secenekler: ["Asit", "Tuz", "Baz", "İndikatör"],
            dogruIndex: 2,
            ipucu1: "💡 NaOH suda OH⁻ iyonu verir.",
            ipucu2: "💡 OH⁻ veren maddeler baz olarak tanımlanır.",
          },
        ],
      },
      "turk-dili": {
        ad: "Servet-i Fünun Edebiyatı",
        sorular: [
          {
            soru: "Servet-i Fünun dönemi edebiyatının öncü şairi kimdir?",
            secenekler: [
              "Mehmet Akif Ersoy",
              "Tevfik Fikret",
              "Namık Kemal",
              "Yahya Kemal Beyatlı",
            ],
            dogruIndex: 1,
            ipucu1: "💡 Bu şair 'Sis' ve 'Haluk'un Defteri' eserleriyle tanınır.",
            ipucu2: "💡 Tevfik Fikret, Servet-i Fünun dergisinin 1896'dan itibaren başına geçti.",
          },
          {
            soru: "Servet-i Fünun edebiyatının genel özelliği nedir?",
            secenekler: [
              "Sade halk diline yönelmek",
              "Milliyetçi temaları işlemek",
              "Fransız sembolizminden etkilenmek ve ağır dil kullanmak",
              "Dini konuları ön plana çıkarmak",
            ],
            dogruIndex: 2,
            ipucu1: "💡 Bu dönem sanatçıları Batı'dan, özellikle Fransa'dan etkilendi.",
            ipucu2: "💡 Servet-i Fünun sanatçıları ağır dil kullandı; 'sanat sanat içindir' anlayışını benimsedi.",
          },
          {
            soru: "Halit Ziya Uşaklıgil'in 'Aşk-ı Memnu' adlı eseri hangi türdedir?",
            secenekler: ["Şiir", "Tiyatro", "Roman", "Makale"],
            dogruIndex: 2,
            ipucu1: "💡 Bu eser Türk edebiyatının Batı tekniğiyle yazılmış ilk büyük türündedir.",
            ipucu2: "💡 'Aşk-ı Memnu' Halit Ziya'nın en önemli romanıdır.",
          },
        ],
      },
    },
  },
  {
    ay: "mart",
    ayAdi: "Mart",
    dersler: {
      matematik: {
        ad: "Dörtgenler ve Çokgenler",
        sorular: [
          {
            soru: "Bir n-genin iç açıları toplamı formülü nedir?",
            secenekler: [
              "(n − 1) × 180°",
              "(n − 2) × 180°",
              "n × 180°",
              "(n + 2) × 90°",
            ],
            dogruIndex: 1,
            ipucu1: "💡 Dörtgen için (4−2)×180° = 360° doğrulama yap.",
            ipucu2: "💡 Genel formül: (n−2) × 180°",
          },
          {
            soru: "Düzgün altıgenin bir iç açısı kaç derecedir?",
            secenekler: ["90°", "108°", "120°", "135°"],
            dogruIndex: 2,
            ipucu1: "💡 Önce tüm iç açılar toplamını bul, sonra 6'ya böl.",
            ipucu2: "💡 (6−2)×180° = 720°; 720°/6 = 120°",
          },
          {
            soru: "Köşegeni 10 cm, bir kenarı 6 cm olan dikdörtgenin diğer kenarı kaç cm'dir?",
            secenekler: ["4 cm", "6 cm", "8 cm", "10 cm"],
            dogruIndex: 2,
            ipucu1: "💡 Dikdörtgende köşegen dik üçgen oluşturur; Pisagor teoremini kullan.",
            ipucu2: "💡 6² + b² = 10² → b² = 64 → b = 8 cm",
          },
        ],
      },
      fizik: {
        ad: "Manyetizma",
        sorular: [
          {
            soru: "Dünya'nın manyetik kutup yönünü gösteren alet hangisidir?",
            secenekler: ["Barometre", "Termometre", "Pusula", "Voltmetre"],
            dogruIndex: 2,
            ipucu1: "💡 Denizciler yüzyıllardır bu aleti yön bulmak için kullanır.",
            ipucu2: "💡 Pusula iğnesi Dünya'nın manyetik kuzey kutbuna yönelir.",
          },
          {
            soru: "Bir mıknatısın kuzey kutbu ile başka bir mıknatısın güney kutbu arasındaki kuvvet nasıldır?",
            secenekler: ["İtme", "Çekim", "Nötr", "Değişken"],
            dogruIndex: 1,
            ipucu1: "💡 'Zıt kutuplar çeker, benzer kutuplar iter.'",
            ipucu2: "💡 K − G → çekim kuvveti",
          },
          {
            soru: "Demir talaşları bir mıknatısın etrafına serpildiğinde hangi görüntüyü oluşturur?",
            secenekler: [
              "Düz paralel çizgiler",
              "Manyetik alan çizgileri",
              "Daireler",
              "Rastgele dağılım",
            ],
            dogruIndex: 1,
            ipucu1: "💡 Demir talaşları manyetik alana hizalanır.",
            ipucu2: "💡 Talaşlar manyetik alan çizgilerini görünür kılar.",
          },
        ],
      },
      kimya: {
        ad: "Karışımlar",
        sorular: [
          {
            soru: "Aşağıdakilerden hangisi homojen karışımdır?",
            secenekler: ["Kum-su", "Tuzlu su", "Yağ-su", "Toprak"],
            dogruIndex: 1,
            ipucu1: "💡 Homojen karışımlarda bileşenler gözle ayırt edilemez.",
            ipucu2: "💡 Tuzlu suda tuz tamamen çözündüğünden homojen (çözelti) oluşur.",
          },
          {
            soru: "Heterojen karışımları ayırmada kullanılan en basit yöntem hangisidir?",
            secenekler: ["Damıtma", "Kristallendirme", "Süzme", "Elektroliz"],
            dogruIndex: 2,
            ipucu1: "💡 Katı-sıvı karışımlarını ayırmak için ne kullanırız?",
            ipucu2: "💡 Süzgeç kağıdıyla katıyı sıvıdan ayırırız — 'süzme' işlemi.",
          },
          {
            soru: "Çözünürlük kavramını en iyi açıklayan ifade hangisidir?",
            secenekler: [
              "Bir maddenin erime derecesi",
              "Belirli sıcaklıkta 100 g çözücüde çözünen madde miktarı",
              "Çözeltinin rengi",
              "Çözücünün hacmi",
            ],
            dogruIndex: 1,
            ipucu1: "💡 Çözünürlük sıcaklığa bağlıdır.",
            ipucu2: "💡 100 g çözücüde doymuş çözelti oluşturmak için gereken çözünen miktarı.",
          },
        ],
      },
      "turk-dili": {
        ad: "Tiyatro Türü",
        sorular: [
          {
            soru: "Tiyatro eserinin sahnelenmeye hazır yazılı metnine ne ad verilir?",
            secenekler: ["Roman", "Senaryo", "Piyes", "Şiir"],
            dogruIndex: 2,
            ipucu1: "💡 Bu metin oyuncuların söyleyeceği diyalogları ve yönergeleri içerir.",
            ipucu2: "💡 Fransızca 'pièce' sözcüğünden gelen 'piyes', sahne için yazılan eserdir.",
          },
          {
            soru: "Tragedya ve komedi türlerinin kökenine bakıldığında hangi uygarlık öne çıkar?",
            secenekler: ["Roma", "Mısır", "Eski Yunan", "Mezopotamya"],
            dogruIndex: 2,
            ipucu1: "💡 Sophokles, Euripides ve Aristophanes bu uygarlığın temsilcileridir.",
            ipucu2: "💡 Tragedya ve komedi Antik Yunan'da Dionysos şenliklerinde doğdu.",
          },
          {
            soru: "Türk tiyatrosunda Tanzimat'tan önce yaygın olan geleneksel gösteri türü hangisidir?",
            secenekler: ["Opera", "Karagöz ve Hacivat", "Bale", "Vodvil"],
            dogruIndex: 1,
            ipucu1: "💡 Bu gösteri gölge oyunu olarak da bilinir.",
            ipucu2: "💡 Karagöz ve Hacivat, perde arkasında deri figürlerle oynanan geleneksel Türk gölge oyunudur.",
          },
        ],
      },
    },
  },
  {
    ay: "nisan",
    ayAdi: "Nisan",
    dersler: {
      matematik: {
        ad: "Çember ve Daire",
        sorular: [
          {
            soru: "Yarıçapı 7 cm olan bir dairenin alanı nedir? (π ≈ 3,14)",
            secenekler: [
              "44 cm²",
              "153,86 cm²",
              "21,98 cm²",
              "49 cm²",
            ],
            dogruIndex: 1,
            ipucu1: "💡 Dairenin alanı = π × r²",
            ipucu2: "💡 A = 3,14 × 7² = 3,14 × 49 ≈ 153,86 cm²",
          },
          {
            soru: "Çemberin çevresi formülü nedir?",
            secenekler: ["C = πr", "C = πr²", "C = 2πr", "C = 2πr²"],
            dogruIndex: 2,
            ipucu1: "💡 Çevre = 2 × π × yarıçap",
            ipucu2: "💡 C = 2πr",
          },
          {
            soru: "Bir çembere teğet bir doğru, teğet noktasında yarıçapa kaç derecelik açı yapar?",
            secenekler: ["0°", "45°", "60°", "90°"],
            dogruIndex: 3,
            ipucu1: "💡 Teğet ve yarıçap geometrik özelliği.",
            ipucu2: "💡 Bir çembere teğet çizgi, teğet noktasındaki yarıçapa her zaman diktir (90°).",
          },
        ],
      },
      fizik: {
        ad: "Elektromanyetizma",
        sorular: [
          {
            soru: "Bir bobinde indüklenen EMK hangi kanunla açıklanır?",
            secenekler: [
              "Ohm Kanunu",
              "Newton'ın 2. Yasası",
              "Faraday'ın İndüksiyon Kanunu",
              "Coulomb Kanunu",
            ],
            dogruIndex: 2,
            ipucu1: "💡 Değişen manyetik akı elektrik üretebilir.",
            ipucu2: "💡 Faraday, manyetik akı değişiminin EMK oluşturduğunu keşfetti.",
          },
          {
            soru: "Transformatörler hangi tür akım için çalışır?",
            secenekler: [
              "Yalnızca doğru akım (DC)",
              "Yalnızca alternatif akım (AC)",
              "Her ikisi de",
              "Yüksek frekanslı DC",
            ],
            dogruIndex: 1,
            ipucu1: "💡 Transformatörler değişen manyetik akıya ihtiyaç duyar.",
            ipucu2: "💡 AC sürekli değiştiğinden değişen manyetik alan oluşturur → transformatör çalışır.",
          },
          {
            soru: "Elektromanyetik indüksiyonda oluşan akımın yönünü belirleyen kural hangisidir?",
            secenekler: [
              "Ohm Kuralı",
              "Lenz Kuralı",
              "Kirchhoff Kuralı",
              "Pascal Kuralı",
            ],
            dogruIndex: 1,
            ipucu1: "💡 Bu kural oluşan akımın kaynağına karşı koyduğunu söyler.",
            ipucu2: "💡 Lenz Kuralı: İndüklenen akım, onu oluşturan değişime karşı koyacak yönde akar.",
          },
        ],
      },
      kimya: {
        ad: "Kimyasal Denge",
        sorular: [
          {
            soru: "Kimyasal denge durumunda ne söylenebilir?",
            secenekler: [
              "Tepkime durmuştur",
              "İleri ve geri tepkime hızları eşittir",
              "Yalnızca ürünler vardır",
              "Sıcaklık sıfıra düşmüştür",
            ],
            dogruIndex: 1,
            ipucu1: "💡 Denge dinamiktir; tepkime hâlâ devam eder.",
            ipucu2: "💡 Dinamik dengede r_ileri = r_geri → net değişim sıfır.",
          },
          {
            soru: "Le Chatelier İlkesine göre denge sistemine baskı uygulandığında ne olur?",
            secenekler: [
              "Denge bozulmaz",
              "Sistem dışarıdan gelen değişimi azaltmaya çalışır",
              "Tepkime tamamen durur",
              "Yalnızca ürünler artar",
            ],
            dogruIndex: 1,
            ipucu1: "💡 'Denge sistemi kendine yapılan değişime karşı koyar.'",
            ipucu2: "💡 Basınç artarsa sistem toplam gaz molünü azaltacak yöne kayar.",
          },
          {
            soru: "Denge sabiti K büyük olduğunda ne söylenebilir?",
            secenekler: [
              "Ürünler baskın",
              "Reaktifler baskın",
              "Denge yoktur",
              "Tepkime gerçekleşmez",
            ],
            dogruIndex: 0,
            ipucu1: "💡 K değeri ne kadar büyük olursa denge o tarafa kayar.",
            ipucu2: "💡 K >> 1 → denge ürün tarafında → ürünler baskın.",
          },
        ],
      },
      "turk-dili": {
        ad: "Anı (Hatıra) Türü",
        sorular: [
          {
            soru: "Anı (hatıra) türünün temel özelliği nedir?",
            secenekler: [
              "Kurgusal olaylar anlatılır",
              "Yazar kendi yaşadıklarını aktarır",
              "Anonim bir eserdir",
              "Şiirsel biçimde yazılır",
            ],
            dogruIndex: 1,
            ipucu1: "💡 Anı yazarı 'ben' dilini kullanır.",
            ipucu2: "💡 Yazarın bizzat yaşadığı olaylar gerçekliğe dayalı biçimde aktarılır.",
          },
          {
            soru: "Aşağıdaki eserlerden hangisi anı türüne örnektir?",
            secenekler: [
              "Kiralık Konak",
              "Kırk Yıl",
              "Saatleri Ayarlama Enstitüsü",
              "Şiir Tahlilleri",
            ],
            dogruIndex: 1,
            ipucu1: "💡 Halit Ziya Uşaklıgil edebî hayatını bu türde kaleme aldı.",
            ipucu2: "💡 'Kırk Yıl' Halit Ziya'nın hatıralarından oluşur.",
          },
          {
            soru: "Anı ile biyografinin temel farkı nedir?",
            secenekler: [
              "Biyografi yazarın kendi hayatını anlattığı türdür",
              "Anıda yazar kendi yaşantısını, biyografide başkasının hayatını anlatır",
              "İkisi de aynı türdür",
              "Anıda kurgusal ögeler zorunludur",
            ],
            dogruIndex: 1,
            ipucu1: "💡 'Bio-' (yaşam) + '-graphy' (yazmak) sözcükleri ne anlatıyor?",
            ipucu2: "💡 Anı = yazarın kendi deneyimleri; biyografi = başka birinin yaşamı.",
          },
        ],
      },
    },
  },
  {
    ay: "mayis",
    ayAdi: "Mayıs",
    dersler: {
      matematik: {
        ad: "Katı Cisimler",
        sorular: [
          {
            soru: "Yarıçapı r olan bir kürenin yüzey alanı formülü nedir?",
            secenekler: ["4πr²", "(4/3)πr³", "2πr²", "πr²"],
            dogruIndex: 0,
            ipucu1: "💡 Küreyi sarmak için gereken yüzey alanını düşün.",
            ipucu2: "💡 Küre yüzey alanı = 4πr²",
          },
          {
            soru: "Taban yarıçapı r ve yüksekliği h olan silindirin hacmi nedir?",
            secenekler: ["πr²h", "2πrh", "πrh²", "4πr²h"],
            dogruIndex: 0,
            ipucu1: "💡 Hacim = taban alanı × yükseklik",
            ipucu2: "💡 Taban alanı = πr² → V = πr²h",
          },
          {
            soru: "Küpün bir kenarı 3 cm ise hacmi kaç cm³'tür?",
            secenekler: ["9 cm³", "18 cm³", "27 cm³", "81 cm³"],
            dogruIndex: 2,
            ipucu1: "💡 Küpün hacmi = kenar³",
            ipucu2: "💡 V = 3³ = 27 cm³",
          },
        ],
      },
      fizik: {
        ad: "Optik",
        sorular: [
          {
            soru: "Işık düz bir aynadan yansıdığında yansıma açısı gelme açısına eşit midir?",
            secenekler: [
              "Evet, her zaman eşittir",
              "Hayır, yansıma açısı daha büyüktür",
              "Hayır, yansıma açısı daha küçüktür",
              "Malzemeye bağlıdır",
            ],
            dogruIndex: 0,
            ipucu1: "💡 Yansıma yasasını hatırla.",
            ipucu2: "💡 θ_yansıma = θ_gelme (her zaman)",
          },
          {
            soru: "Işığın yoğun ortamdan seyrek ortama geçişinde ne gözlenir?",
            secenekler: [
              "Işık normale yaklaşır",
              "Işık normalden uzaklaşır",
              "Kırılma açısı sıfırdır",
              "Işık hiç kırılmaz",
            ],
            dogruIndex: 1,
            ipucu1: "💡 Snell yasasını ve ortam yoğunluklarını düşün.",
            ipucu2: "💡 Yoğun → seyrek: hız artar, ışın normalden uzaklaşır.",
          },
          {
            soru: "Yakınsak (konveks) mercek ne tür görüntü oluşturur?",
            secenekler: [
              "Her zaman sanal ve dik",
              "Her zaman gerçek ve ters",
              "Nesnenin konumuna bağlı olarak gerçek veya sanal",
              "Her zaman büyütülmüş",
            ],
            dogruIndex: 2,
            ipucu1: "💡 Odak noktasının içinde ve dışında sonuç değişir.",
            ipucu2: "💡 Nesne odak içinde → sanal; odak dışında → gerçek ters görüntü.",
          },
        ],
      },
      kimya: {
        ad: "Organik Kimyaya Giriş",
        sorular: [
          {
            soru: "Organik kimyanın temelini oluşturan element hangisidir?",
            secenekler: ["Hidrojen", "Oksijen", "Karbon", "Azot"],
            dogruIndex: 2,
            ipucu1: "💡 Bu element 4 bağ yapabilir ve uzun zincirler kurabilir.",
            ipucu2: "💡 Karbon (C) zincirlenerek büyük organik moleküller oluşturabilir.",
          },
          {
            soru: "CH₄ (metan) hangi tür organik bileşiktir?",
            secenekler: ["Alkol", "Alkan", "Alken", "Alkin"],
            dogruIndex: 1,
            ipucu1: "💡 Karbonlar arası yalnızca tek bağ içeren doymuş hidrokarbonlar.",
            ipucu2: "💡 Alkanlar C–C tek bağlıdır; CH₄ en basit alkan örneğidir.",
          },
          {
            soru: "Etil alkol (etanol) kaç karbonlu bir bileşiktir?",
            secenekler: ["1", "2", "3", "4"],
            dogruIndex: 1,
            ipucu1: "💡 'Etil' öneki 2 karbon atomuna işaret eder.",
            ipucu2: "💡 CH₃CH₂OH → 2 karbon atomu içerir.",
          },
        ],
      },
      "turk-dili": {
        ad: "Cumhuriyet Dönemi Edebiyatı",
        sorular: [
          {
            soru: "Cumhuriyet dönemi Türk edebiyatının belirgin özelliği nedir?",
            secenekler: [
              "Divan şiiri geleneğini sürdürmek",
              "Yalnızca dini konuları işlemek",
              "Millî kimlik, halk diline dönüş ve modern türleri benimsemek",
              "Fransız romantizmiyle sınırlı kalmak",
            ],
            dogruIndex: 2,
            ipucu1: "💡 1923 Cumhuriyeti dil devrimi ve millî değerleri ön plana çıkardı.",
            ipucu2: "💡 Cumhuriyet dönemi edebiyatçıları sade Türkçeyi ve yeni toplumu işledi.",
          },
          {
            soru: "Yaşar Kemal'in 'İnce Memed' adlı eseri hangi türdedir?",
            secenekler: ["Şiir", "Tiyatro", "Roman", "Deneme"],
            dogruIndex: 2,
            ipucu1: "💡 Bu eser Anadolu halkını ve eşkıyalık geleneğini konu alır.",
            ipucu2: "💡 'İnce Memed' Yaşar Kemal'in uzun soluklu roman serisidir.",
          },
          {
            soru: "Orhan Veli Kanık'ın öncüsü olduğu şiir akımı hangisidir?",
            secenekler: [
              "Divan şiiri",
              "Garip hareketi",
              "Hisarcılar",
              "İkinci Yeni",
            ],
            dogruIndex: 1,
            ipucu1: "💡 1941'de Orhan Veli, Melih Cevdet ve Oktay Rifat bir bildiri yayımladı.",
            ipucu2: "💡 'Garip' akımı sade dil ve sıradan insanın hayatını işledi.",
          },
        ],
      },
    },
  },
];

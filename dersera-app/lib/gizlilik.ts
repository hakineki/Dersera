// KVKK aydınlatma metni ve gizlilik politikası (/gizlilik). İçerik koddaki gerçek veri akışına göre yazıldı:
// yeni bir veri, saklama süresi ya da hizmet sağlayıcı eklenince burası da güncellenir ve sürüm tarihi değişir.
// İstemci de okur: ağır modül içe aktarmamalı.

export const GIZLILIK_SURUMU = "2026-09-29";

export const VERI_SORUMLUSU = { ad: "Hakan Demir", eposta: "hakanart@gmail.com" };

export interface GizlilikBolumu {
  baslik: string;
  metin?: string;
  liste?: string[];
}

export const GIZLILIK_BOLUMLERI: GizlilikBolumu[] = [
  {
    baslik: "Veri sorumlusu",
    metin: `Dersera'da işlenen kişisel veriler bakımından 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında veri sorumlusu ${VERI_SORUMLUSU.ad}'dir. İletişim: ${VERI_SORUMLUSU.eposta}. Dersera'yı kurum olarak kullanan okullarla imzalanacak veri işleme sözleşmesinde okulun ve Dersera'nın rolleri ayrıca belirlenir.`,
  },
  {
    baslik: "Hangi verileri işliyoruz",
    liste: [
      "Öğretmen hesabı: kullanıcı adı, şifrenin geri çevrilemez özeti (şifrenin kendisi saklanmaz), hesabın açılış zamanı ve kullanım koşullarını onayladığın sürüm ve tarih. Ad-soyad, e-posta ya da telefon istenmez.",
      "Oturum: tarayıcına yazılan tek bir oturum çerezi ve sunucuda bu çerezin özeti.",
      "Öğretmen içeriği: oluşturduğun ve kütüphanene kaydettiğin oyunlar, koleksiyonların, okul ve topluluk paylaşımların, verdiğin inceleme kararları ve öğretmen puanların, kredi kullanım hareketlerin, okul üyeliğin ve rolün.",
      "Kopya kaydı: topluluktan ya da okul kütüphanesinden bir oyunu açtığında kullanıcı adın, oyun ve zaman kaydedilir (içeriğin izinsiz dağıtımını önlemek için).",
      "Öğrenme döngüsü: bir oyunu yapay zekâyla güncellerken yazdığın talimat metni, kim yazdığı bilgisi olmadan (yalnız sınıf ve dersle) saklanır; platform yöneticisi bu talimatları ve toplu kullanım sayılarını görür ve oyun üretim kurallarını iyileştirmek için yapay zekâdan öneri alır. Talimata kişisel bilgi yazmamalısın. Ayrıca öğretmen başına, öğrenci bazında olmayan aylık öğrenme takibi sayaçları (öğrenme çıktısına göre deneme ve yanlış sayıları) tutulur.",
      "Öğrenci: yalnız öğrencinin seçtiği takma ad ve oyun sonuçları (süre, ceza, ipucu sayısı, durak bitiş zamanları), oyunu bitirip bitirmediği ve verdiği oyun puanı. İstatistiklerde öğrenci, oyun kodu ve takma addan üretilen bir özetle temsil edilir. Öğrenciden ad-soyad, okul numarası, fotoğraf ya da iletişim bilgisi istenmez; öğrenci hesabı yoktur.",
      "Güvenlik kayıtları: kötüye kullanımı sınırlamak için IP adresi ve giriş denemesindeki kullanıcı adı, 1 dakika ile 1 saat arasında silinen sayaçlarda kullanılır; barındırma sağlayıcısı da erişim kayıtlarında IP adresini tutar.",
      "Kaynak metin: oyun oluştururken yapıştırdığın ya da PDF'ten (PDF tarayıcında okunur, sunucuya yüklenmez) aldığın metin yalnız oyunu üretmek için yapay zekâ hizmetine gönderilir; Dersera'da saklanmaz. Bu metinden öğrencilere ait kişisel bilgileri çıkarmak öğretmenin sorumluluğundadır.",
    ],
  },
  {
    baslik: "Amaçlar ve hukuki sebepler",
    liste: [
      "Öğretmen hesabını açmak, oturum yönetmek, oyun oluşturmak ve yayınlamak, okul ve topluluk özelliklerini sunmak, kredi ve kullanım sınırlarını uygulamak: öğretmenle kurulan hizmet sözleşmesinin kurulması ve ifası (KVKK md. 5/2-c).",
      "Öğrencinin öğretmenin başlattığı oyuna katılması, sonucunun öğretmene gösterilmesi ve oyun istatistikleri: veri en aza indirilerek (yalnız takma ad) veri sorumlusunun meşru menfaati (md. 5/2-f); öğrencinin temel hak ve özgürlüklerine zarar verilmemesi için veri kısa sürede silinir.",
      "Hesap güvenliği, kötüye kullanımın ve içerik sızıntısının önlenmesi, çocuklara uygun olmayan içeriğin denetlenmesi, yedekleme ve oyun üretiminin iyileştirilmesi: veri sorumlusunun meşru menfaati (md. 5/2-f).",
      "Kanuni yükümlülüklerin yerine getirilmesi ve hakların korunması gerektiğinde: md. 5/2-ç ve 5/2-e.",
    ],
  },
  {
    baslik: "Toplama yöntemi",
    metin:
      "Veriler, Dersera'yı kullanırken formlara girdiğin bilgilerden ve kullanım sırasında otomatik olarak (oturum çerezi, sonuç gönderimi, güvenlik sayaçları) elektronik ortamda toplanır.",
  },
  {
    baslik: "Kimlere ve nereye aktarılıyor",
    metin:
      "Veriler satılmaz, reklam ya da profil çıkarma amacıyla kullanılmaz; yalnız hizmeti çalıştırmak için aşağıdaki hizmet sağlayıcılara aktarılır. Bu sağlayıcıların sunucuları Türkiye dışındadır (ABD ve/veya AB); bu nedenle aktarım yurt dışına aktarım niteliğindedir (KVKK md. 9). Aktarım için gereken güvencelere ilişkin soruların için veri sorumlusuna yazabilirsin.",
    liste: [
      "Vercel Inc.: uygulamanın barındırılması, erişim kayıtları, oyun görsellerinin ve şifreli gece yedeğinin saklanması.",
      "Upstash Inc.: uygulama verilerinin saklandığı veritabanı (yukarıdaki tüm hesap, içerik ve sonuç verileri).",
      "OpenAI (tanımlı değilse Anthropic): oyun metni üretimi, yapay zekâyla güncelleme, çocuk güvenliği denetimi ve oyun görselleri için öğretmenin seçimleri, ön notu, kaynak metni, talimatı ve oyun metinleri; öğrenme döngüsü önerileri için toplu sayılar ve kimliksiz talimat metinleri. Öğrenci takma adları ve sonuçları yapay zekâ hizmetine gönderilmez.",
      "Aynı okuldaki okul yöneticisi, okul panosunda öğretmenlerin kullanıcı adını, rolünü, katılma tarihini, oyun ve paylaşım sayılarını, oyunlarındaki öğrenci sayısını ve puan ortalamasını ve okul kredi kullanımını görür. Oyunu yayınlayan öğretmen, o oyundaki öğrencilerin takma adlarını ve sonuçlarını görür. Topluluktaki oyunların öğretmen ve öğrenci puan ortalamaları diğer öğretmenlere gösterilir.",
    ],
  },
  {
    baslik: "Saklama süreleri",
    liste: [
      "Öğrenci sonuçları ve istatistikteki öğrenci özeti: 7 gün. Oyuna katılan takma adlar, bitirme ve puan bilgisi ve oyun kaydı: oyun süresi bitiminden 1 gün sonra silinir.",
      "Oturum: 30 gün ya da çıkış yapana kadar.",
      "Güvenlik sayaçları (IP ve kullanıcı adı içeren): 1 dakika ile 1 saat; günlük kullanım sınırları: 24 saat.",
      "Moderasyon kayıtları: 30 gün. Kredi aylık kullanımı: 40 gün; kredi hareketleri: son 100 hareket.",
      "Öğrenme takibi ve öğrenme döngüsü aylık sayaçları: 400 gün. Kimliksiz talimat metinleri: son 200 talimat.",
      "Öğretmen hesabı, kütüphane, koleksiyonlar, paylaşımlar ve kopya kaydı (son 5.000 kayıt): hesap kullanıldığı sürece. Öğretmen kütüphanesindeki oyunları ve koleksiyonlarını istediği an silebilir.",
      "Oyun görselleri (kişisel veri içermez, yalnız oyun metninden üretilir): süresiz, adresi tahmin edilemez biçimde.",
      "Şifreli gece yedeği: 14 gün; silinen veriler yedeklerden de en geç bu süre sonunda kalkar.",
    ],
  },
  {
    baslik: "Çerezler ve tarayıcıda saklanan bilgiler",
    metin:
      "Yalnız oturumunu sürdürmek için zorunlu bir çerez kullanılır (dersera_oturum, 30 gün). Reklam, analiz ya da takip çerezi ve üçüncü taraf izleme aracı yoktur. Oyunun internet kesilse de sürmesi için tarayıcının yerel deposunda oyun içeriği, takma ad, oyuncu anahtarı, oyun ilerlemesi, süreler ve cihazdaki sonuç listesi; öğretmen tarafında yayındaki oyunun yönetim anahtarı ve istersen girdiğin pilot bilgileri tutulur. Bunlar yalnız o cihazdadır; tarayıcı verilerini silerek kaldırabilirsin.",
  },
  {
    baslik: "Hakların",
    metin: `KVKK md. 11 uyarınca; kişisel verilerinin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, işleme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, yurt içinde ya da yurt dışında aktarıldığı üçüncü kişileri bilme, eksik ya da yanlış işlenmişse düzeltilmesini, KVKK md. 7'deki şartlar çerçevesinde silinmesini ya da yok edilmesini ve bu işlemlerin aktarıldığı üçüncü kişilere bildirilmesini isteme, münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhine bir sonuç çıkmasına itiraz etme ve kanuna aykırı işleme nedeniyle zarara uğrarsan zararın giderilmesini talep etme haklarına sahipsin. Başvurunu ${VERI_SORUMLUSU.eposta} adresine, hesabının kullanıcı adını belirterek gönderebilirsin; kimliğini doğrulamak için ek bilgi istenebilir. Başvurular en geç 30 gün içinde yanıtlanır; kural olarak ücretsizdir (KVKK md. 13). Öğrenci verisine ilişkin başvurular veli tarafından da yapılabilir; öğrenci hesabı olmadığından başvuruda oyun kodu ve takma ad belirtilmelidir. Başvurun reddedilir, yanıt yetersiz bulunur ya da süresinde yanıt verilmezse Kişisel Verileri Koruma Kurulu'na şikâyette bulunabilirsin (KVKK md. 14).`,
  },
  {
    baslik: "Güvenlik",
    metin:
      "Şifreler geri çevrilemez biçimde (scrypt) özetlenir; bağlantılar şifrelidir (HTTPS); Dersera ile oluşturulan oyunların soruları yalnız oyuna katılan öğrenciye açılır; sonuç listesini yalnız oyunu yayınlayan öğretmen görür; yedekler AES-256-GCM ile şifrelenir.",
  },
  {
    baslik: "Değişiklikler",
    metin: "Bu metin veri işleme değiştikçe güncellenir; üstteki sürüm tarihi son güncellemeyi gösterir.",
  },
];

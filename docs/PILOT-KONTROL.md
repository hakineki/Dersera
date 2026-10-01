# Pilot Kontrol Listesi

V1 pilotuna çıkmadan önce bir kez, her büyük sürümden sonra yeniden yapılır. Kapsam: docs/URUN-BAGLAMI.md V1.
Her satırın yanına sonucu (✓ / ✗ + not) yazın. ✗ olan satır pilotu durdurur.

## 1. Ortam değişkenleri (Vercel → Production)

| Değişken | Gerekli | Not |
|---|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` (ya da `UPSTASH_REDIS_REST_URL/TOKEN`) | Evet | Yoksa üretimde hiçbir kalıcı depo açılmaz: hesap, oyun, sonuç, kütüphane ve topluluk uçları hata verir (503/500), veri belleğe yazılmaz. Günlükte `[redis] Ortam değişkenleri yok` görünür. |
| `OPENAI_API_KEY` ya da `ANTHROPIC_API_KEY` | Evet | OpenAI varsa o, yoksa Anthropic kullanılır. Oluşturma, güncelleme ve çocuk güvenliği denetimi aynı sağlayıcıdan gider. |
| `AI_MODEL` / `ANTHROPIC_MODEL` | Hayır | Varsayılan modeli değiştirmek için. |
| `DERSERA_YONETICILER` | Moderasyon için | Virgülle ayrılmış kullanıcı adları (ör. `hakan`). Ad ilk girişte hesaba bağlanır; adı ÖNCE kendiniz alın, sonra ekleyin. Yönetici `/moderasyon` sayfasını görür. |
| `KAYIT_DAVET_KODU` | Evet | Yalnız kodu bilen öğretmen hesap açar; kodu öğretmenlere siz verirsiniz. Canlıda tanımlı değilse yeni kayıt tamamen kapalıdır (öğrenci hesap açamasın). |
| `YEDEK_ANAHTARI` | Yedek için | 32 baytlık gizli anahtar (base64). Üretmek için: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Parola yöneticinizde de saklayın: anahtar kaybolursa yedekler açılamaz. |
| `CRON_SECRET` | Yedek için | Uzun rastgele bir metin. Vercel gece yedeğini (`vercel.json`, her gece 04:00 TR) bu anahtarla çağırır. `BLOB_READ_WRITE_TOKEN` da gerekir. |
| `BLOB_READ_WRITE_TOKEN` (ve `OPENAI_API_KEY`) | Görseller için | Görseller oyun üretimiyle aynı OpenAI anahtarıyla (GPT Image) üretilir; ikisi de tanımlıysa Composer'da "Görsellerle zenginleştir" görünür (yalnız Anthropic kullanılan kurulumda görsel yoktur). Blob: Vercel → Storage → Blob deposu oluşturup projeye bağlayın. Hobby'de 1 GB aşılırsa proje durur; kullanım izlenmeli. Composer sayfası derlemede oluştuğu için ekledikten sonra yeniden deploy gerekir. |
| `GORSEL_MODEL`, `GORSEL_KALITE` | Hayır | Varsayılan `gpt-image-2`, `low` (görsel başı ~0,6 sent; `medium` ~5 sent). |
| `DERSERA_EN_AZ_OYUN_SN` | Hayır | Öğretmen puanında sayılan en kısa oynama süresini değiştirir (varsayılan: max(120 sn, sürenin %25'i)). |

## 2. Redis duman testi (Lua betikleri)

Kredi harcama/iade, sürüm çakışma denetimi, topluluk durum geçişi, puanlar, bitiren sayımı ve hesap açma Lua
betikleriyle atomiktir. Birim testleri bellek deposunda çalışır; gerçek Redis'te bir kez doğrulanmalıdır.

1. Upstash'te **ayrı, boş** bir veritabanı açın (ör. `dersera-duman`). Üretim veritabanını kullanmayın: test boş
   olmayan veritabanında başlamaz.
2. `dersera-app` klasöründe:

   ```bash
   DERSERA_REDIS_DUMAN=1 KV_REST_API_URL="<duman-db-url>" KV_REST_API_TOKEN="<duman-db-token>" npx jest __tests__/depoSozlesmesi.test.ts
   ```

3. Beklenen: `bellek depoları` ve `redis depoları` altında 16'şar test geçer. Test bitince yazdığı anahtarları siler.

## 3. Uçtan uca akış (gizli sekmede, canlı adreste)

Öğretmen A ve B, üç günden eski iki ayrı hesap; öğretmen C ayrı bir hesap. Öğrenciler için 10 ayrı cihaz/sekme.

| # | Adım | Beklenen |
|---|---|---|
| 1 | A kayıt olur / giriş yapar | Kütüphane ve kredi görünür: 30 aylık kredi. |
| 2 | Oluşturma formu: sınıf, ders, konu → tarz → kontrol | Üç bölüm; özet ve "Bu oyun 3 kredi" (40 dk). |
| 3 | Oyunu oluştur | Yükleme adımları ilerler; önizleme açılır. Kredi 27. |
| 4 | Önizleme rozetleri | Beş rozet; "Bağlam denetimi yapıldı…" notu. |
| 5 | Bir durağı elle düzenle | Kredi değişmez; rozetler canlı güncellenir; not "yayın sırasında yapılacak" olur. |
| 6 | Dersera'yla güncelle: 1 durak + talimat | Seçili durak değişir, diğerleri aynı kalır. Kredi 26. |
| 7 | Kütüphaneye kaydet | "Sürüm 1" kartı. Küçük düzenleme sonrası kaydet → "Sürüm 2"; büyük değişiklik → varyant. |
| 8 | Yayınla | Oyun kodu ve QR'lar; öğretmen paneli açılır. Kredi değişmez. |
| 9 | 10 öğrenci koda katılır, takma ad girer, oynar, bitirir | Sıralama canlı güncellenir. |
| 10 | Öğretmen paneli → Sınıf | Öğrenme raporu: katılan/bitiren, çıktı bazında zorluk. |
| 11 | Öğrenciler oyunu puanlar (≥ 3,5) | Kütüphane kartında öğrenci sayısı ve puan. |
| 12 | A: "Toplulukta paylaş" | Durum "incelemede"; topluluk listesinde görünmez. |
| 13 | B ve C inceleme kuyruğunda oyunu açar | Tam oyun ve 8 kapının sonucu (benzerlik dahil); gönderen gizli. |
| 14 | B ve C kabul eder | Oyun toplulukta yayında; A'nın kazanılan kredisi +5. |
| 15 | B: topluluk oyununu "Oyunu Kullan" ile kopyalar, sınıfında oynatır, öğretmen puanı verir | 🍎 öğretmen puanı (3 öğretmenden sonra görünür). |
| 16 | B: A'nın oyununu hafifçe değiştirip topluluğa gönderir | "metin örtüşmesi %…; başka öğretmenin oyunu…" ile engellenir. |
| 17 | A: topluluktan geri çeker | Listeden çıkar; aynı içerik yeniden paylaşılınca incelemesiz geri gelir. |
| 18 | Kredi bitince oluşturma | 402: "bakiyen yetmiyor"; model çağrılmaz. |
| 19 | Yönetici: içerik uyarısı alan bir oyunu yayınla, `/moderasyon`u aç | Kayıt "Sınıf yayını" olarak görünür; "Oyunu bitir" öğrencilerin oyununu sonlandırır. |
| 20 | A: Öğretmen paneli → Okulum → okul oluştur | A okul yöneticisi; davet kodu yalnız A'da görünür. |
| 21 | B: davet koduyla katıl (küçük harf/tireyle de) | B öğretmen; davet kodu ve pano B'de yok. B ikinci bir okula katılamaz. |
| 22 | A: Kütüphane kartında "Okulla paylaş" | B'nin okul kütüphanesinde görünür; B "Kullan" ile composer'da kopya açar ve kendi kütüphanesine kaydeder. |
| 23 | A: Okulum → pano; B'yi çıkar | Pano öğretmen/oyun/öğrenci sayılarını gösterir; çıkarılan B okulu artık görmez. |
| 24 | Yönetici: `/yonetim/okul-havuzu` → A'nın davet koduyla okulu bul, aylık 20 kredi ata | Okul "Havuzu olan okullar"da; A'nın panosunda "Okul kredi havuzu: 0/20". Yönetici olmayan hesap sayfada 403 görür. |
| 25 | A: pano → öğretmen başına sınır 3; B aylık hakkını bitirip bir oyun daha oluşturur | B'nin bakiyesinde "+ okul havuzundan 3"; oluşturma havuzdan düşer, panoda B "Havuzdan 3/3". Sınır dolunca kazanılan kredi kullanılır, o da yoksa 402. |
| 26 | A: Composer → Kaynak → "PDF'ten al" ile metinli bir ders notu PDF'i seç, oluştur | Metin kutuya düşer (PDF sunucuya gitmez); özet "4 kredi (kaynak dahil)" (40 dk). Oyunun soruları kaynaktaki bilgileri kullanır; hareket "Oyun oluşturma (40 dk, kaynaktan)". Taranmış PDF net bir hata verir. |
| 27 | A: Composer → "Görsellerle zenginleştir" işaretli oluştur | Özet "4 kredi (görseller dahil)" (40 dk). Önizleme hemen açılır; "Görseller hazırlanıyor 1/4…4/4" ilerler, kapak ve 3 sahne görünür. Yazısız, yaşa uygun çizimler. Kaydedilip yayınlanan oyunda öğrenci kapağı girişte, sahne görsellerini duraklarda görür. Hiç görsel üretilemezse görsel kredisi iade edilir. |
| 27a | A: Composer önizlemesinde "Öğrenci gözüyle dene"; sonra Kütüphane kartında, okul kütüphanesinde ve toplulukta "👁 Demo / Öğrenci gözüyle dene" | Oyun öğrencinin ekranıyla açılır; üstte sarı "Öğrenci gözüyle demo · sonuç kaydedilmez" şeridi, Baştan ve Demodan çık. Okul macerasında QR durağı "QR’ı taradım say (demo)" ile geçilir. Demo sonuç, puan ve istatistik yazmaz; aynı cihazdaki öğrencinin yarım oyunu bozulmaz. Topluluk oyununun demosu günlük açma sınırına ve kopya kaydına sayılır. |
| 28 | Gizli sekmede ana sayfa; sonra `/library` ve `/qr-kutuphane` | Ana sayfada yalnız Öğrenci ve Öğretmen. Girişsiz iki sayfa da "Bu sayfa yalnız öğretmenlere açık" der, içerik (QR kodları, oyun listesi) gelmez. Öğretmen girişiyle açılır. |
| 29 | Davet koduyla ve kodsuz kayıt dene | Kodsuz ya da yanlış kodla 403; doğru kodla hesap açılır. |
| 30 | Yönetici: Vercel → Cron Jobs → yedek görevini elle çalıştır | Yanıt anahtar sayısını verir; Blob'da `yedek/` altında dosya belirir. Dosyayı indirip `YEDEK_ANAHTARI=… node scripts/yedek-geri-yukle.mjs <dosya>` ile özetin açıldığını görün (kuru çalışma, hiçbir şey yazılmaz). |
| 31 | Oyun yayınla; gizli sekmede `/api/games/<KOD>` adresini aç | Yanıtta soru ve cevap yok (`icerikKilitli: true`). Öğrenci takma adla katılınca oyun açılır; ekranda silik "takma ad · kod" filigranı görünür. Oyun bitince aynı adres içerik vermez. |
| 32 | İki farklı öğrenci aynı oyunda ilk soruya bak | Çoktan seçmeli seçeneklerin sırası öğrenciye göre farklı; sayfa yenilense de aynı öğrencide değişmez. |
| 33 | Öğretmen: başka öğretmenin 21 topluluk oyununu aç; yönetici `/yonetim/kopya-kaydi` | 21.'de "Günde en çok 20…" uyarısı; kopya kaydında öğretmen, oyun ve zaman görünür. Kayıtta kullanım koşulları onayı olmadan hesap açılmaz. |
| 33a | Topluluk başlangıç dönemi (toplulukta yayında 100 oyundan az): yeni bir hesapla, hiç oynatılmamış bir oyunu Kütüphane → "Toplulukta paylaş" | Kütüphanede yeşil "Topluluk başlangıç dönemi … yer kaldı" notu; oyun incelemesiz hemen topluluk listesinde; kredi ödülü yok. Yönetici `/moderasyon`da "İncelemesiz" kaydı görür, "Topluluktan reddet" ile kaldırabilir. Uygunsuz içerik ve başkasının oyununun kopyası yine engellenir. |
| 34 | Yönetici: `/yonetim/ogrenme` (adım 3–33'teki oyunlardan sonra) | Bu ayın üretim, düzenleme, yapay zekâ güncellemesi ve öğrenci sonuçları görev türü ve ders kırılımında görünür; az örnekli oranlar "—". Sayfada öğretmen ya da öğrenci adı yok. Yönetici olmayan hesap 403 görür. |
| 35 | Yönetici: aynı sayfada "Öneri iste" (bu ay en az 10 oyun ya da 30 öğrenci denemesi) | Yapay zekâ en çok 5 öneri yazar; her birinin gerekçesinde rapordaki bir sayı var, kural tek cümle. Eşik altında net uyarı. Hiçbir öneri onaylanmadan oyun üretimine girmez. |
| 36 | Yönetici: bir öneriyi onayla, A yeni oyun oluştursun; sonra kuralı "Geri al" | Onaylı kural kapsamındaki (ders/sınıf) yeni oyunlarda uygulanır; geri alınınca sonraki oluşturmalarda yok. Kararı veren yönetici ve zaman kayıtlı. |
| 37 | A: girişliyken Composer oyunu yayınla, 5+ öğrenci bitirsin; Öğretmen paneli → Öğrenme | Oyunun öğrenme çıktıları metni, dersi ve ünitesiyle görünür; oranlar 5 denemeden sonra; öğrenci adı yok. A'nın kendi deneme oynayışı ve B'nin oyunları A'nın raporunda yok. |
| 38 | A: zorlanılan bir çıktıda "Pekiştirme oyunu oluştur" | Composer aynı sınıf, ders ve üniteyle, çıktıyı anlatan ön notla açılır; kredi yalnız "Oyunu Oluştur"da düşer. |
| 39 | A: `/library` → Topluluk; ders ve sınıf seç, "Ünite (öğrenme çıktıları)"dan bir ünite seç | Yalnız o ünitenin oyunları listelenir; kartlarda öğrenme çıktısı kodları (en çok 4, fazlası "+N") görünür. |
| 40 | A: "Sırala" → En çok oynanan / Öğretmen puanı / Öğrenci puanı; "Daha fazla" | Liste seçilen ölçüte göre büyükten küçüğe; puanı olmayanlar sonda. "Sıralama en yeni 500 oyun içinde yapılır." notu görünür. |
| 41 | A: bir kartta "Benzer oyunlar ›" | Aynı sınıf ve ünitedeki en çok 6 oyun, ortak öğrenme çıktısı çok olan önce; oyunun kendisi yok. Başlık öğrenci gözüyle demoyu açar. |
| 42 | A: kartta "☆ Koleksiyona ekle" → yeni koleksiyon "Favoriler"; "Koleksiyonlarım" sekmesi; yeniden adlandır, oyunu çıkar, sil | Düğme "★ 1 koleksiyonda" olur; sekmede koleksiyon ve oyunlar görünür. B, A'nın koleksiyonlarını görmez. Koleksiyon silinince oyunlar toplulukta kalır. Topluluktan kalkan oyun "Bu oyun artık toplulukta değil" satırıyla görünür. En çok 20 koleksiyon, her birinde 100 oyun. |
| 43 | Oyun yayınla, bir öğrenci bitirsin; gizli sekmede `/api/results?code=<KOD>` adresini aç | Yanıt 403 "Yetkisiz"; takma ad ve süreler görünmez. Yayınlayan öğretmenin panelinde sonuç tablosu güncellenir (oyun bittikten sonraki günlerde de, 7 güne kadar). |
| 44 | Gizli sekmede ana sayfa, `/game`, Composer (PDF'ten al) ve görselli bir oyun; tarayıcı geliştirici araçlarında Ağ → belge yanıt başlıkları ve Konsol | Yanıtta Content-Security-Policy, X-Frame-Options: DENY, Referrer-Policy, Permissions-Policy, Strict-Transport-Security ve nosniff var. Konsolda "Content Security Policy" / "Refused to" hatası yok; oyun görselleri (Vercel Blob) ve PDF metni yükleniyor. |
| 45 | Ana sayfa alt satırında "Gizlilik ve KVKK"; öğretmen kayıt formu; öğrencinin takma ad ekranında "Gizlilik" | `/gizlilik` açılır: veri sorumlusu, işlenen veriler, amaç ve hukuki sebepler, yurt dışı hizmet sağlayıcılar, saklama süreleri, çerez, KVKK md. 11 hakları ve başvuru e-postası. Metin hukuk incelemesinden geçmeden okullarla veri işleme sözleşmesi imzalanmaz. |
| 46 | Ayrı bir deneme öğretmeni (okul üyesi, kütüphanesinde oyun, koleksiyonu olan): Ayarlar → "Hesabımı sil…" → yanlış şifre, sonra doğru şifre + onay | Yanlış şifrede "Şifre hatalı." ve hiçbir şey silinmez. Doğru şifrede "Hesabın ve verilerin silindi.", giriş ekranı; eski şifreyle giriş yapılamaz, aynı kullanıcı adıyla yeni hesap açılabilir. Okul panosunda öğretmen ve paylaştığı oyunlar yok; toplulukta yayındaki oyunu geri çekilmiş; yönetici `/yonetim/kopya-kaydi`da "silinmiş hesap" görür. Okul yöneticisi ve platform yöneticisi için silme engellenir (e-posta yönlendirmesi). |
| 47 | Yönetici: Öğretmen paneli → "Yönetim" (`/yonetim`) | Özet sayılar (öğretmen, okul, topluluk, moderasyon, bu ayın üretimi), son gece yedeği ve yapılandırma sağlığı (eksik olan ⚠️ ve açıklaması; değerler görünmez). Menüden bütün yönetim bölümlerine geçilir; bulunulan bölüm işaretli. Yönetici olmayan hesap 403 görür. |
| 48 | Bir öğretmen (okul üyesi) oyun oluştursun, görselli oluştursun ve bir durağı yapay zekâyla güncellesin; yönetici `/yonetim/yz-maliyet` | Bu ay: oyun üretimi, çocuk güvenliği denetimi, güncelleme ve görsel satırları model adıyla; token ve görsel sayıları; tahmini TL/$ tutar. "Okula göre" tabloda öğretmenin okulu. Tutarı sağlayıcının (OpenAI/Anthropic) kullanım panelindeki o günkü harcamayla karşılaştır; fark büyükse `lib/yzMaliyet.ts` fiyat varsayımlarını güncelle. |
| 49 | Yönetici `/yonetim/ogretmenler`: deneme öğretmenini ara, seç; gerekçeyle "Hesabı askıya al"; öğretmenin açık sekmesini yenile ve giriş dene; sonra "Hesabı geri aç" ve yeniden giriş. Ayrı bir deneme öğretmenini gerekçe + kullanıcı adı + kendi şifrenle sil | Ayrıntıda okul, kredi, oyun sayısı. Askıda öğretmenin oturumu kapanır, girişte "Hesabın … askıya alındı" görür; geri açınca yeniden giriş yapabilir. Silinen öğretmen giriş yapamaz, adı boşa çıkar. "Son yönetim işlemleri"nde üç işlem, silinen için "silinmiş hesap". Okul yöneticisi silinemez ("önce devret ya da kapat"); platform yöneticisinde askı ve silme düğmeleri yoktur. |
| 50 | Yönetici `/yonetim/okullar`: deneme okulunu seç (yönetici + bir öğretmen üye, bir paylaşım); gerekçeyle yöneticiliği öğretmene devret; sonra okul adı + kendi şifren + gerekçeyle okulu kapat | Listede yönetici, üye ve paylaşım sayısı, havuz. Devirden sonra yeni yönetici okul panosunda davet kodunu görür, eski yönetici öğretmen olur ve `/yonetim/ogretmenler`den silinebilir. Kapatınca "… kapatıldı: n üyelik ve n paylaşım kaldırıldı"; öğretmenlerin panelinde okul yok, eski davet kodu çalışmaz, kişisel kütüphaneleri duruyor; `/yonetim/okul-havuzu`nda okul yok. "Son yönetim işlemleri"nde devir ve kapatma okul adıyla. |
| 51 | Önce Vercel ortam değişkenleri: `RESEND_API_KEY`, `EPOSTA_GONDEREN` (Resend'te doğrulanmış alan adından), `DERSERA_SITE_ADRESI`; `/yonetim` sağlıkta üçü de ✓. Deneme öğretmeni: Ayarlar → E-posta ekle → gelen e-postadaki bağlantı → "E-postamı doğrula"; çıkış yap → "Şifremi unuttum" (kullanıcı adıyla) → e-postadaki bağlantıyla yeni şifre. Yönetici: e-postasız bir deneme öğretmeni için `/yonetim/ogretmenler` → gerekçe + kendi şifren → "Bağlantı üret"; doğrulanmış e-postalı öğretmen için de üret | Doğrulama ve sıfırlama e-postaları birkaç dakika içinde gelir (spam klasörüne de bak); bağlantı açılınca adres çubuğundan belirteç silinir. Sıfırlamadan sonra eski şifre çalışmaz, diğer cihazlardaki oturum kapanır; aynı bağlantı ikinci kez "geçersiz" der. Olmayan kullanıcı adıyla da aynı mesaj görünür. Yöneticinin ürettiği bağlantı 1 saat içinde çalışır ve işlem kaydında görünür; e-postalı öğretmene "sıfırlama bağlantısı üretildi" uyarısı gelir (bağlantının kendisi gelmez). E-postadaki bağlantılar "#t=" içerir. |
| 52 | Öğretmen: Okul Macerası seçip 40 dk oyun oluştur; önizlemede "QR yerleşim listesi"ni yazdır ve kartları listedeki mekân ve noktalara yapıştır. İki telefonla iki takım oyna | Her durakta 📍 mekân ve nokta; seçim sahnesi yok. Takımlar farklı mekânlardan başlar (başlangıçta mekân adı ve bilmece). Yanlış yerin QR'ı "Burası değil" ve +30 sn (aynı QR ikinci kez cezasız); çözülmüş yerin QR'ı "zaten çözdün". İpucu +30 sn, en çok 2. Görevden sonra sıradaki yerin bilmecesi; hepsi bitince final. 8 durakta 3 kanıt. Eski okul oyunları eskisi gibi QR numarasıyla oynanır. |
| 53 | Öğretmen: aynı konuda 2. sınıf ve 10. sınıf için birer Okul Macerası oluştur. Önizlemede birkaç durağın "Düzenle" penceresinde konum bilmecesini aç; ipuçlarını "öğrenci gözüyle demo"da ipucu düğmesiyle gör. Sunucu kayıtlarında "konum bilmecesi uyarlaması kullanılmadı" satırlarını say | Bilmeceler sınıf düzeyine uyarlanmış: 2. sınıfta kısa ve somut (cümle başına ~10 kelime), 10. sınıfta daha dolaylı. Her bilmece yerleşim listesindeki mekânı ve noktayı anlatır, başka mekân anmaz, durağın görev cevabını vermez. Son ipucu iki oyunda da noktanın adını söyler. Bankaya dönen durak sayısı az (çoğu durak uyarlanmış). |
| 54 | Öğretmen: Okul Macerası seç; "Rota" bölümünde 3 durağın mekânını seç (birine okuldaki adını yaz, ör. "10-A sınıfı"), kalanını rehbere bırak ve oluştur. Önizlemede bir durağı "Düzenle"de başka mekâna taşı, "Hazır bilmecelerden seç" ile bilmece seç ve metni düzelt; okuldaki adı silip kaydet | Seçtiğin mekânlar aynı sırada ve yazdığın adla gelir; kalanını rehber tekrarsız seçer (yapay zekâ başka mekân yazdıysa önizlemede uyarı). Düzenle'de diğer duraklardaki mekânlar pasif; mekân değişince o mekânın ilk bilmecesi gelir; 10 hazır bilmece listelenir. Yerleşim listesi yeni adı ve noktayı gösterir. Boş adla "mekânı ya da konum bilmecesi eksik" engeli çıkar. Boş şablonda rota bölümü yoktur. |
| 55 | Öğretmen: Okul Macerası önizlemesinde ve oyunu yayınladıktan sonra öğretmen panelinde yerleşim listesinin "🖨 Yazdır" düğmesine bas; yazdırma önizlemesine bak, birini A4 bas ya da PDF kaydet | Sayfanın geri kalanı basılmaz. 1. sayfa: oyun adı, (panelde) oyun kodu, QR / mekân / nokta / "Yapıştırıldı" kutusu tablosu ve kısa yönerge. Sonraki sayfalar: sayfa başına 4 açık tasarım QR kartı; her kartın altında kesik çizgiyle "Buraya yapıştır (QR n): mekân — nokta" şeridi. Basılı kart telefonla taranınca oyunda doğru durak açılır. Yazdırma kapatılınca sayfa normal; "Yazdır" yeniden çalışır. |
| 56 | Davet koduyla yeni deneme öğretmeni kaydı: önce e-postasız, sonra geçersiz ("ayse"), sonra gerçek bir adresle. Kayıttan sonra panel açıkken "Bağlantıyı yeniden gönder"; e-postadaki bağlantıyı telefonda ya da başka sekmede açıp doğrula, sonra panel sekmesine dön (yenilemeden). Eski (e-postasız) bir hesapla giriş yap ve uyarıdaki "E-posta ekle"yi kullan | E-postasız "Hesap Oluştur" basılmaz; "ayse" gibi geçersiz adreste tarayıcının kendi e-posta uyarısı çıkar (sunucu da "Geçerli bir e-posta adresi yaz…" der), hesap açılmaz. Panele dönünce "E-postanı doğrula" uyarısı yenilemeden kalkar. Gerçek adresle hesap açılır ve doğrulama e-postası gelir; panelin üstünde "E-postanı doğrula" uyarısı (adresle) her sekmede görünür, yeniden gönderince ikinci e-posta gelir. Doğrulayınca uyarı kalkar. Eski hesapta "Hesabına e-posta ekle" uyarısı çıkar; "E-posta ekle" Ayarlar'daki e-posta bölümüne götürür. Ayarlar'da "Kaldır" yok, yalnız "Adresi değiştir". /gizlilik e-postayı "hesap açarken istenir" diye anlatır. |
| 57 | Öğretmen: 4. sınıf ve 10. sınıf için birer Okul Macerası; "Rota"da 2 durağın mekânını seç ve "Nokta" alanına yaz (ör. "pencere kenarındaki masanın üstündeki mikroskop", "kantin tezgâhının sağındaki çöp kutusu"), birini boş bırak. Önizlemede bu durakları "Düzenle"de ve "öğrenci gözüyle demo"da ipucu düğmesiyle aç; yerleşim listesini yazdır. Sunucu kayıtlarında "konum bilmecesi uyarlaması kullanılmadı" satırlarını say | Nokta yazılan durakta bilmece ve 1. ipucu o noktayı anlatır (nesneyi ve yerini dolaylı söyler, tarifi aynen söylemez), sınıf düzeyine uygun; son ipucu "QR'ı burada ara: <yazdığın nokta>". Uyarlama reddedilen durakta genel metin ("öğretmeninin seçtiği bir noktadayım…") kalır, son ipucu yine noktayı söyler. Nokta boş duraklarda bankadan bilmece gelir. Yerleşim listesi ve basılı kart şeridi yazdığın noktayı gösterir. Nokta alanı 100 karakterde durur. Düzenle'de noktayı değiştirmek rehberi çağırmaz. |

## 4. Dağıtım doğrulaması

`/deploy-kontrol` adımları: son commit Vercel'de Ready, gizli sekmede canlı adres, değişen sayfa yeni sürümle.

## 5. Yedekten geri yükleme (yalnız gerektiğinde)

1. Vercel → Storage → Blob → `yedek/` altından istenen günün dosyasını indirin.
2. Önce kuru çalışma: `YEDEK_ANAHTARI=… node scripts/yedek-geri-yukle.mjs <dosya>` — tarih ve anahtar sayısını gösterir.
3. Boş bir veritabanına: `YEDEK_ANAHTARI=… KV_REST_API_URL=… KV_REST_API_TOKEN=… node scripts/yedek-geri-yukle.mjs <dosya> --uygula`. Veritabanı doluysa betik durur; üzerine yazmak için bilerek `--uzerine-yaz` ekleyin (yedekteki anahtarlar silinip yeniden yazılır).
4. Hesap güvenliği: GitHub, Vercel, Upstash ve OpenAI hesaplarında iki adımlı doğrulama açık olmalı; en olası saldırı yolu uygulama değil bu hesaplardır.

## 6. Bilinen sınırlar (pilotta izlenecek)

- QR durak adresleri tahmin edilebilir (`/game?qr=1…20`): bir QR'ı gören öğrenci diğer numaraları deneyerek durakları dolaşmadan ilerleyebilir. Sabit (bir kez basılan) QR tasarımının bedelidir; oyuna özel QR ileride.
- Yerel geliştirmede (Redis'siz) bellek deposu sayfa ve API paketleri arasında paylaşılmaz: giriş yapmış öğretmen yerelde `/library` ve `/qr-kutuphane` sayfalarında "giriş gerekli" görebilir. Canlıda Redis ortak olduğundan sorun yoktur.
- Gece yedeğinde okunamayan (çok büyük) kayıt atlanır ve yönetici sayfasında "BAŞARISIZ · N kayıt okunamadı" olarak görünür.
- Oturumsuz sahte "bitirdim" gönderimi öğrenci sayısını şişirebilir (doğrulanmış öğrenci V2).
- Üç günden eski birden çok hesapla topluluk onayı toplanabilir.
- Yapay zekâ denetimi yapılamazsa yayın durmaz ("gözden geçirin"); kural tabanlı engel her zaman geçerli.
- Benzerlik taraması en yeni 500 yayındaki oyunu ve inceleme kuyruğunu kapsar.
- Topluluk sıralaması (oynanan / puan) ve "Benzer oyunlar" en yeni 500 yayındaki oyun içinde yapılır. Ünite araması ve kartlardaki öğrenme çıktısı kodları bu sürümden sonra topluluğa gönderilen oyunlarda çalışır; daha önce yayınlanmış oyunlar ünite aramasında ve benzer oyunlarda çıkmaz.
- Öğrenme döngüsü önerileri toplu sayılara dayanır; pilotun ilk haftalarında veri azdır. Önerileri onaylamadan önce
  gerekçedeki sayıyı rapordan doğrulayın ve etkisini birkaç oyunda gözleyin; beklenmeyen etki görülürse "Geri al".
- Model kararlarının (çocuk güvenliği, güncelleme kalitesi) yanlış alarm oranı henüz ölçülmedi: pilotta
  engellenen/uyarılan oyunlar not edilmeli.
- Topluluk başlangıç dönemi yayındaki oyun sayısına bakar: yönetici oyun kaldırınca yer açılır; eşzamanlı gönderimler 100’ü birkaç oyun aşabilir. Bu dönemde öğretmen incelemesi yoktur, içeriği yönetici `/moderasyon`dan sonradan gözden geçirir.

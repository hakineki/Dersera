# Pilot Kontrol Listesi

V1 pilotuna çıkmadan önce bir kez, her büyük sürümden sonra yeniden yapılır. Kapsam: docs/URUN-BAGLAMI.md V1.
Her satırın yanına sonucu (✓ / ✗ + not) yazın. ✗ olan satır pilotu durdurur.

## 1. Ortam değişkenleri (Vercel → Production)

| Değişken | Gerekli | Not |
|---|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` (ya da `UPSTASH_REDIS_REST_URL/TOKEN`) | Evet | Yoksa üretimde oran sınırı çalışmaz, oyun oluşturma 503 döner; veriler bellekte kalır ve kaybolur. |
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

3. Beklenen: `bellek depoları` ve `redis depoları` altında 12'şer test geçer. Test bitince yazdığı anahtarları siler.

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
- Öğrenme döngüsü önerileri toplu sayılara dayanır; pilotun ilk haftalarında veri azdır. Önerileri onaylamadan önce
  gerekçedeki sayıyı rapordan doğrulayın ve etkisini birkaç oyunda gözleyin; beklenmeyen etki görülürse "Geri al".
- Model kararlarının (çocuk güvenliği, güncelleme kalitesi) yanlış alarm oranı henüz ölçülmedi: pilotta
  engellenen/uyarılan oyunlar not edilmeli.
- Topluluk başlangıç dönemi yayındaki oyun sayısına bakar: yönetici oyun kaldırınca yer açılır; eşzamanlı gönderimler 100’ü birkaç oyun aşabilir. Bu dönemde öğretmen incelemesi yoktur, içeriği yönetici `/moderasyon`dan sonradan gözden geçirir.

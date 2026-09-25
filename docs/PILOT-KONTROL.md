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
| `KAYIT_DAVET_KODU` | Pilotta önerilir | Tanımlıysa yalnız kodu bilen öğretmen hesap açar. |
| `GEMINI_API_KEY` ve `BLOB_READ_WRITE_TOKEN` | Görseller için | İkisi de tanımlıysa Composer'da "Görsellerle zenginleştir" görünür. Gemini: Google AI Studio anahtarı (görsel modeli ücretli katmanda). Blob: Vercel → Storage → Blob deposu oluşturup projeye bağlayın. Hobby'de 1 GB aşılırsa proje durur; kullanım izlenmeli. Composer sayfası derlemede oluştuğu için ikisini ekledikten sonra yeniden deploy gerekir. |
| `GORSEL_MODEL` | Hayır | Varsayılan `gemini-3.1-flash-lite-image` (görsel başı ~3,4 sent). |
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

3. Beklenen: `bellek depoları` ve `redis depoları` altında 10'ar test geçer. Test bitince yazdığı anahtarları siler.

## 3. Uçtan uca akış (gizli sekmede, canlı adreste)

Öğretmen A ve B, üç günden eski iki ayrı hesap; öğretmen C ayrı bir hesap. Öğrenciler için 10 ayrı cihaz/sekme.

| # | Adım | Beklenen |
|---|---|---|
| 1 | A kayıt olur / giriş yapar | Kütüphane ve kredi görünür: 30 aylık kredi. |
| 2 | Oluşturma formu: sınıf, ders, konu → tarz → kontrol | Üç bölüm; özet ve "Bu oyun 3 kredi" (40 dk). |
| 3 | Oyunu oluştur | Yükleme adımları ilerler; önizleme açılır. Kredi 27. |
| 4 | Önizleme rozetleri | Beş rozet; "Yapay zekâ denetimi yapıldı…" notu. |
| 5 | Bir durağı elle düzenle | Kredi değişmez; rozetler canlı güncellenir; not "yayın sırasında yapılacak" olur. |
| 6 | Yapay zekâyla güncelle: 1 durak + talimat | Seçili durak değişir, diğerleri aynı kalır. Kredi 26. |
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

## 4. Dağıtım doğrulaması

`/deploy-kontrol` adımları: son commit Vercel'de Ready, gizli sekmede canlı adres, değişen sayfa yeni sürümle.

## 5. Bilinen sınırlar (pilotta izlenecek)

- Oturumsuz sahte "bitirdim" gönderimi öğrenci sayısını şişirebilir (doğrulanmış öğrenci V2).
- Üç günden eski birden çok hesapla topluluk onayı toplanabilir.
- Yapay zekâ denetimi yapılamazsa yayın durmaz ("gözden geçirin"); kural tabanlı engel her zaman geçerli.
- Benzerlik taraması en yeni 500 yayındaki oyunu ve inceleme kuyruğunu kapsar.
- Model kararlarının (çocuk güvenliği, güncelleme kalitesi) yanlış alarm oranı henüz ölçülmedi: pilotta
  engellenen/uyarılan oyunlar not edilmeli.

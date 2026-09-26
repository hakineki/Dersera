# YAZILIM FABRİKASI — İŞ AKIŞI BEYNİ
# Bu dosya SADECE iş akışını anlatır. Kod tabanı hakkında hiçbir şey yazma.
# Ajan repo'yu kendisi okuyarak öğrenir (bağlam penceresini harcamayalım).

## TEMEL KURALLAR
1. Asla main üzerinde çalışma. Her iş kendi worktree'sinde ya da oturumun belirlediği dalda başlar.
2. Seçilen akışın her adımında ilgili skill çağrılır. Skill dışında serbest stil çalışma yok.
3. Ajan "yaptım" diyemez — kanıt üretmeden iş bitmez.
4. Merge'ü ajan yapar: testler geçtiyse PR'ı birleştirir, PR linkini kullanıcıya verir ve /deploy-kontrol'e geçer. İSTİSNA: SIKI akışta (R3) merge'den önce kullanıcının açık onayı alınır.
5. İnceleme yapan ajan, işi yapan ajanla FARKLI olmalı (HAFİF akışta bağımsız inceleme yok).

## AKIŞ SEÇİMİ
/risk sınıfla birlikte akışı da seçer. Şüphedeysen bir üst akışı seç.

| Akış | Ne zaman | Adımlar |
|---|---|---|
| HAFİF | R0 VE en fazla 3 dosya VE yalnız görünür metin/stil (CSS, statik metin) ya da README / belgede anlamı değiştirmeyen yazım-biçim düzeltmesi. Komut, betik, yapılandırma (vercel.json, package.json, next.config, public/sw.js) ya da kod mantığı içeren iş HAFİF DEĞİLDİR. Kabul ölçütü, kontrat ve hukuki metin (KVKK, gizlilik, şartlar — nerede durursa dursun) değişikliği HAFİF DEĞİLDİR. AGENTS.md ve .claude/** değişikliği (frontmatter dahil) HİÇBİR ZAMAN HAFİF değildir. | /risk (tek satır) → /new-feature (dal güvenliği için şart) → değiştir → /prove-it (jest; görünür değişiklikse ekran görüntüsü) → PR aç, merge commit ile birleştir → /deploy-kontrol 1-2; 5-6 yapılmadıysa /kapanis NOT VERIFIED'a "canlıda gözle doğrulanmadı" yazılır → /worktree-temizle. Bağımsız inceleme yok; /kapanis oturum sonunda toplu. |
| STANDART | R1-R2 ya da HAFİF'e girmeyen R0 | Tüm hat: ADIM 0-7 |
| SIKI | R3: auth, silme, migration, ödeme, hesaplama motoru | Tüm hat + merge'den önce kullanıcı onayı: PR linki, risk gerekçesi, inceleme puanı ve geri alma yolu verilir; kullanıcı "birleştir" demeden birleştirilmez |

## ÜRETİM HATTI

### ADIM 0 — RİSK SINIFLA (/risk)
- İşe başlamadan önce R0-R3 sınıflandır
- R2 ve üstü testsiz tamamlanamaz
- Sınıf işin kapsamını ve hangi dosyalara dokunulacağını belirler

### ADIM 1 — İZOLE ET (/new-feature)
- Yeni worktree aç: feature/<isim> (oturum bir dal belirlediyse o dalı kullan)
- Worktree uzak main'den dallanır, depo klasörünün dışına açılır
- Worktree açıldıysa ana kopyadaki dosyaya doğrudan dokunma
- İş merge edilince worktree ADIM 6'da kaldırılır

### ADIM 2 — İNŞA ET (/code-structure)
- Katmanlı mimariye göre yaz: sayfa → servis → repository
- Tekrar eden fonksiyon, ölü kod bırakma
- Senkron değişiklik varsa ve /senkron-denetle bu depoda gerçekten var olan dosyaları denetliyorsa çalıştır

### ADIM 3 — KANITLA (/prove-it)
- Testler geçer ve hiçbiri atlanmaz
- Görsel değişiklik: önce/sonra ekran görüntüsü
- Etkileşimli akış: kısa ekran videosu
- Görünmeyen değişiklik: ölçüm tablosu
- Yalnız belge/talimat değiştiyse: diff + test çıktısı; talimattaki her yeni/değişen komut geçici depoda çalıştırılır (yasak/canlıya dokunan komutlar hariç)

### ADIM 4 — GÖNDER (/ship-it)
- 0-2: ciddi hata → ADIM 2'ye dön
- 3-4: engelleyici bulgu var → ADIM 2'ye dön
- 5: engelleyici bulgu yok (production ready) → PR aç, birleştir, linki kullanıcıya ver (SIKI akışta önce kullanıcı onayı)
- Engelleyici olmayan bulgular puanı düşürmez, /kapanis'te OPEN'a yazılır
- Engelleyici: davranış hatası/regresyon, gereksinim eksiği, yasak dosya, yanlış iddia/komut, çelişki, sahte doğrulama, eksik test/kanıt, güvenlik, veri kaybı
- Sonraki turlarda aynı inceleyici önceki turdan bu yana tüm diff'e bakar
- Üç turda 5 alınamazsa dur, kullanıcıya neyin takıldığını söyle

### ADIM 5 — DOĞRULA (/deploy-kontrol)
- PR merge sonrası çalışır
- Vercel deploy gerçekten oldu mu kontrol et
- Gizli sekmede doğrula

### ADIM 6 — TEMİZLE (/worktree-temizle)
- Merge edilip canlıda doğrulanan işin worktree'si kaldırılır
- Ajan merge durumunu ve kaybolacak dosyaları denetler, kaldırma komutunu kullanıcıya verir; silmeyi kullanıcı yapar
- İzlenmeyen ya da değişmiş dosya varsa önce kullanıcıya sorulur

### ADIM 7 — KAPAT (/kapanis)
- Oturum sonu devir notu üret
- COMPLETED / TESTS / COMMIT / OPEN / NOT VERIFIED / NEXT
- NOT VERIFIED asla boş bırakma

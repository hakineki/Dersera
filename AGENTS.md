# YAZILIM FABRİKASI — İŞ AKIŞI BEYNİ
# Bu dosya SADECE iş akışını anlatır. Kod tabanı hakkında hiçbir şey yazma.
# Ajan repo'yu kendisi okuyarak öğrenir (bağlam penceresini harcamayalım).

## TEMEL KURALLAR
1. Asla main üzerinde çalışma. Her iş kendi worktree'sinde ya da oturumun belirlediği dalda başlar.
2. Her adımda ilgili skill çağrılır. Skill dışında serbest stil çalışma yok.
3. Ajan "yaptım" diyemez — kanıt üretmeden iş bitmez.
4. Merge'ü ajan yapar: testler geçtiyse PR'ı birleştirir, PR linkini kullanıcıya verir ve /deploy-kontrol'e geçer.
5. İnceleme yapan ajan, işi yapan ajanla FARKLI olmalı.

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
- 5: engelleyici bulgu yok (production ready) → PR aç, birleştir, linki kullanıcıya ver
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

# YAZILIM FABRİKASI — İŞ AKIŞI BEYNİ
# Bu dosya SADECE iş akışını anlatır. Kod tabanı hakkında hiçbir şey yazma.
# Ajan repo'yu kendisi okuyarak öğrenir (bağlam penceresini harcamayalım).

## TEMEL KURALLAR
1. Asla main üzerinde çalışma. Her iş kendi worktree'sinde başlar.
2. Her adımda ilgili skill çağrılır. Skill dışında serbest stil çalışma yok.
3. Ajan "yaptım" diyemez — kanıt üretmeden iş bitmez.
4. Merge işlemini asla ajan yapmasın; PR linkini kullanıcıya ver.
5. İnceleme yapan ajan, işi yapan ajanla FARKLI olmalı.

## ÜRETİM HATTI

### ADIM 0 — RİSK SINIFLA (/risk)
- İşe başlamadan önce R0-R3 sınıflandır
- R2 ve üstü testsiz tamamlanamaz
- Sınıf işin kapsamını ve hangi dosyalara dokunulacağını belirler

### ADIM 1 — İZOLE ET (/new-feature)
- Yeni worktree aç: feature/<isim>
- Worktree uzak main'den dallanır
- Ana kopyadaki dosyaya doğrudan dokunma
- İş merge edilince worktree ADIM 6'da kaldırılır

### ADIM 2 — İNŞA ET (/code-structure)
- Katmanlı mimariye göre yaz: sayfa → servis → repository
- Tekrar eden fonksiyon, ölü kod bırakma
- Senkron değişiklik varsa /senkron-denetle çalıştır

### ADIM 3 — KANITLA (/prove-it)
- Görsel değişiklik: önce/sonra ekran görüntüsü
- Etkileşimli akış: kısa ekran videosu
- Görünmeyen değişiklik: ölçüm tablosu

### ADIM 4 — GÖNDER (/ship-it)
- 0-2: ciddi hata → ADIM 2'ye dön
- 3-4: küçük eksik → ADIM 2'ye dön
- 5: production ready → PR aç, linki kullanıcıya ver

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
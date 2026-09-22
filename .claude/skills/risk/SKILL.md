---
description: Bir işi R0–R3 sınıflandırır ve gereken kapıyı söyler. Kod yazmadan önce.
---
İş: $ARGUMENTS
Sınıfı komplekslik değil değişikliğin TÜRÜ belirler:
- R0 yalnız CSS/renk/spacing/statik metin, state ve veriye dokunmuyor
- R1 etkileşim/davranış (click, modal, navigasyon, bileşen state'i)
- R2 sözleşme/veri sınırı: alan adı, şema, route anahtarı, beyaz liste, localStorage anahtarı, istemci↔sunucu sözleşmesi — OTOMATİK R2, düşürülemez
- R3 geri alınamaz/sistem: auth, silme, migration, ödeme, hesaplama motoru
Karma işte en yüksek risk geçerli. Çıktı: seviye + gerekçe + DOKUNULABİLİR/YASAK dosya listesi.
R2 ve üstü testsiz tamamlanamaz; testi geçirmek için gereksinim gevşetilemez.

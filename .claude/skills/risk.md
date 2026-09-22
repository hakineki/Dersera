---
description: Bir işi R0R3 sınıflandırır ve gereken kapıyı söyler. Kod yazmadan önce.
---
ş: $ARGUMENTS
Sınıfı komplekslik değil değişikliğin TÜRÜ belirler:
- R0 yalnız CSS/renk/spacing/statik metin, state ve veriye dokunmuyor
- R1 etkileşim/davranış (click, modal, navigasyon, bileşen state'i)
- R2 sözleşme/veri sınırı: alan adı, şema, route anahtarı, beyaz liste, localStorage anahtarı, istemcisunucu sözleşmesi  OTOMATK R2, düşürülemez
- R3 geri alınamaz/sistem: auth, silme, migration, ödeme, hesaplama motoru
Karma işte en yüksek risk geçerli. Çıktı: seviye + gerekçe + DOKUNULABLR/YASAK dosya listesi.
R2 ve üstü testsiz tamamlanmaz.

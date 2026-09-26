---
description: Bir işi R0–R3 sınıflandırır ve gereken kapıyı söyler. Kod yazmadan önce.
argument-hint: [iş tanımı]
---
İş: $ARGUMENTS
Sınıfı komplekslik değil değişikliğin TÜRÜ belirler:
- R0 yalnız CSS/renk/spacing/statik metin, state ve veriye dokunmuyor
- R1 etkileşim/davranış (click, modal, navigasyon, bileşen state'i)
- R2 sözleşme/veri sınırı: alan adı, şema, route anahtarı, beyaz liste, localStorage anahtarı, istemci↔sunucu sözleşmesi — OTOMATİK R2, düşürülemez
- R3 geri alınamaz/sistem: auth, silme, migration, ödeme, hesaplama motoru
Karma işte en yüksek risk geçerli. Çıktı: seviye + AKIŞ + gerekçe + DOKUNULABİLİR/YASAK dosya listesi.
AKIŞ (AGENTS.md "AKIŞ SEÇİMİ"; şüphedeysen bir üstü):
- HAFİF: R0 VE en fazla 3 dosya VE yalnız görünür metin/stil ya da README / belgede anlamı değiştirmeyen yazım-biçim düzeltmesi. Komut, betik, yapılandırma ya da kod mantığı içeriyorsa HAFİF değildir. Kabul ölçütü, kontrat ve hukuki metin (KVKK, gizlilik, şartlar — nerede durursa dursun) HAFİF değildir. AGENTS.md ve .claude/** (frontmatter dahil) değişikliği HİÇBİR ZAMAN HAFİF değildir.
- STANDART: R1-R2 ya da HAFİF'e girmeyen R0.
- SIKI: R3 — merge'den önce kullanıcı onayı şart.
R2 ve üstü testsiz tamamlanamaz; testi geçirmek için gereksinim gevşetilemez.

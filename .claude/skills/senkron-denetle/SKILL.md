---
description: İstemci ve sunucu senkron anahtar listelerinin eşleştiğini doğrular. Bir kayıt buluta çıkmıyorsa veya cihazlar arası taşınmıyorsa.
allowed-tools: Bash(grep *)
---
js/core/senkron.js içindeki KUMELER ile api/senkron.js içindeki ANAHTARLAR beyaz listesini çıkar, birebir karşılaştır.
- Sayı ve adlar eşit olmalı. Eksik her ad, o kümenin buluta hiç gitmediği demektir — istek yine 200 döndüğü için hata görünmez.
- Farklıysa eksikleri listele, api/senkron.js tarafına ekle, tekrar karşılaştır.
- Ayrıca: silme MEZAR TAŞI ile mi yapılıyor (silindi:true + taze damga). Kayıt fiziksel siliniyorsa UNION birleştirme onu bulut kopyasından geri diriltir.

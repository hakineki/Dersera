---
description: Yeni statik metin ailesi eklerken dört ayağı garanti eder; "statik metin gelmiyor", "kart boş" teşhisi için de kullanılır.
---
Aile: $ARGUMENTS
Zincir DÖRT ayaklıdır, biri eksikse kart sessizce yedeğe düşer:
1. js/data/statik-anahtarlar.js — anahtar tanımı
2. SLUG / _asciile eşlemesi
3. harita-parcalar.js STATIK listesi
4. Kartta data-stm yuvası
Zorunlu kurallar:
- Anahtar GÖRÜNEN ADDAN üretilmez; kararlı key alanından gelir, görünen ad ayrı data-ad alanında taşınır.
- Zemin çapası: statik metin gelse de ekranda kalan stm-zemin şart. stm-yedek bu işi görmez.
- Beşten fazla yuvası olan panelde doldurma TEMBEL olmalı; yalnız görünen yuva doldurulur.
- Sunucuda beyaz liste varsa yeni aile oraya da eklenir.
Bitince `npm test`.

---
description: İşin bittiğini kanıtlar. Değişiklik yazıldıktan sonra, /ship-it'ten önce.
---
İşin bittiğini İDDİA ETME, kanıtla. Kanıt türünü değişiklik belirler: 1. madde her zaman, 2-5 yalnız değişikliğe uyuyorsa. Yalnız belge/talimat dosyası değişen bir işte (.md, skill) ekran görüntüsü, video veya ölçüm üretme; ama testler talimatlara dokunmaz: talimattaki yeni ya da değişen her komut geçici bir depoda/worktree'de birebir çalıştırılır ve çıktısı kanıta eklenir. İstisna: talimatın yasakladığı ya da canlıya/uzak main'e dokunan komutlar (ör. `npx vercel --prod`, main'e push) çalıştırılmaz; push içeren komutlar geçici bir bare remote'a yapılır. Komut içermeyen düz metin değişikliğinde diff + test yeter. Kullanıcının gördüğü her değişiklik (CSS ve statik metin dahil) görsel sayılır.
1. Testler: `dersera-app/` içinde `npm test` (jest) — tüm suite'ler geçmeli, özette "skipped"/"todo" olmamalı. `node_modules` yoksa önce `npm ci`.
   - Yeni yazdığın test dosyasının adı jest çıktısında görünmeli. Görünmüyorsa hiç koşmamıştır (ör. `__tests__/helpers/` altına konmuş ya da adı eşleşmiyor).
2. Görsel değişiklik → önce/sonra ekran görüntüsü.
3. Etkileşimli akış → 10-30 sn ekran videosu.
4. Performans/veri değişikliği → ölçüm tablosu (önce/sonra yan yana).
5. Hata düzeltmede önce hatayı yeniden üret (önce), sonra düzeltmeyi göster (sonra). Üretilemeyen hata düzeltilmiş sayılmaz.
6. Kanıt üretirken hata bulursan: düzelt → yeniden kanıtla.
7. Kanıt yoksa iş bitmiş sayılmaz. Kanıtlanamayan kısım /kapanis'te NOT VERIFIED'a yazılır.

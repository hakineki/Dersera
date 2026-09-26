---
description: Bir değişikliğin gerçekten canlıya çıkıp çıkmadığını doğrular. PR birleştikten sonra; "canlıda görünmüyor", "deploy oldu mu" durumlarında.
allowed-tools: Bash(git *)
---
## Durum
- Dal: !`git branch --show-current`
- Son commit: !`git log --oneline -3`
- Çalışma kopyası: !`git status --short`

## Kontrol sırası (bu sırayı bozma)
1. Değişiklik main'de mi? `git fetch origin main && git log origin/main --oneline -5` — PR birleşmediyse canlıya hiçbir şey çıkmaz. (Worktree modunda main başka klasörde açık olduğu için `git checkout main` burada çalışmaz; gerek de yok.)
2. Vercel, main'in son commit'i için Ready mi? MAIN'deki commit'in durumunu sor:
   `curl -sS https://api.github.com/repos/hakineki/Dersera/commits/$(git rev-parse origin/main)/status`
   "Vercel" bağlamı success / "Deployment has completed" olmalı. Birleşmeden hemen sonra "pending" ya da boş gelir — 20-30 sn arayla birkaç kez yeniden sor; ~3 dk sonra hâlâ success değilse NOT VERIFIED'a yaz ve durumu olduğu gibi aktar. "failure" ya da "error" gelirse bekleme, hemen kullanıcıya bildir: canlıda eski sürüm duruyor. PR'ın durumuna (PR dalının commit'i) BAKMA — o önizleme dağıtımıdır, canlı değil. GitHub'da commit'in durması deploy edildiği anlamına GELMEZ.
3. Durum hiç gelmiyorsa ya da Vercel "Blocked" diyorsa commit yazarına bak: `git log -1 --format=%ae origin/main`. Vercel tanımadığı yazarın commit'ini sessizce engelleyebilir. GitHub'da birleştirilen PR'ın commit'i kullanıcının hesabıyla yazılır ve dağıtılır.
4. ?v= gerekmez: Next.js JS/CSS'i /_next/static altında her deploy'da yeni (hash'li) adlarla verir.
   Asıl önbellek riski public/sw.js: /game sayfasını önce ağdan ister ama 4 sn'de yanıt gelmezse önbellekteki ESKİ kopyayı açar; /_next/static dosyalarını önbellekten verir. sw.js'yi ya da önbellek adını (CACHE) değiştirdiysen eski istemcilerin nasıl güncelleneceğini düşün.
5. Doğrulama https://dersera.vercel.app üzerinde, GİZLİ SEKMEDE yapılır — gizli sekmede service worker ve önbellek yoktur. Normal sekmede eski /game görünüyorsa önce sw önbelleğinden şüphelen.
   Ajan siteye erişemiyorsa (bulut oturumunda vekil engelliyor) 5-6'yı kullanıcıya ne bakacağını söyleyerek devret; kullanıcı doğrulayana kadar /kapanis'te NOT VERIFIED'a yaz.
6. Değişen sayfayı/uç noktayı doğrudan adresinden aç ve değişikliği gör.
Elle `npx vercel --prod` ÇALIŞTIRMA — main'e push zaten Production'a çıkıyor, elle çalıştırmak doğru deploy'un üstüne yazar.

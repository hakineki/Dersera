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
4. Dokunulan JS/CSS'i çağıran sayfada ?v= yükseltildi mi.
5. Doğrulama GİZLİ SEKMEDE yapılır. HTML önbellekteyse ?v= etiketleri de bayattır.
   Ajan siteye erişemiyorsa (bulut oturumunda vekil engelliyor) 4-6'yı kullanıcıya ne bakacağını söyleyerek devret; kullanıcı doğrulayana kadar /kapanis'te NOT VERIFIED'a yaz.
6. Konsolsuz test: dosya adresini doğrudan aç.
Elle `npx vercel --prod` ÇALIŞTIRMA — main'e push zaten Production'a çıkıyor, elle çalıştırmak doğru deploy'un üstüne yazar.

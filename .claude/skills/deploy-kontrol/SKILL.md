---
description: Bir değişikliğin gerçekten canlıya çıkıp çıkmadığını doğrular. "canlıda görünmüyor", "deploy oldu mu" durumlarında.
allowed-tools: Bash(git *)
disable-model-invocation: true
---
## Durum
- Dal: !`git branch --show-current`
- Son commit: !`git log --oneline -3`
- Çalışma kopyası: !`git status --short`

## Kontrol sırası (bu sırayı bozma)
1. Dal main mi? Değilse `git checkout main && git pull`.
2. Son commit'in yazarı claude@modulor.local mi? Değilse Vercel deploy'u Blocked yapar, hata SESSİZDİR.
3. Vercel Deployments'ta son commit Ready mi Blocked mı — GitHub'da commit'in durması deploy edildiği anlamına GELMEZ.
4. Dokunulan JS/CSS'i çağıran sayfada ?v= yükseltildi mi.
5. Doğrulama GİZLİ SEKMEDE yapılır. HTML önbellekteyse ?v= etiketleri de bayattır.
6. Konsolsuz test: dosya adresini doğrudan aç.
Elle `npx vercel --prod` ÇALIŞTIRMA — main'e push zaten Production'a çıkıyor, elle çalıştırmak doğru deploy'un üstüne yazar.

---
description: Bağımsız inceleme ve gönderim kapısı. /prove-it'ten sonra, PR açmadan önce.
---
1. İnceleme iste: işi yapan ajana değil, BAŞKA birine incelet — Agent aracıyla ayrı bir alt ajan. /code-review kullanılacaksa onu da o alt ajan çalıştırır; yazan ajanın kendi bağlamında çalıştırılan inceleme sayılmaz. Yazan ajan kendi işine puan vermez. İnceleyene /risk sınıfını, /prove-it kanıtlarını ve incelenecek commit SHA'sını ver.
2. İnceleyen her bulguyu işaretler:
   - ENGELLEYİCİ: hatalı davranış veya regresyon; gereksinimi karşılamama; /risk'in YASAK listesindeki dosyaya dokunma; koda ya da ortama dair yanlış iddia; yanlış ya da tehlikeli komut; kurallar/dosyalar arası çelişki; sahte doğrulamaya yol açan adım; eksik test veya kanıt; güvenlik; veri kaybı riski.
   - ENGELLEYİCİ DEĞİL: davranışı değiştirmeyen iyileştirme, üslup, kapsam dışı öneri.
   Emin değilse ENGELLEYİCİ sayar.
3. Puan 0-5: 0-2 ciddi hata, 3-4 engelleyici bulgu var, 5 = engelleyici bulgu yok. Engelleyici olmayan bulgular puanı düşürmez; /kapanis'te OPEN'a yazılır.
4. Puan < 5 ise /code-structure'a geri dön, düzelt, /prove-it ile yeniden kanıtla, yeniden incelet. Yeni turda:
   - AYNI inceleyiciyle devam et (SendMessage) — depoyu baştan okumasın. Ulaşılamıyorsa yeni alt ajan aç ve önceki bulgu listesini ona ver.
   - İnceleme kapsamı önceki turdan bu yana TÜM diff'tir: `git diff <önceki-tur-sha>..<incelenecek-sha>` — iki SHA'yı da yazan ajan verir. `HEAD` kullanma: inceleyici ana kopyada başlayabilir, worktree modunda oradaki HEAD yazanın dalı değildir. Yalnız bulgulara bağlı satırlara bakılmaz; önceki bulgular yeniden açılmışsa söylenir.
   Üç turda 5 alınamazsa dur ve kullanıcıya neyin takıldığını söyle.
5. Puan = 5 ve testler geçtiyse (atlanan yok) PR aç, birleştir, linki kullanıcıya ver.
6. Ardından /deploy-kontrol; canlıda doğrulandıktan sonra worktree'yi /worktree-temizle kaldırır (silmeyi kullanıcı yapar).

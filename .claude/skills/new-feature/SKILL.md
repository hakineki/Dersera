---
description: Yeni bir iş için izole çalışma alanı açar. Kod yazmaya başlamadan, /risk'ten hemen sonra.
argument-hint: [iş tanımı]
---
İş: $ARGUMENTS
İşten kısa bir <slug> türet (küçük harf, tire, Türkçe karaktersiz: ör. ogretmen-oyun-hesabi).
1. Önce dur ve bak — hiçbir şeyi sıfırlamadan:
   - `git status --short` boş değilse önce ne olduğunu anla; silme, gerekiyorsa stash'le.
   - `git fetch origin main && git log --oneline origin/main..HEAD`: dalda main'de olmayan commit varsa PR'ı birleşmiş mi kontrol et. Birleşmemişse dalı SIFIRLAMA, `git rebase origin/main` ile taşı.
2. Oturum bir dal belirlediyse (ör. `claude/...`) o dalda çalış, worktree açma. Dal yalnız birleşmiş geçmiş taşıyorsa main'den yeniden kur:
   `git checkout -B <dal> --no-track origin/main`
3. Belirlemediyse deponun DIŞINDA worktree aç (ör. C:/Projects/Dersera-<slug>):
   `git worktree add --no-track -b feature/<slug> "$(git rev-parse --show-toplevel)/../$(basename "$(git rev-parse --show-toplevel)")-<slug>" origin/main`
   Sonra o worktree'nin `dersera-app/` klasöründe `npm ci` — bağımlılık yoksa testler çalışmaz.
4. Push her zaman açık hedefle: `git push -u origin HEAD`. Düz `git push` veya `HEAD:main` kullanma.
   Rebase ya da `-B` ile yeniden kurulmuş bir dal reddedilirse: önce uzak dalda yerelde karşılığı olmayan commit olmadığını gör (`git fetch origin <dal> && git log --cherry-pick --right-only --oneline HEAD...origin/<dal>` boş olmalı ya da listelenen commit'lerin PR'ı birleşmiş olmalı), sonra `git push --force-with-lease -u origin HEAD`. Koşul sağlanmıyorsa (ör. çatışma çözülen rebase commit'in karşılığını değiştirdi ve PR birleşmedi) DUR: listeyi kullanıcıya göster, zorla push yapma. Düz `--force` kullanma; main'e hiçbir koşulda zorla push yok.
5. Tüm çalışma bu dalda/worktree'de yapılır; main'e doğrudan yazılmaz. Merge /ship-it'te (HAFİF akışta /prove-it'ten sonra) yapılır; worktree /worktree-temizle ile kaldırılır.

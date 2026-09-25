---
description: Main'e merge edilmiş işlerin worktree'lerini bulur, kaldırmaya engel bir şey olup olmadığını denetler ve kaldırma komutunu hazırlar. PR merge edilip canlı doğrulandıktan sonra; "disk doldu", "worktree temizle" dendiğinde.
allowed-tools: Bash(git *)
---
## Durum
- Worktree'ler: !`git worktree list`

## Neden
Her iş kendi worktree'sinde yapılır; her birinde ayrı `node_modules` (~0,5–0,7 GB) ve `next dev` önbelleği `.next` (~0,1–0,7 GB) birikir. Merge edilen iş kaldırılmazsa diskte onlarca GB kalır. Dal GitHub'da durur, kaldırmakla iş kaybolmaz.

## Adımlar (sırayı bozma)
1. `git fetch origin` — merge durumu uzak main'e göre ölçülür.
2. Her worktree için denetle; ana kopya ve bu oturumun çalıştığı worktree hariç:
   - Merge edildi mi: `git merge-base --is-ancestor <worktree HEAD> origin/main`. Değilse DOKUNMA — iş bitmemiş ya da PR açık.
   - Kaybolacak dosya var mı: `git -C <yol> status --porcelain`. `.claude/launch.json` ve `next dev`'in yeniden yazdığı `dersera-app/AGENTS.md` sayılmaz. Başka izlenmeyen ya da değişmiş dosya varsa listele; kullanıcı saklayana ya da "gerek yok" diyene kadar o worktree'yi komuta KOYMA.
   - O klasörden çalışan geliştirme sunucusu varsa önce durdurulur; kilitli dosya kaldırmayı yarıda bırakır.
3. Kullanıcıya tablo ver: klasör · dal · merge durumu · kaybolacak dosyalar. Boyutu yalnız istenirse ölç; `du` klasör başına dakikalar sürebilir.
4. Kaldırma komutunu hazırla ve KULLANICIYA VER. Ajan silmez; dosya silmek ajana kapalıdır.
   ```bash
   git worktree remove --force <yol>
   git worktree prune
   ```
   `--force` yalnız 2. adımda temiz çıkan worktree'ler için: `launch.json` ve `AGENTS.md` yüzünden düz `remove` reddeder.
5. Kullanıcı çalıştırdıktan sonra `git worktree list` ile doğrula; kalanları nedeniyle birlikte söyle.

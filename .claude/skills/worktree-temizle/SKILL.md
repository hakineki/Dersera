---
description: Main'e merge edilmiş işlerin worktree'lerini bulur, kaldırmaya engel bir şey olup olmadığını denetler ve kaldırma komutunu hazırlar. PR merge edilip canlıda doğrulandıktan sonra; "disk doldu", "yer aç", "worktree temizle" dendiğinde.
allowed-tools: Bash(git *)
---
## Durum
- Worktree'ler: !`git worktree list`

## Neden
Her iş kendi worktree'sinde yapılır; her birinde ayrı `node_modules` (~0,5–0,7 GB) ve `next dev` önbelleği `.next` (~0,1–0,7 GB) birikir. Merge edilen iş kaldırılmazsa diskte onlarca GB kalır. `git worktree remove` dalı silmez; merge edilmiş commit'ler main'de durur.

## Adımlar (sırayı bozma)
1. `git fetch origin`: merge durumu uzak main'e göre ölçülür.
2. Her worktree'yi sınıfla. Ana kopya hariç; bu oturumun worktree'si için 6. adıma bak.
   - **AÇIK:** `git merge-base --is-ancestor <HEAD> origin/main` yanlış, ya da `git -C <yol> log origin/main..HEAD` boş değil. DOKUNMA; iş bitmemiş, PR açık ya da gönderilmemiş commit var.
   - **YENİ/BOŞ:** `git rev-list --first-parent origin/main | grep -qx <HEAD>` doğru. Dalın kendi commit'i yok; worktree main'den yeni açılmış olabilir ve başka bir oturum içinde çalışıyor olabilir. Son etkinliği yaz (`git -C <yol> reflog -1 --date=iso`) ve kullanıcıya sor.
   - **KAYIP RİSKİ:** Kaybolacak dosya varsa. İki yere bak:
     - `git -C <yol> status --porcelain`
     - `git -C <yol> status --porcelain --ignored` içinden `node_modules/`, `.next/`, `next-env.d.ts`, `*.tsbuildinfo` çıktıktan sonra kalanlar (ör. `.env*`, `.vercel`). Bunlar ignore edildiği için `remove` onları uyarmadan siler.

     Şunlar kayıp sayılmaz:
     - `.claude/launch.json`
     - `dersera-app/AGENTS.md`: yalnız `next dev`'in yazdığı `nextjs-agent-rules` bloğu değiştiyse.
     - `dersera-app/CLAUDE.md`: içeriği yalnız `@AGENTS.md` satırıysa.

     Başka dosya varsa listele; kullanıcı saklayana ya da "gerek yok" diyene kadar komuta KOYMA.
   - **KALDIRILABİLİR:** Merge edilmiş, yeni/boş değil, kaybolacak dosyası yok.
3. Kullanıcıya tablo ver: klasör · dal · sınıf · kaybolacak dosyalar. Boyutu yalnız istenirse ölç; `du` klasör başına dakikalar sürebilir.
4. KALDIRILABİLİR olanlar için komutu hazırla ve KULLANICIYA VER. Ajan silmez; dosya silmek ajana kapalıdır.
   - Her satır çalışma anında yeniden denetler; tablodan sonra biri dosya değiştirdiyse o satır atlanır:
     ```bash
     p="<yol>"; git -C "$p" merge-base --is-ancestor HEAD origin/main && [ -z "$(git -C "$p" status --porcelain)" ] && git worktree remove "$p" && echo "kaldırıldı: $p" || echo "ATLANDI: $p"
     ```
   - Sonuna `git worktree prune` ekle.
   - `--force` KULLANMA. Yalnız kirli girdileri yukarıdaki muaf dosyalardan ibaret bir worktree için, o satırda ve nedenini yazarak kullan.
   - Kullanıcıya şunu söyle: çalıştırmadan önce o klasörlerdeki geliştirme sunucularını durdur ve editörleri kapat. Kilitli dosya kaldırmayı yarıda bırakır.
5. Kullanıcı çalıştırdıktan sonra doğrula:
   - `git worktree list`
   - Worktree klasörlerinin bulunduğu dizinde (ör. `ls -d C:/Projects/Dersera-*`) yarım silinmiş klasör kalmış mı? Git kaydı silinip klasör kalabilir.
   - Kalanları nedeniyle birlikte söyle.
6. Bu oturumun worktree'si oturum sürerken kaldırılamaz. Merge edildiyse onun satırını ayrıca ver ve oturum kapandıktan sonra çalıştırılmasını söyle.

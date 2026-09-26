---
description: Oturum sonu devir notu üretir. İş bitince, /worktree-temizle'den sonra; "bitirelim", "devir notu" dendiğinde.
allowed-tools: Bash(git *)
---
Bu oturum: !`git log --oneline -20`
Kalan: !`git status --short`
Worktree'ler: !`git worktree list`
Altı başlık, bu sırayla, boşsa "yok" yaz:
COMPLETED / TESTS (sayı ver) / COMMIT (hash) / OPEN / NOT VERIFIED / NEXT
NOT VERIFIED'ı asla boş bırakma — doğrulanmamış işi bitmiş gibi yazmak bu depoda tekrar eden en pahalı hata.
OPEN'a merge edilmiş ama henüz kaldırılmamış worktree'leri de yaz (/worktree-temizle).

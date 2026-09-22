---
description: Oturum sonu devir notu üretir. "bitirelim", "devir notu" dendiğinde.
allowed-tools: Bash(git *)
disable-model-invocation: true
---
Bu oturum: !`git log --oneline -20`
Kalan: !`git status --short`
Altı başlık, bu sırayla, boşsa "yok" yaz:
COMPLETED / TESTS (sayı ver) / COMMIT (hash) / OPEN / NOT VERIFIED / NEXT
NOT VERIFIED'ı asla boş bırakma — doğrulanmamış işi bitmiş gibi yazmak bu depoda tekrar eden en pahalı hata.

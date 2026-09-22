# /new-feature Skill
Kullanıcı yeni bir özellik istediğinde:
1. `git worktree add feature/<slug> -b feature/<slug>` ile izole dal aç (uzak main'den)
2. Tüm çalışmayı bu worktree içinde yap
3. Ana kopyaya yazmayı engelle; dışarı yönlendiren komutları reddet
4. ş bitince değişiklikleri worktree'de bırak, merge YAPMA

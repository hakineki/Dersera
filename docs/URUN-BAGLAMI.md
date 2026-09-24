# DERSERA — MASTER PRODUCT / ARCHITECTURE CONTEXT

Version: 2026-09-24

Bu dosya bundan sonraki Dersera geliştirmeleri için ana ürün bağlamıdır.

**ÖNEMLİ:**
Mevcut çalışan sistemi yeniden yazma.
Paralel sistem oluşturma.
Önce repository'yi incele.
Mevcut schema, auth, publishing, Composer, Community, Feedback ve Player yapılarını mümkün olduğunca reuse et.

## 1. Ürün tanımı

Dersera:

Öğretmenin birkaç temel seçimle müfredata veya kendi içeriğine dayalı
eğitsel maceralar oluşturabildiği,
öğrencilerin bu oyunları dijital veya ileride fiziksel ortamlarda oynadığı,
gerçek kullanım verileriyle kaliteli içerikleri ayırt eden
bir öğrenme deneyimi platformudur.

Core loop:

Teacher Input
→ Composer
→ Content Governance
→ Player
→ Learning Data
→ Feedback
→ Community
→ Quality Signals
→ Composer Learning Loop

## 2. V1 / V2 / V3 ayrımı

**V1 = CORE BETA / PILOT**

Amaç:
- çalışan Composer
- güvenli oyun üretimi
- version/update
- credit economy
- community
- learning analytics
- gerçek pilot

**V2 = PLATFORM**

Amaç:
- tam K12 yaş profilleri
- private source / PDF
- gelişmiş Learning Engine
- Community Library 2.0
- visual enrichment
- school/organization layer
- moderation/review queue
- Composer Learning Loop

**V3 = MULTI-EXPERIENCE / ECOSYSTEM**

Gelecek vizyonu:
- Play Lab
- VR partner integrations
- Adventure Park integrations
- Learning Map
- research network
- accessibility expansion
- possible creator/partner economy

V3 özelliklerini şu an IMPLEMENT ETME.

## 3. AI model kararı

Şimdilik ayrı model router / engine oluşturma.

Mevcut fiyat/performans testlerinde Luna 6 tercih edildi.

Production code'u gereksiz yere provider-routing sistemiyle karmaşıklaştırma.

Ancak AI çağrılarını tek service boundary arkasında tut ki ileride
Agent Fabric veya başka provider eklenebilsin.

Deterministik işler AI kullanmamalı:

- Player state
- routing rules
- credit calculations
- version control
- ledger
- structural validation
- authorization

## 4. Teacher UX

Teacher desktop UI teknolojiye uzak kullanıcılar için tasarlanıyor.

Ana prensip:
çok sade, statik, belge benzeri, açıklayıcı.

Composer üç ana bölüm:

1. Ders ve Konuyu Seç
   - sınıf
   - ders/dersler
   - her ders için konu
2. Oyunun Tarzını Seç
   - 20 / 40 / 60 dk
   - Macera / Dengeli / Ders Ağırlıklı
   - Tek Sınıf / Okul Macerası
   - isteğe bağlı Ön Not
3. Kontrol Et ve Oluştur
   - özet
   - kredi maliyeti
   - güvenlik bilgisi
   - Oyunu Oluştur

6 ayrı wizard ekranı oluşturma.

Masaüstünde tek sayfa / progressive form tercih et.

## 5. Student UX

Teacher UI ve Student UI aynı tasarım dili olmak zorunda değil.

Student UI yaş profiline göre değişir.

AGE PROFILES:

- PRESCHOOL_3_5
- PRIMARY_6_10
- MIDDLE_11_14
- HIGH_15_18

PRESCHOOL:
gör → dinle → dokun,
minimum text,
large targets,
audio-first,
no ranking pressure

PRIMARY:
visual exploration,
short text,
matching / drag drop,
simple inventory

MIDDLE:
mission / adventure,
branching,
evidence,
puzzles

HIGH:
research / decision / synthesis,
more mature atmospheric UI,
no childish mascot dependency

## 6. Credit economy

Game compose:

- 20 min = 2 credits
- 40 min = 3 credits
- 60 min = 4 credits

Real game update = 1 credit

Student gameplay = 0 AI credits

Publish / republish / manual edit / preview / QR use = 0

Default monthly allowance:
30 monthly credits

Earned credits:
community contribution üzerinden ayrıca tutulur.

Current economic purpose:

teacher contribution
→ credits
→ future subscription cost reduction / free usage

DO NOT implement cash payout.

## 7. Game versioning

Every game:

- gameId
- gameLineageId
- version

Duplicate gameId cannot be uploaded as a new game.

Creator may UPDATE.

<=30% meaningful change:
same gameId + new version

\>30%:
new variant/fork

Structural identity changes may force fork even below 30%.

Update costs 1 credit.

Active student session finishes on the version it started with.

## 8. Community

Flow:

Teacher uses game
→ Quality Eligible
→ Submit to Community
→ 2 independent teacher reviews
→ Community Library

Creator cannot review own game.

Two reviewers must be different accounts.

Community acceptance:
earned credit may be granted according to configured reward policy.

Reward policy must be config-driven.
Do not scatter hard-coded reward amounts.

## 9. Content governance

ALL Composer outputs,
updates,
future imports,
future private-source games,
community submissions

must pass:

1. Schema Gate
2. Source / Curriculum Gate
3. Game Logic Gate
4. Learning Quality Gate
5. Game Quality Gate
6. Child-Safe Content Gate
7. Similarity / Duplicate Gate
8. Economy / Abuse Gate

Result:

PASS / REVIEW / BLOCK

Production publish may not bypass governance.

## 10. Child-safe content

Mandatory K12 gate.

Check:

- profanity
- abusive language
- sexual / obscene content
- age-inappropriate romantic/sexual framing
- excessive violence
- disturbing/horror intensity
- drugs/alcohol/tobacco promotion
- gambling
- hate/discrimination
- bullying/humiliation
- self-harm
- dangerous physical challenges
- illegal behavior encouragement
- personal-data collection
- inappropriate adult-child interaction

Context matters.

Scientific reproduction in biology must not automatically fail.
Historical war content must not automatically fail.

## 11. Composer safety UX

Composer loading UI must visibly show:

- Müfredat hazırlanıyor
- Hikâye kurgulanıyor
- Görevler oluşturuluyor
- Oyun akışı kontrol ediliyor
- Yaşa uygunluk ve çocuk güvenliği kontrol ediliyor
- Son kalite kontrolü yapılıyor

Preview:

- Müfredat Uyumu
- Oyun Mantığı
- Öğrenme Kalitesi
- Çocuk Güvenliği
- Yayına Uygunluk

## 12. Community visual enrichment

Do NOT create a separate "visual game" product.

There is ONE game.

Visual enrichment is a presentation layer.

When teacher submits to Community:

single checkbox:

"Bu oyun için otomatik görsel zenginleştirmeyi onaylıyorum."

If false:
no automatic visual enrichment.

If true:
game tracks visualProgress.

visualProgress:
0 / 4, 1 / 4, 2 / 4, 3 / 4, 4 / 4

Each step reflects genuine community success / usage.

At 4/4:

game automatically enters Visual Enrichment Queue.

Teacher does NOT manually select:
cover, hero, final, etc.

System decides and creates the standard enrichment package.

This is ASYNC.

Game remains usable while images are pending.

Visual production may never block core gameplay or publishing.

Core AI work has priority over visual enrichment.

## 13. Visual enrichment safety

Generated visuals must pass:

- age-profile suitability
- theme consistency
- child-safe visual validation
- quality validation

before asset attachment.

Bad visual output must not affect game availability.

## 14. Composer learning loop

Composer may later learn from:

- Teacher Quality
- Student Experience
- Completion
- Drop-off
- Hint usage
- Learning Goal performance
- Qualified Adoption
- Repeat Usage
- Game recipe
- Task mix
- Branch structure
- Duration
- Age profile

Student liking alone is NOT the optimization target.

Use combined:
Teacher Quality
\+
Student Experience
\+
System/Learning Performance

Do not implement autonomous production prompt self-modification.

Recommendation first.
Human-controlled prompt/recipe changes.

## 15. Future vision — do not build now

Keep architecture extensible for:

- Dersera Play Lab
- Dersera VR
- Dersera Adventure
- Learning Map
- Research Network
- Accessibility variants

Possible future creator/partner monetary model is only a FUTURE VISION.

No monetary earning promise in current product.

## 16. Product principle

Dersera must NOT become a generic LMS.

Do not add generic:
calendar, attendance, video meeting, general document storage, etc.

Core identity:

"Learning content becomes an experience,
and the system learns from how that experience performs."

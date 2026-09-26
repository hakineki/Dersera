---
description: Kod yazarken uyulacak yapı kuralları. Bir değişikliği uygularken veya bir hatayı düzeltirken.
---
1. Önce repo yapısını oku — mevcut mimariyi tahmin etme, gör.
2. Katmanlı yapıya sadık kal: sayfa → servis → repository. Yeni katman icat etme, olanı yeniden düzenlemeye girişme.
3. Bir hata olduğunda hangi katmanda olduğunu konumlandır ve oradan düzelt; belirtiyi başka katmanda yamama.
4. Tekrar eden fonksiyon yazma; var olanı kullan.
5. Ölü kod bırakma; silmekten çekinme.
6. Senkron (istemci↔sunucu) değişikliği varsa ve /senkron-denetle bu depoda gerçekten var olan dosyaları denetliyorsa çalıştır.

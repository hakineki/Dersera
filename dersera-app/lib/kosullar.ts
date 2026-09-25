// Kullanım koşulları (kayıtta onaylanır; onay, sürümüyle birlikte lib/denetimKaydi.ts'te tutulur). Metin değişince
// sürüm artırılır. İstemci de okur: ağır modül içe aktarmamalı.

export const KOSUL_SURUMU = "2026-09";

export const KOSUL_BOLUMLERI: { baslik: string; metin: string }[] = [
  {
    baslik: "Hesap",
    metin: "Öğretmen hesabı kişiseldir. Şifreni kimseyle paylaşma; hesabınla yapılan işlemlerden sen sorumlusun.",
  },
  {
    baslik: "İçeriğin gizliliği",
    metin:
      "Dersera'da oluşturduğun ya da topluluk ve okul kütüphanesinden açtığın oyunlar, sorular ve cevaplar yalnız ders amacıyla, kendi sınıflarında kullanılır. Bu içerik platform dışında (sosyal medya, web siteleri, basılı ya da dijital yayınlar, ticari materyaller) paylaşılamaz, çoğaltılamaz ve satılamaz.",
  },
  {
    baslik: "Toplu kopyalama",
    metin: "Topluluk kütüphanesinden otomatik ya da toplu indirme yapılamaz. Başka öğretmenlere ait oyunların açılması kayıt altına alınır ve günlük sınırla sınırlıdır.",
  },
  {
    baslik: "Öğrenci verisi",
    metin:
      "Öğrencilerden ad-soyad gibi kişisel bilgi istenmez; öğrenciler takma adla oynar. Kaynak olarak eklediğin metinlerden öğrencilere ait kişisel bilgileri çıkarmak senin sorumluluğundadır.",
  },
  {
    baslik: "Uygun kullanım",
    metin: "Çocuklara uygun olmayan içerik üretmek, içerik denetimlerini aşmaya çalışmak ya da platformu başkalarına zarar verecek biçimde kullanmak yasaktır.",
  },
  {
    baslik: "İhlal",
    metin: "Bu koşulların ihlalinde hesap askıya alınabilir ya da kapatılabilir; gerektiğinde yasal yollara başvurulabilir.",
  },
  {
    baslik: "Değişiklikler",
    metin: "Koşullar güncellenebilir; önemli değişiklikler öğretmenlere bildirilir.",
  },
];

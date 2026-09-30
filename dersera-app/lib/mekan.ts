// Okul mekânları ve konum bilmeceleri: oyunda bir sonraki durağın QR kodu mekânın belirli bir noktasına yapıştırılır;
// oyuncu o noktayı bilmeceyle bulur. Takılırsa önce 1. ipucu (daha açık), sonra 2. ipucu (noktayı adıyla söyler) açılır.
// Banka hazır metindir; rehber (yapay zekâ) uygun bilmeceyi seçer, gerekirse sınıf düzeyine göre soruya çevirir, ama
// gösterdiği nokta değişmez. Öğretmen düzenlerken mekânın diğer bilmecelerinden birini seçebilir.
// İstemci de okur: ağır modül içe aktarmamalı.

export interface Mekan {
  id: string;
  ad: string;
  emoji: string;
  // Öğretmenin mekânı kendi okuluna göre yazması için örnek (ör. Sınıf → "10-A sınıfı").
  ayrintiOrnegi?: string;
}

export interface KonumBilmecesi {
  // "<mekan id>-<sıra>" (ör. "kutuphane-3").
  id: string;
  mekanId: string;
  // QR'ın yapıştırılacağı nokta; öğretmenin yerleşim listesinde ve oyuncunun doğru cevabında görünür.
  nokta: string;
  bilmece: string;
  ipucu1: string;
  ipucu2: string;
}

export const MEKAN_SINIRLARI = {
  enAzBilmece: 10,
  noktaEnCok: 60,
  bilmeceEnCok: 320,
  ipucuEnCok: 180,
} as const;

import type { KonumBilmecesi, Mekan } from "@/lib/mekan";
import { KONUM_BILMECELERI } from "./konumBilmeceleri";

// Okulda bulunabilecek mekânlar (öğretmenin rota seçimindeki liste). Sıra, listede görünen sıradır.
export const MEKANLAR: Mekan[] = [
  { id: "sinif", ad: "Sınıf", emoji: "🏫", ayrintiOrnegi: "10-A sınıfı" },
  { id: "kutuphane", ad: "Kütüphane", emoji: "📚" },
  { id: "bahce", ad: "Bahçe", emoji: "🌳" },
  { id: "spor-salonu", ad: "Spor salonu", emoji: "🏀" },
  { id: "kantin", ad: "Kantin", emoji: "🥪" },
  { id: "yemekhane", ad: "Yemekhane", emoji: "🍽️" },
  { id: "fen-laboratuvari", ad: "Fen laboratuvarı", emoji: "🔬", ayrintiOrnegi: "Kimya laboratuvarı" },
  { id: "bilisim-sinifi", ad: "Bilişim sınıfı", emoji: "💻" },
  { id: "muzik-sinifi", ad: "Müzik sınıfı", emoji: "🎵" },
  { id: "resim-atolyesi", ad: "Resim atölyesi", emoji: "🎨" },
  { id: "konferans-salonu", ad: "Konferans salonu", emoji: "🎤" },
  { id: "giris-holu", ad: "Giriş holü", emoji: "🚪" },
  { id: "koridor", ad: "Koridor", emoji: "🚶", ayrintiOrnegi: "2. kat koridoru" },
  { id: "merdivenler", ad: "Merdivenler", emoji: "🪜" },
  { id: "rehberlik-servisi", ad: "Rehberlik servisi önü", emoji: "🧭" },
  { id: "idare-onu", ad: "İdare odaları önü", emoji: "🗂️", ayrintiOrnegi: "Müdür yardımcısı odası önü" },
  { id: "ogretmenler-odasi", ad: "Öğretmenler odası önü", emoji: "☕" },
  { id: "toren-alani", ad: "Tören alanı", emoji: "🇹🇷" },
  { id: "duyuru-panosu", ad: "Duyuru panosu", emoji: "📌" },
  { id: "okul-kapisi", ad: "Okul kapısı", emoji: "🔑" },
];

export const BILMECELER: KonumBilmecesi[] = KONUM_BILMECELERI;

export const mekanOf = (id: string): Mekan | null => MEKANLAR.find((m) => m.id === id) ?? null;
export const mekanBilmeceleri = (mekanId: string): KonumBilmecesi[] => BILMECELER.filter((b) => b.mekanId === mekanId);
export const bilmeceOf = (id: string): KonumBilmecesi | null => BILMECELER.find((b) => b.id === id) ?? null;

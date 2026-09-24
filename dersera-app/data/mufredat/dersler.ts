// Program sınıfları ve dersleri: müfredat verisi (JSON) içermeyen hafif modül. İstemci paketine girebilecek
// modüller (ör. lib/games.ts) buradan okur; ünite ve öğrenme çıktıları programlar.ts'te, yalnız sunucuda kalır.

export const SINIFLAR = [5, 6, 7, 8, 9, 10, 11, 12] as const;
export type Sinif = (typeof SINIFLAR)[number];

export const PROGRAM_DERSLERI = [
  "matematik",
  "fizik",
  "kimya",
  "turk-dili",
  "biyoloji",
  "tarih",
  "cografya",
  "felsefe",
  "din-kulturu",
  "fen-bilimleri",
  "turkce",
  "sosyal-bilgiler",
  "inkilap-tarihi",
] as const;
export type ProgramDersi = (typeof PROGRAM_DERSLERI)[number];

export const PROGRAM_DERS_ADI: Record<ProgramDersi, string> = {
  matematik: "Matematik",
  fizik: "Fizik",
  kimya: "Kimya",
  "turk-dili": "Türk Dili ve Edebiyatı",
  biyoloji: "Biyoloji",
  tarih: "Tarih",
  cografya: "Coğrafya",
  felsefe: "Felsefe",
  "din-kulturu": "Din Kültürü",
  "fen-bilimleri": "Fen Bilimleri",
  turkce: "Türkçe",
  "sosyal-bilgiler": "Sosyal Bilgiler",
  "inkilap-tarihi": "T.C. İnkılap Tarihi ve Atatürkçülük",
};

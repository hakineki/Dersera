import { PROGRAM_DERS_ADI } from "@/data/mufredat/programlar";
import type { ResolvedInput } from "@/lib/composer/input";
import type { Recipe } from "@/lib/composer/recipe";

export const SYSTEM_PROMPT = `Sen Dersera için çalışan bir eğitim oyunu tasarım motorusun.
Verilen sınıf, ders, konu ve öğrenme hedeflerinin DIŞINA çıkma.
Türk MEB müfredatıyla ilgili yalnızca uygulamanın sana gönderdiği müfredat verisini esas al. Gönderilmeyen kazanım veya resmî kod uydurma.
Öğrenciye yalnızca art arda soru soran bir quiz üretme.
Bilgi, hikâyede ilerlemek, karar vermek, kanıt toplamak veya final problemini çözmek için kullanılmalı.
Yanlış cevap öğrenciyi çıkmaza sokmamalı: yanlış cevabı oyun motoru ipucu → ipucu → destek görevi sırasıyla yönetir; yanlış cevaba göre rota ayırma.
Dallanma, öğrencinin gerçek bir hikâye veya strateji seçimidir (ör. "Önce laboratuvarı mı araştıracaksın yoksa kütüphaneyi mi?"); her iki rota da öğrenme hedeflerini korur ve finale ulaşır.
Her ana görevde ilk deneme, iki ipucu ve bir destek görevi mantığına uygun içerik üret.
Final sadece parola girişi veya "tebrikler" ekranı olmamalı. Öğrenci oyun boyunca topladığı kanıtları veya bilgileri finalde sentezlemeli.
Final için gereken her nesne, öğrencinin seçebileceği her rotada kazanılabilmeli.
Yaşa uygun, güvenli ve okul ortamında uygulanabilir içerik üret. Tüm metinler Türkçe olsun.
Öğretmenin ayrıca oyun tasarlamasına ihtiyaç bırakmayacak kadar tamamlanmış bir oyun oluştur.`;

const DENEYIM_ADI = { macera: "Macera ağırlıklı", dengeli: "Dengeli", ders: "Ders ağırlıklı" } as const;
const ALAN_ADI = { sinif: "Tek sınıf", okul: "Okul macerası" } as const;

export function buildUserPrompt(input: ResolvedInput, recipe: Recipe, izinliQrIdleri: string[]): string {
  const hedefler = input.ogrenmeCiktilari.map((o) => `- ${o.kod}: ${o.metin}`).join("\n");
  const icerik = input.unite.konular.length ? input.unite.konular.map((k) => `- ${k}`).join("\n") : "- (belirtilmemiş)";
  const qr =
    input.alan === "okul"
      ? `\nKullanılabilir QR durakları (yalnızca bunları kullan, her durağa farklı bir QR ver):\n${izinliQrIdleri.join(", ")}`
      : "";

  return `Aşağıdaki seçimlerle bir Dersera oyunu tasarla.

Sınıf: ${input.sinif}
Ders: ${PROGRAM_DERS_ADI[input.ders]}
Konu (ünite/tema): ${input.unite.ad}
${input.unite.amac ? `Ünitenin amacı: ${input.unite.amac}\n` : ""}İçerik çerçevesi:
${icerik}

Öğrenme çıktıları (ogrenme_hedefi alanlarında YALNIZCA bu kodları birebir kullan):
${hedefler}

Süre: ${input.sure} dakika
Deneyim biçimi: ${DENEYIM_ADI[input.deneyim]}
Oyun alanı: ${ALAN_ADI[input.alan]}

Oyun yapısı hedefleri:
- Ana görev (durak) sayısı: ${recipe.anaGorev.min}-${recipe.anaGorev.max}
- Anlamlı seçim sahnesi: ${recipe.secim.min}-${recipe.secim.max}
- Kanıt/nesne: ${recipe.nesne.min}-${recipe.nesne.max}
- Dramaturji: ${recipe.dramaturji}
- Final: ${recipe.final}
- Mekân: ${recipe.alan}${qr}

Metinleri kısa tut (oyun 30 saniyede üretilmeli): hikaye_metni en fazla 2 cümle; soru tek cümle; ipuçları, destek açıklaması ve sonraki durak tarifi tek kısa cümle; seçenekler birkaç kelime.
Görev türlerini konuya uygun biçimde çeşitlendir. Durak id'leri d1, d2, ...; nesne id'leri n1, n2, ... biçiminde olsun. İlk durak başlangıçtır.`;
}

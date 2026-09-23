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
  const dersBloklari = input.dersler
    .map((k) => {
      const icerik = k.unite.konular.length ? k.unite.konular.map((c) => `  - ${c}`).join("\n") : "  - (belirtilmemiş)";
      const hedefler = k.unite.ogrenmeCiktilari.map((o) => `  - ${o.kod}: ${o.metin}`).join("\n");
      return `Ders: ${PROGRAM_DERS_ADI[k.ders]}
Konu (ünite/tema): ${k.unite.ad}
${k.unite.amac ? `Ünitenin amacı: ${k.unite.amac}\n` : ""}İçerik çerçevesi:
${icerik}
Öğrenme çıktıları:
${hedefler}`;
    })
    .join("\n\n");
  const coklu =
    input.dersler.length > 1
      ? "\nBu oyun disiplinler arasıdır: yukarıdaki derslerin HER BİRİ en az bir ana görevde çalışılsın ve hikâye dersleri tek bir gizemde birleştirsin.\n"
      : "";
  const qr =
    input.alan === "okul"
      ? `\nKullanılabilir QR durakları (yalnızca bunları kullan, her durağa farklı bir QR ver):\n${izinliQrIdleri.join(", ")}`
      : "";

  return `Aşağıdaki seçimlerle bir Dersera oyunu tasarla.

Sınıf: ${input.sinif}
ogrenme_hedefi alanlarında YALNIZCA aşağıdaki öğrenme çıktısı kodlarını birebir kullan.

${dersBloklari}
${coklu}
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

Alan kuralları:
- sahne_turu: "gorev", "secim" ya da "birlesme". secim sahnesinde secimler 2-3 farklı hedef içerir ve varsayilan_sonraki_durak_id boştur; diğer sahnelerde secimler boş dizidir.
- gorev_turu (duraklarda ve finalde): "coktan_secmeli", "eslestirme", "siralama", "surukle_birak", "gorsel_secim" ya da "sayisal".
- secenekler ve dogru_cevap: coktan_secmeli/gorsel_secim → 2-5 seçenek, dogru_cevap bunlardan biri birebir. siralama/surukle_birak → 3-6 öğe karışık sırada, dogru_cevap doğru sıranın " | " ile birleşimi. eslestirme → 3-5 "sol => sağ" çifti, dogru_cevap tüm çiftlerin " | " ile birleşimi. sayisal → secenekler boş, dogru_cevap yalnız sayı.
- ipucu_1 ve ipucu_2 cevabı söylemeden yönlendirir; ikincisi daha güçlüdür.
- Destek görevi aynı öğrenme hedefini daha küçük bir adımla çalıştıran çoktan seçmeli sorudur; destek_secenekler 2-4 seçenek, destek_dogru_cevap bunlardan biri birebir.
- final.ogrenme_hedefleri oyunda çalışılmış en az 2 kod içerir; final.gerekli_nesneler yalnız envanter id'lerinden oluşur.
- envanter tur: "kanit", "anahtar" ya da "parca". odul_id bir envanter id'si ya da boş metin.
- Boş/yok değerleri için boş metin ("") kullan: odul_id, varsayilan_sonraki_durak_id (son duraklarda ve seçim sahnelerinde), qr_durak_id (tek sınıfta).

Metinleri kısa tut (oyun hızlı üretilmeli): hikaye_metni en fazla 2 cümle; soru tek cümle; ipuçları, destek açıklaması ve sonraki durak tarifi tek kısa cümle; seçenekler birkaç kelime.
Görev türlerini konuya uygun biçimde çeşitlendir. Durak id'leri d1, d2, ...; nesne id'leri n1, n2, ... biçiminde olsun. İlk durak başlangıçtır.`;
}

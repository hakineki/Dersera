import { z } from "zod";
import type { GameDefinition } from "@/lib/composer/definition";

// Yapay zekâ destekli çocuk güvenliği denetimi (docs/URUN-BAGLAMI.md §9, "child-safe context"): kural tabanlı
// taramanın (cocukGuvenligi.ts) yakalayamadığı bağlamsal sorunlar için öğrenciye görünen tüm metinler bir modele
// okutulur. Bu dosya saf tipleri ve metin derlemesini taşır; istemci de içe aktarır. Çağrı ve önbellek
// yzDenetimService.ts'dedir.

export const YZ_KATEGORILERI = [
  "siddet",
  "cinsellik",
  "madde",
  "nefret",
  "korku",
  "tehlikeli-etkinlik",
  "kisisel-veri",
  "reklam-siyaset",
  "diger",
] as const;
export type YzKategori = (typeof YZ_KATEGORILERI)[number];

export const YZ_KATEGORI_ADI: Record<YzKategori, string> = {
  siddet: "şiddet",
  cinsellik: "cinsellik",
  madde: "madde kullanımı",
  nefret: "ayrımcılık / nefret",
  korku: "yaşa uygun olmayan korku",
  "tehlikeli-etkinlik": "tehlikeli etkinlik",
  "kisisel-veri": "kişisel veri",
  "reklam-siyaset": "reklam / siyasi yönlendirme",
  diger: "yaşa uygunluk",
};

export const YzCiktiSchema = z.object({
  bulgular: z
    .array(
      z.object({
        yer: z.string().describe("Metnin başındaki etiket, birebir: giris, amac, d1, d2, ..., final"),
        kategori: z.enum(YZ_KATEGORILERI),
        agirlik: z.enum(["incele", "engelle"]).describe("engelle yalnız açık ihlalde; şüphede incele"),
        alinti: z.string().describe("Sorunlu ifade, metinden birebir ve kısa"),
        aciklama: z.string().describe("Öğretmene tek cümlelik Türkçe gerekçe"),
      })
    )
    .describe("Sorun yoksa boş dizi"),
});
export type YzCikti = z.infer<typeof YzCiktiSchema>;
export type YzBulgu = YzCikti["bulgular"][number];

// tamam: model okudu (bulgu olmayabilir). kapali: sağlayıcı anahtarı yok, yalnız kural tabanlı denetim.
// yapilamadi: çağrı başarısız / süre / sınır. bekliyor: istemcide düzenleme sonrası, yayında yeniden yapılacak.
export type YzDenetim =
  | { durum: "tamam"; bulgular: YzBulgu[] }
  | { durum: "kapali" }
  | { durum: "yapilamadi" }
  | { durum: "bekliyor" };

// Öğretmene gösterilen tek satırlık durum; yönetişim notu ve önizleme aynı metni kullanır.
export function yzDurumMetni(yz: YzDenetim): string {
  switch (yz.durum) {
    case "tamam":
      return yz.bulgular.length ? "Yapay zekâ denetimi yapıldı; bulguları aşağıda." : "Yapay zekâ denetimi yapıldı; sorun bulunmadı.";
    case "kapali":
      return "Yapay zekâ denetimi yapılandırılmamış; yalnız kural tabanlı denetim uygulandı.";
    case "bekliyor":
      return "Yapay zekâ denetimi yayın sırasında yapılacak.";
    case "yapilamadi":
      return "Yapay zekâ denetimi şu anda yapılamadı; yayında yeniden denenir.";
  }
}

// Model çıktısı doğrudan öğretmene gösterildiği için boyut ve yer sınırlanır.
export const YZ_EN_COK_BULGU = 20;
export function yzCiktisiniTemizle(c: YzCikti, def: GameDefinition): YzBulgu[] {
  const yerler = new Set(metinBolumleri(def).map((b) => b.yer));
  return c.bulgular.slice(0, YZ_EN_COK_BULGU).map((b) => ({
    ...b,
    yer: yerler.has(b.yer.trim()) ? b.yer.trim() : "genel",
    alinti: b.alinti.trim().slice(0, 160),
    aciklama: b.aciklama.trim().slice(0, 240),
  }));
}

// Öğrenciye görünen metinler, bölüm etiketleriyle. Kimlikler, kodlar ve oyun ayarları okutulmaz.
export function metinBolumleri(def: GameDefinition): { yer: string; baslik: string; metin: string }[] {
  const satir = (etiket: string, deger: string | string[]) => {
    const v = Array.isArray(deger) ? deger.filter((x) => x.trim()).join(" / ") : deger.trim();
    return v ? `${etiket}: ${v}` : "";
  };
  const birlestir = (satirlar: string[]) => satirlar.filter(Boolean).join("\n");
  return [
    { yer: "giris", baslik: "Giriş", metin: birlestir([satir("Başlık", def.meta.baslik), satir("Hikâye", def.hikaye_giris)]) },
    { yer: "amac", baslik: "Oyunun amacı", metin: birlestir([satir("Amaç", def.oyun_amaci), satir("Nesneler", def.envanter.map((n) => n.isim))]) },
    ...def.duraklar.map((d) => {
      const g = d.gorev;
      return {
        yer: d.id,
        baslik: d.isim,
        metin: birlestir([
          satir("Durak", d.isim),
          satir("Hikâye", d.hikaye_metni),
          satir("Yol tarifi", d.mekan.sonraki_durak_tarifi),
          satir("Soru", g.soru),
          satir("Seçenekler", g.secenekler),
          satir("İpucu 1", g.ipucu_1),
          satir("İpucu 2", g.ipucu_2),
          satir("Destek sorusu", g.destek_gorevi.soru),
          satir("Destek seçenekleri", g.destek_gorevi.secenekler),
          satir("Destek açıklaması", g.destek_gorevi.aciklama),
          satir("Seçimler", d.secimler.map((s) => s.metin)),
        ]),
      };
    }),
    {
      yer: "final",
      baslik: "Final",
      metin: birlestir([
        satir("Hikâye", def.final.hikaye_metni),
        satir("Soru", def.final.soru),
        satir("Seçenekler", def.final.secenekler),
        satir("Başarı", def.final.basari_metni),
      ]),
    },
  ].filter((b) => b.metin);
}

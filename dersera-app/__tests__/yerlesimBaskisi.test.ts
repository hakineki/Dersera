import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GameDefinition } from "@/lib/composer/definition";
import { konumYeri } from "@/lib/composer/mekanYerlesimi";
import { yerlesimSatirlari } from "@/lib/composer/mekanRotasi";
import YerlesimBaskisi, { sayfalaraBol } from "@/components/YerlesimBaskisi";
import { sayfayiBas, type BaskiPenceresi } from "@/lib/baski";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";

// Mekân rotasının basılı yerleşim çıktısı: liste sayfası ve oyunun QR kartları (kesilecek yer şeridiyle).

const okul = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "macera", alan: "okul" });
const MEKANLAR = ["kutuphane", "bahce", "kantin", "spor-salonu", "fen-laboratuvari", "koridor", "merdivenler", "sinif"];

function rotaOyunu(): GameDefinition {
  const def = makeDefinition(okul, 8);
  def.meta = { ...def.meta, rota: "mekan" };
  def.duraklar.forEach((d, i) => {
    d.mekan = { ...d.mekan, qr_durak_id: `qr-${i + 1}`, yer: konumYeri(MEKANLAR[i], `Oyun:${d.id}`) };
  });
  def.duraklar[7].mekan.yer!.mekan_adi = "10-A sınıfı";
  return def;
}

describe("yerleşim satırları", () => {
  it("QR numarası sırasıyla mekân ve nokta; yeri olmayan (eski okul) durak listede yok", () => {
    const def = rotaOyunu();
    // Durak sırası ile QR sırası farklı olsa da liste QR numarasına göre dizilir.
    def.duraklar.reverse();
    delete def.duraklar[0].mekan.yer;
    const s = yerlesimSatirlari(def);
    expect(s.map((x) => x.qr)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(s[0]).toEqual({ durakId: "d1", qr: 1, mekan: "Kütüphane", nokta: def.duraklar.find((d) => d.id === "d1")!.mekan.yer!.nokta });
    expect(s.some((x) => x.mekan === "10-A sınıfı")).toBe(false);
    expect(yerlesimSatirlari(makeDefinition(okul, 8))).toEqual([]);
  });

  it("kartlar sayfa başına 4", () => {
    expect(sayfalaraBol([1, 2, 3, 4, 5, 6, 7, 8, 9]).map((g) => g.length)).toEqual([4, 4, 1]);
  });
});

describe("yazdırma akışı", () => {
  // Masaüstü tarayıcılar gibi: print() engelleyicidir ve afterprint print() dönmeden gelir. olayGelsin false ise olay hiç
  // gelmez (bazı mobil tarayıcılar).
  function pencere(olayGelsin = true) {
    const hedef = new EventTarget();
    const sinif = new Set<string>();
    const anlik: boolean[] = [];
    const p: BaskiPenceresi = {
      print: () => {
        anlik.push(sinif.has("baski"));
        if (olayGelsin) hedef.dispatchEvent(new Event("afterprint"));
      },
      addEventListener: (t, f, s) => hedef.addEventListener(t, f, s),
      removeEventListener: (t, f) => hedef.removeEventListener(t, f),
    };
    const kok = { add: (s: string) => sinif.add(s), remove: (s: string) => sinif.delete(s) };
    return { p, kok, sinif, anlik, hedef };
  }

  it("sınıf baskıdan önce eklenir; print içinde gelen afterprint yakalanır ve temizler; ikinci baskı da aynı", () => {
    const w = pencere();
    let biten = 0;
    sayfayiBas(w.kok, w.p, "baski", () => biten++);
    expect([w.anlik, w.sinif.has("baski"), biten]).toEqual([[true], false, 1]);
    sayfayiBas(w.kok, w.p, "baski", () => biten++);
    expect([w.anlik, w.sinif.has("baski"), biten]).toEqual([[true, true], false, 2]);
  });

  it("afterprint hiç gelmezse sınıf kalır; iptal eski dinleyiciyi kaldırır, sonraki olay yalnız bir kez temizler", () => {
    const w = pencere(false);
    let biten = 0;
    const iptal = sayfayiBas(w.kok, w.p, "baski", () => biten++);
    expect(w.sinif.has("baski")).toBe(true);
    iptal();
    sayfayiBas(w.kok, w.p, "baski", () => biten++);
    w.hedef.dispatchEvent(new Event("afterprint"));
    w.hedef.dispatchEvent(new Event("afterprint"));
    expect([w.sinif.has("baski"), biten]).toEqual([false, 1]);
  });
});

describe("basılı çıktı", () => {
  const def = rotaOyunu();
  const satirlar = yerlesimSatirlari(def);
  const html = renderToStaticMarkup(createElement(YerlesimBaskisi, { baslik: def.meta.baslik, kod: "ABC-123", satirlar }));

  it("liste sayfası: başlık, oyun kodu, her QR için mekân, nokta ve işaret kutusu", () => {
    expect(html).toContain('id="yerlesim-baski"');
    expect(html).toContain(def.meta.baslik);
    expect(html).toContain("ABC-123");
    expect((html.match(/<tr class="break-inside-avoid">/g) ?? []).length).toBe(8);
    expect((html.match(/aria-label="Yapıştırıldı kutusu"/g) ?? []).length).toBe(8);
    expect((html.match(/<th scope="col"/g) ?? []).length).toBe(4);
    for (const s of satirlar) expect(html).toContain(s.nokta);
    expect(html).toContain("10-A sınıfı");
  });

  it("kart sayfaları: her QR'ın kartı (açık tasarım) ve altında kesilecek yapıştırma şeridi; 8 kart 2 sayfa", () => {
    for (let n = 1; n <= 8; n++) {
      expect(html).toContain(`aria-label="Durak ${n} QR kodu (Açık / baskı)"`);
      expect(html).toContain(`Buraya yapıştır (QR ${n}):`);
    }
    // 1 liste sayfası + 2 kart sayfası.
    expect((html.match(/<section/g) ?? []).length).toBe(3);
  });

  it("oyun kodu yoksa (önizleme) kod satırı yok", () => {
    const onizleme = renderToStaticMarkup(createElement(YerlesimBaskisi, { baslik: "Oyun", satirlar }));
    expect(onizleme).not.toContain("Oyun kodu");
  });
});

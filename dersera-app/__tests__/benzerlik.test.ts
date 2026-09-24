import type { GameDefinition } from "@/lib/composer/definition";
import { BENZERLIK, benzerlikOrani, dersleriOrtak, metinParcalari } from "@/lib/benzerlik";
import { validationContext } from "@/lib/composer/service";
import { validateGame } from "@/lib/composer/validator";
import { yonetisimDegerlendir } from "@/lib/composer/yonetisim";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";
import { metinli } from "./helpers/metinliOyun";

const girdi = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const oyun = (tohum: string) => metinli(makeDefinition(girdi, 8), tohum);
const oran = (a: GameDefinition, b: GameDefinition) => benzerlikOrani(metinParcalari(a), metinParcalari(b));

describe("benzerlik ölçüsü", () => {
  it("bağımsız oyunlar eşiğin çok altında (ortak şablon ifadeleri olsa da); birebir kopya 1", () => {
    expect(oran(oyun("a"), oyun("b"))!).toBeLessThan(BENZERLIK.incelemeEsigi / 2);
    expect(oran(oyun("a"), oyun("a"))).toBe(1);
  });

  it("her durakta birkaç kelime değiştirmek kopyayı gizlemez", () => {
    const kopya = oyun("a");
    for (const d of kopya.duraklar) d.hikaye_metni = d.hikaye_metni.replace(/w3\b/, "degisti");
    kopya.meta.baslik = "Bambaşka başlık";
    expect(oran(oyun("a"), kopya)!).toBeGreaterThanOrEqual(BENZERLIK.kopyaEsigi);
  });

  it("durak eklemek ya da silmek kopyayı gizlemez (örtüşme küçük oyuna göre)", () => {
    const uzun = metinli(makeDefinition(girdi, 12), "a");
    expect(oran(oyun("a"), uzun)).toBe(1);
  });

  it("metnin yarısı yeniden yazılmış oyun inceleme aralığında", () => {
    const turetilmis = oyun("a");
    const baska = oyun("b");
    turetilmis.duraklar.slice(0, 4).forEach((d, i) => {
      d.hikaye_metni = baska.duraklar[i].hikaye_metni;
      d.gorev.soru = baska.duraklar[i].gorev.soru;
    });
    const o = oran(oyun("a"), turetilmis)!;
    expect(o).toBeGreaterThanOrEqual(BENZERLIK.incelemeEsigi);
    expect(o).toBeLessThan(BENZERLIK.kopyaEsigi);
  });

  it("alan etiketleri (Soru, Hikâye…) ortak parça sayılmaz; çok kısa oyun karşılaştırılmaz", () => {
    const d = makeDefinition(girdi, 6);
    d.duraklar[0].gorev.soru = "kuvvet kütle ivme";
    d.duraklar[0].hikaye_metni = "kuvvet kütle ivme";
    const p = metinParcalari(d);
    expect(p.has("kuvvet kütle ivme")).toBe(true);
    expect([...p].some((x) => /^(soru|hikâye) kuvvet kütle$/.test(x))).toBe(false);
    expect(benzerlikOrani(new Set(["a b c"]), metinParcalari(oyun("a")))).toBeNull();
  });

  it("ders örtüşmesi birleşik derslerde de bulunur", () => {
    expect(dersleriOrtak("Fizik + Kimya", "Kimya")).toBe(true);
    expect(dersleriOrtak("Fizik", "Kimya")).toBe(false);
  });
});

describe("benzerlik kapısı", () => {
  const d = oyun("a");
  const v = validateGame(d, validationContext(girdi));
  const kapi = (benzer?: Parameters<typeof yonetisimDegerlendir>[3]) => yonetisimDegerlendir(d, v, undefined, benzer).kapilar.find((k) => k.kapi === "benzerlik")!;

  it("sınıf yayınında uygulanmaz; benzer yoksa geçer", () => {
    expect(kapi()).toMatchObject({ karar: "PASS", notlar: ["Sınıf yayınında uygulanmaz."] });
    expect(kapi([])).toMatchObject({ karar: "PASS", notlar: ["Topluluktaki oyunlarla belirgin metin örtüşmesi yok."] });
  });

  it("kopya eşiği BLOCK, inceleme eşiği REVIEW; incelemedeki oyunun başlığı gösterilmez", () => {
    const k = kapi([
      { id: "1", baslik: "Kuvvet Avı", oran: 0.7 },
      { id: "2", baslik: null, oran: 0.4 },
    ]);
    expect(k.karar).toBe("BLOCK");
    expect(k.bulgular).toEqual([
      expect.objectContaining({ kod: "kopya", karar: "BLOCK", mesaj: expect.stringContaining('"Kuvvet Avı" oyunuyla metin örtüşmesi %70') }),
      expect.objectContaining({ kod: "benzer", karar: "REVIEW", mesaj: expect.stringMatching(/^İncelemedeki başka bir oyunla metin örtüşmesi %40/) }),
    ]);
    expect(yonetisimDegerlendir(d, v, undefined, [{ id: "2", baslik: null, oran: 0.5 }]).karar).toBe("REVIEW");
  });
});

import { validateGame } from "@/lib/composer/validator";
import { validationContext } from "@/lib/composer/service";
import type { GameDefinition } from "@/lib/composer/definition";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";

const sinifInput = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const okulInput = resolvedInput({ sinif: 11, ders: "matematik", sure: 60, deneyim: "macera", alan: "okul" });

const clone = (d: GameDefinition): GameDefinition => JSON.parse(JSON.stringify(d));
const codes = (def: GameDefinition, input = sinifInput) => validateGame(def, validationContext(input)).hatalar.map((h) => h.kod);

describe("geçerli oyunlar", () => {
  it("tek sınıf dengeli oyun geçer", () => {
    const r = validateGame(makeDefinition(sinifInput, 7), validationContext(sinifInput));
    expect(r.hatalar).toEqual([]);
    expect(r.gecerli).toBe(true);
  });

  it("okul macerası oyunu geçer", () => {
    expect(codes(makeDefinition(okulInput, 9), okulInput)).toEqual([]);
  });

  it("tek sınıf oyununda QR zorunlu değildir (senaryo 9)", () => {
    const def = makeDefinition(sinifInput, 7);
    expect(def.duraklar.every((d) => d.mekan.tur === "sanal" && d.mekan.qr_durak_id === null)).toBe(true);
    expect(codes(def)).toEqual([]);
  });
});

describe("grafik kuralları", () => {
  it("olmayan durak referansını yakalar (senaryo 6)", () => {
    const def = clone(makeDefinition(sinifInput));
    def.duraklar[2].varsayilan_sonraki_durak_id = "d99";
    expect(codes(def)).toContain("hedef-yok");
  });

  it("olmayan seçim hedefini yakalar", () => {
    const def = clone(makeDefinition(sinifInput));
    def.duraklar[1].secimler[1].hedef_durak_id = "yok";
    expect(codes(def)).toContain("hedef-yok");
  });

  it("finale ulaşılamayan oyunu yakalar (senaryo 7)", () => {
    const def = clone(makeDefinition(sinifInput, 6));
    const last = def.duraklar[def.duraklar.length - 1];
    last.varsayilan_sonraki_durak_id = "d5";
    expect(codes(def)).toEqual(expect.arrayContaining(["final-erisilemez", "cikmaz-rota"]));
  });

  it("çıkışı olmayan kapalı döngüyü yakalar (d3 ⇄ d4)", () => {
    const def = clone(makeDefinition(sinifInput, 6));
    def.duraklar[2].varsayilan_sonraki_durak_id = "d4";
    def.duraklar[3].varsayilan_sonraki_durak_id = "d3";
    expect(codes(def)).toContain("cikmaz-rota");
  });

  it("çıkışı olan geri dönüşe izin verir (seçime geri dönülebilir)", () => {
    const def = clone(makeDefinition(sinifInput, 6));
    def.duraklar[3].varsayilan_sonraki_durak_id = "d2";
    expect(codes(def)).not.toContain("cikmaz-rota");
  });

  it("tekrar eden durak kimliklerini yakalar", () => {
    const def = clone(makeDefinition(sinifInput));
    def.duraklar[3].id = "d3";
    expect(codes(def)).toContain("durak-id-tekrar");
  });

  it("başlangıçtan ulaşılamayan durağı yakalar", () => {
    const def = clone(makeDefinition(sinifInput, 6));
    def.duraklar.push({ ...clone(makeDefinition(sinifInput)).duraklar[5], id: "d9" });
    expect(codes(def)).toContain("erisilemez-durak");
  });

  it("gerçek seçim yoksa reddeder", () => {
    const def = clone(makeDefinition(sinifInput));
    def.duraklar[1].sahne_turu = "gorev";
    def.duraklar[1].secimler = [];
    def.duraklar[1].varsayilan_sonraki_durak_id = "d3";
    def.duraklar[2].varsayilan_sonraki_durak_id = "d4";
    expect(codes(def)).toContain("secim-yok");
  });

  it("aynı hedefe giden iki seçenek gerçek seçim sayılmaz", () => {
    const def = clone(makeDefinition(sinifInput));
    def.duraklar[1].secimler[1].hedef_durak_id = "d3";
    expect(codes(def)).toEqual(expect.arrayContaining(["secim-yetersiz", "secim-yok"]));
  });
});

describe("envanter ve final", () => {
  it("final için gereken nesne bir rotada kazanılmıyorsa reddeder", () => {
    const def = clone(makeDefinition(sinifInput));
    def.duraklar[3].gorev.odul_id = null;
    expect(codes(def)).toContain("nesne-kacirilabilir");
  });

  it("hiç kazanılmayan gerekli nesneyi yakalar", () => {
    const def = clone(makeDefinition(sinifInput));
    def.envanter.push({ id: "n3", tur: "parca", isim: "Parça", final_icin_gerekli: true });
    expect(codes(def)).toContain("nesne-kazanilamaz");
  });

  it("envanterde olmayan ödülü yakalar", () => {
    const def = clone(makeDefinition(sinifInput));
    def.duraklar[0].gorev.odul_id = "n9";
    expect(codes(def)).toContain("odul-yok");
  });

  it("macera/dengeli modda nesnesiz oyunu reddeder", () => {
    const def = clone(makeDefinition(sinifInput));
    def.envanter = [];
    def.final.gerekli_nesneler = [];
    def.duraklar.forEach((d) => (d.gorev.odul_id = null));
    expect(codes(def)).toEqual(expect.arrayContaining(["nesne-kullanilmiyor", "final-nesne-kullanmiyor"]));
  });

  it("ders modunda nesnesiz oyun, final çalışılmış hedefleri birleştiriyorsa geçer", () => {
    const input = resolvedInput({ sinif: 10, ders: "turk-dili", sure: 20, deneyim: "ders", alan: "sinif" });
    const def = clone(makeDefinition(input, 5));
    def.envanter = [];
    def.final.gerekli_nesneler = [];
    def.duraklar.forEach((d) => (d.gorev.odul_id = null));
    expect(codes(def, input)).toEqual([]);
  });

  it("nesne kullanmayan ve tek bağımsız soru olan finali reddeder", () => {
    const input = resolvedInput({ sinif: 10, ders: "turk-dili", sure: 20, deneyim: "ders", alan: "sinif" });
    const def = clone(makeDefinition(input, 5));
    def.envanter = [];
    def.final.gerekli_nesneler = [];
    def.final.ogrenme_hedefleri = [];
    def.duraklar.forEach((d) => (d.gorev.odul_id = null));
    expect(codes(def, input)).toContain("final-bagimsiz");
  });
});

describe("görev içeriği", () => {
  it.each([
    ["doğru cevap seçeneklerde yok", (d: GameDefinition) => (d.duraklar[0].gorev.dogru_cevap = "Z"), "cevap-bicimi"],
    ["tek ipucu", (d: GameDefinition) => (d.duraklar[0].gorev.ipucu_2 = " "), "ipucu-eksik"],
    ["aynı iki ipucu", (d: GameDefinition) => (d.duraklar[0].gorev.ipucu_2 = d.duraklar[0].gorev.ipucu_1), "ipucu-ayni"],
    ["destek görevi hatalı", (d: GameDefinition) => (d.duraklar[0].gorev.destek_gorevi.dogru_cevap = "Q"), "destek-eksik"],
    ["konu dışı öğrenme hedefi", (d: GameDefinition) => (d.duraklar[0].gorev.ogrenme_hedefi = "MAT.12.9.9"), "hedef-disi"],
    ["sayısal cevap sayı değil", (d: GameDefinition) => Object.assign(d.duraklar[0].gorev, { tur: "sayisal", secenekler: [], dogru_cevap: "on iki" }), "cevap-bicimi"],
    ["sıralama öğeleri eksik", (d: GameDefinition) => Object.assign(d.final, { dogru_cevap: "İlk | İkinci" }), "final-cevap"],
  ])("yakalar: %s", (_l, mutate, kod) => {
    const def = clone(makeDefinition(sinifInput));
    mutate(def);
    expect(codes(def)).toContain(kod);
  });
});

describe("mekân kuralları", () => {
  it("okul modunda bilinmeyen QR'ı reddeder (senaryo 8)", () => {
    const def = clone(makeDefinition(okulInput, 9));
    def.duraklar[2].mekan.qr_durak_id = "qr-99";
    expect(codes(def, okulInput)).toContain("qr-bilinmiyor");
  });

  it("okul modunda QR'sız durağı reddeder", () => {
    const def = clone(makeDefinition(okulInput, 9));
    def.duraklar[2].mekan = { tur: "sanal", qr_durak_id: null, sonraki_durak_tarifi: "" };
    expect(codes(def, okulInput)).toContain("okul-qr-eksik");
  });

  it("okul modunda aynı QR iki durakta olamaz", () => {
    const def = clone(makeDefinition(okulInput, 9));
    def.duraklar[3].mekan.qr_durak_id = def.duraklar[2].mekan.qr_durak_id;
    expect(codes(def, okulInput)).toContain("qr-tekrar");
  });

  it("tek sınıf modunda kalan QR zorunluluğunu reddeder", () => {
    const def = clone(makeDefinition(sinifInput));
    def.duraklar[0].mekan = { tur: "qr", qr_durak_id: "qr-1", sonraki_durak_tarifi: "" };
    expect(codes(def)).toContain("sinif-qr");
  });
});

describe("tarif uyarıları", () => {
  it("görev sayısı hedef dışındaysa uyarı verir ama yayını engellemez", () => {
    const r = validateGame(makeDefinition(sinifInput, 12), validationContext(sinifInput));
    expect(r.gecerli).toBe(true);
    expect(r.uyarilar.map((u) => u.kod)).toContain("gorev-sayisi");
  });
});

describe("boyut sınırları", () => {
  it("12'den fazla durağı reddeder", () => {
    expect(codes(makeDefinition(sinifInput, 13))).toContain("durak-fazla");
  });

  it("çok uzun metni ve çok fazla seçeneği reddeder", () => {
    const def = clone(makeDefinition(sinifInput));
    def.duraklar[0].hikaye_metni = "a".repeat(1001);
    def.duraklar[1].gorev.secenekler = ["A", "B", "C", "D", "E", "F", "G"];
    expect(codes(def)).toEqual(expect.arrayContaining(["metin-uzun", "secenek-fazla"]));
  });

  it("8'den fazla nesneyi reddeder", () => {
    const def = clone(makeDefinition(sinifInput));
    for (let i = 3; i <= 9; i++) def.envanter.push({ id: `n${i}`, tur: "parca", isim: "x", final_icin_gerekli: false });
    expect(codes(def)).toContain("nesne-fazla");
  });
});

import { clearRedisEnv } from "./helpers/fakeRedis";
import { buildApi, hesapAc, jsonRequest } from "./helpers/api";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";
import { getUniteler } from "@/data/mufredat/programlar";
import { validationContext } from "@/lib/composer/context";
import type { GameDefinition } from "@/lib/composer/definition";
import { cocukGuvenligiTara } from "@/lib/composer/cocukGuvenligi";
import { validateGame } from "@/lib/composer/validator";
import { ekBulgular, KAPILAR, rozetler, yonetisimDegerlendir, type KapiId } from "@/lib/composer/yonetisim";

const girdi = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const dersler = [{ ders: "fizik", konuId: getUniteler(10, "fizik")[0].id }];
const oyun = (degistir?: (d: GameDefinition) => void) => {
  const d = makeDefinition(girdi, 8);
  degistir?.(d);
  return d;
};
const degerlendir = (d: GameDefinition) => yonetisimDegerlendir(d, validateGame(d, validationContext(girdi)));
const kapi = (d: GameDefinition, id: KapiId) => degerlendir(d).kapilar.find((k) => k.kapi === id)!;

describe("içerik yönetişimi: kapılar", () => {
  it("geçerli oyun sekiz kapının hepsinden PASS alır; rozetler uygun", () => {
    const s = degerlendir(oyun());
    expect(s.karar).toBe("PASS");
    expect(s.kapilar.map((k) => k.kapi)).toEqual(KAPILAR.map((k) => k.id));
    expect(s.kapilar.every((k) => k.karar === "PASS" && k.bulgular.length === 0)).toBe(true);
    expect(rozetler(s)).toEqual([
      { ad: "Müfredat Uyumu", karar: "PASS" },
      { ad: "Oyun Mantığı", karar: "PASS" },
      { ad: "Öğrenme Kalitesi", karar: "PASS" },
      { ad: "Çocuk Güvenliği", karar: "PASS" },
      { ad: "Yayına Uygunluk", karar: "PASS" },
    ]);
  });

  it("doğrulama hataları ilgili kapıda BLOCK olur", () => {
    expect(kapi(oyun((d) => (d.duraklar[2].gorev.ogrenme_hedefi = "YOK.1.1")), "mufredat")).toMatchObject({ karar: "BLOCK" });
    expect(kapi(oyun((d) => (d.duraklar[2].gorev.soru = "")), "ogrenme-kalitesi").bulgular[0]).toMatchObject({ kod: "soru-bos", karar: "BLOCK", durakId: "d3" });
    const kopuk = oyun((d) => (d.duraklar[0].varsayilan_sonraki_durak_id = "d1"));
    expect(kapi(kopuk, "oyun-mantigi").karar).toBe("BLOCK");
    expect(degerlendir(kopuk).karar).toBe("BLOCK");
  });

  it("tarif sapması yayını etkilemez: oyun kalitesi notu olarak kalır", () => {
    const k = kapi(makeDefinition(girdi, 5), "oyun-kalitesi");
    expect(k.karar).toBe("PASS");
    expect(k.notlar.join(" ")).toMatch(/Görev sayısı/);
  });

  it("tekrarlanan soru, cevabı veren ipucu ve boş hikâye REVIEW olur", () => {
    const tekrar = oyun((d) => (d.duraklar[3].gorev.soru = d.duraklar[2].gorev.soru));
    expect(kapi(tekrar, "ogrenme-kalitesi").bulgular).toEqual([expect.objectContaining({ kod: "soru-tekrar", karar: "REVIEW", durakId: "d4" })]);

    const secmeli = oyun((d) => {
      Object.assign(d.duraklar[2].gorev, { secenekler: ["Newton", "Galileo", "Kepler"], dogru_cevap: "Galileo", ipucu_1: "Cevap Galileo." });
    });
    expect(kapi(secmeli, "ogrenme-kalitesi").bulgular[0]).toMatchObject({ kod: "ipucu-cevap", karar: "REVIEW", durakId: "d3" });

    const sayisal = oyun((d) => {
      Object.assign(d.duraklar[2].gorev, { tur: "sayisal", secenekler: [], dogru_cevap: "9,8", ipucu_2: "Sonuç 9.8 çıkar." });
    });
    expect(kapi(sayisal, "ogrenme-kalitesi").bulgular[0]).toMatchObject({ kod: "ipucu-cevap" });

    // Cevap soruda zaten geçiyorsa ipucunda geçmesi sızıntı değildir.
    const soruda = oyun((d) => {
      Object.assign(d.duraklar[2].gorev, { soru: "Galileo mu Newton mu?", secenekler: ["Newton", "Galileo"], dogru_cevap: "Galileo", ipucu_1: "Galileo'nun deneyini düşün." });
    });
    expect(kapi(soruda, "ogrenme-kalitesi").karar).toBe("PASS");

    const bos = oyun((d) => (d.duraklar[4].hikaye_metni = "  "));
    expect(kapi(bos, "oyun-kalitesi").bulgular[0]).toMatchObject({ kod: "hikaye-bos", karar: "REVIEW", durakId: "d5" });
    expect(degerlendir(bos).karar).toBe("REVIEW");
  });

  it("rozetler: REVIEW ve BLOCK doğru rozete ve Yayına Uygunluk'a yansır", () => {
    const s = degerlendir(oyun((d) => (d.duraklar[1].hikaye_metni = "Kumarhanenin önündesin.")));
    expect(rozetler(s)).toEqual(expect.arrayContaining([{ ad: "Çocuk Güvenliği", karar: "REVIEW" }, { ad: "Yayına Uygunluk", karar: "REVIEW" }, { ad: "Oyun Mantığı", karar: "PASS" }]));
  });

  it("ekBulgular doğrulama hatalarını tekrar etmez, yalnız yönetişimin kendi bulgularını verir", () => {
    const d = oyun((x) => {
      x.duraklar[2].gorev.soru = "";
      x.duraklar[3].hikaye_metni = "";
    });
    const v = validateGame(d, validationContext(girdi));
    expect(ekBulgular(yonetisimDegerlendir(d, v), v).map((b) => b.kod)).toEqual(["hikaye-bos"]);
  });
});

describe("çocuk güvenliği taraması", () => {
  const tara = (metin: string) => cocukGuvenligiTara(oyun((d) => (d.duraklar[2].hikaye_metni = metin)));

  it("açık küfür yayını engeller; bağlama bağlı ifade gözden geçirme ister", () => {
    expect(tara("Siktir git dedi.")).toEqual([expect.objectContaining({ kategori: "kufur", engel: true, durakId: "d3", yer: '"Rota A" durağı' })]);
    expect(tara("Kumar masasına otur.")[0]).toMatchObject({ kategori: "kumar", engel: false });
    expect(tara("Bu iksir uyuşturucudur.")[0]).toMatchObject({ kategori: "madde", engel: false });
    expect(tara("Telefon numaranı buraya yaz.")[0]).toMatchObject({ kategori: "kisisel-veri" });
    expect(tara("Kendine zarar verme oyunu.")[0]).toMatchObject({ kategori: "kendine-zarar" });
  });

  it("Türkçe büyük harf (İ/I) ve eklerle eşleşir", () => {
    expect(tara("İNTİHAR mektubu")[0]).toMatchObject({ kategori: "kendine-zarar" });
    expect(tara("KUMARHANEYE gir")[0]).toMatchObject({ kategori: "kumar" });
  });

  it.each([
    "Kurtuluş Savaşı'nda cephane taşıyan kadınlar",
    "Bitkilerde eşeyli üreme ve cinsel hücreler",
    "Esrarengiz bir kapı açıldı.",
    "Alkoller ve karboksilik asitler",
    "Şifreyi çöz ve kapıyı aç.",
    "Sevgili öğrenciler, bahçede buluşalım.",
    "Anahtar sözcük: seksen dört",
  ])("müfredat ve macera dili yanlış alarm vermez: %s", (metin) => {
    expect(tara(metin)).toEqual([]);
  });

  it("öğrencinin gördüğü tüm alanlar taranır: seçenek, seçim metni, final, giriş", () => {
    expect(cocukGuvenligiTara(oyun((d) => (d.duraklar[0].gorev.secenekler = ["A", "bahis", "C"])))[0].durakId).toBe("d1");
    expect(cocukGuvenligiTara(oyun((d) => (d.duraklar[1].secimler[0].metin = "Kumarhaneye git")))[0].durakId).toBe("d2");
    expect(cocukGuvenligiTara(oyun((d) => (d.final.basari_metni = "Sarhoş kaptan kazandı")))[0].yer).toBe("Final");
    expect(cocukGuvenligiTara(oyun((d) => (d.meta.baslik = "Sigara Adası")))[0].yer).toBe("Oyun girişi");
  });
});

describe("yayın yönetişimi atlayamaz", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  let ogretmen: string;
  beforeEach(async () => {
    clearRedisEnv();
    api = await buildApi();
    ogretmen = await hesapAc(api, "ogretmen1");
  });
  const cerezli = (req: Request) => (req.headers.set("cookie", ogretmen), req);
  const yayinla = (definition: GameDefinition) => api.games.POST(cerezli(jsonRequest("/api/games", { composer: { definition, dersler } })));
  const topluluk = async () => (await (await api.topluluk.GET(new Request("http://localhost/api/topluluk"))).json()).oyunlar as { baslik: string }[];

  it("BLOCK: yayın 422, oyun kodu üretilmez, yanıtta gerekçeli yönetişim sonucu var", async () => {
    const res = await yayinla(oyun((d) => (d.duraklar[2].hikaye_metni = "Orospu çocuğu!")));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/içerik denetimi/);
    expect(json.game).toBeUndefined();
    expect(json.yonetisim.karar).toBe("BLOCK");
    expect(json.yonetisim.kapilar.find((k: { kapi: string }) => k.kapi === "cocuk-guvenligi").bulgular[0]).toMatchObject({ karar: "BLOCK", durakId: "d3" });
    expect(await topluluk()).toEqual([]);
  });

  it("doğrulama hatası da yönetişim sonucuyla döner", async () => {
    const res = await yayinla(oyun((d) => (d.duraklar[2].gorev.soru = "")));
    expect(res.status).toBe(422);
    expect((await res.json()).yonetisim.kapilar.find((k: { kapi: string }) => k.kapi === "ogrenme-kalitesi").karar).toBe("BLOCK");
  });

  it("REVIEW: sınıfa yayınlanır ama topluluğa otomatik eklenmez; PASS eklenir", async () => {
    const inceleme = await yayinla(oyun((d) => ((d.meta.baslik = "Şans Oyunu"), (d.duraklar[1].hikaye_metni = "Rulet masasına yaklaş."))));
    expect(inceleme.status).toBe(201);
    expect((await inceleme.json()).yonetisim.karar).toBe("REVIEW");
    expect(await topluluk()).toEqual([]);
    const temiz = await yayinla(oyun((d) => (d.meta.baslik = "Temiz Oyun")));
    expect(temiz.status).toBe(201);
    expect((await temiz.json()).yonetisim.karar).toBe("PASS");
    expect((await topluluk()).map((o) => o.baslik)).toEqual(["Temiz Oyun"]);
  });

  it("kütüphaneden yayında da aynı kural: BLOCK 422, REVIEW topluluğa gitmez", async () => {
    const kaydet = async (definition: GameDefinition) =>
      (await (await api.library.POST(cerezli(jsonRequest("/api/library", { definition, dersler })))).json()).id as string;
    const yayin = (id: string) => api.libraryPublish.POST(cerezli(jsonRequest(`/api/library/${id}/publish`, {})), api.idParams(id));

    const engelli = await yayin(await kaydet(oyun((d) => (d.duraklar[2].hikaye_metni = "Siktir git."))));
    expect(engelli.status).toBe(422);
    expect((await engelli.json()).yonetisim.karar).toBe("BLOCK");

    const inceleme = await yayin(await kaydet(oyun((d) => (d.duraklar[1].hikaye_metni = "Bahis oynayalım."))));
    expect(inceleme.status).toBe(201);
    expect(await topluluk()).toEqual([]);
  });
});

import { clearRedisEnv } from "./helpers/fakeRedis";
import { buildApi, hesapAc, jsonRequest, samplePublish } from "./helpers/api";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";
import { getUniteler } from "@/data/mufredat/programlar";
import { validationContext } from "@/lib/composer/context";
import type { GameDefinition } from "@/lib/composer/definition";
import { cocukGuvenligiTara, metinleriTara } from "@/lib/composer/cocukGuvenligi";
import { validateGame } from "@/lib/composer/validator";
import { ekBulgular, KAPILAR, klasikDurakEngelleri, metindekiSayilar, ozetEngelli, rozetler, yonetisimDegerlendir, type KapiId } from "@/lib/composer/yonetisim";

const girdi = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const dersler = [{ ders: "fizik", konuId: getUniteler(10, "fizik")[0].id }];
const oyun = (degistir?: (d: GameDefinition) => void) => {
  const d = makeDefinition(girdi, 8);
  degistir?.(d);
  return d;
};
const degerlendir = (d: GameDefinition) => yonetisimDegerlendir(d, validateGame(d, validationContext(girdi)));
const kapi = (d: GameDefinition, id: KapiId) => degerlendir(d).kapilar.find((k) => k.kapi === id)!;
const sayisalGorev = (d: GameDefinition, alanlar: Record<string, unknown>) => Object.assign(d.duraklar[2].gorev, { tur: "sayisal", secenekler: [], ...alanlar });

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

  it("şema niteliğindeki hatalar şema kapısına düşer ve Müfredat Uyumu rozetine yansır", () => {
    const d = oyun((x) => (x.duraklar[2].gorev.soru = "x".repeat(1001)));
    expect(kapi(d, "sema")).toMatchObject({ karar: "BLOCK", notlar: [] });
    expect(kapi(d, "oyun-mantigi").karar).toBe("PASS");
    expect(rozetler(degerlendir(d))[0]).toEqual({ ad: "Müfredat Uyumu", karar: "BLOCK" });
    expect(kapi(oyun(), "sema").notlar).toEqual([expect.stringMatching(/şemaya/)]);
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

    // Cevap soruda zaten geçiyorsa ipucunda geçmesi sızıntı değildir.
    const soruda = oyun((d) => {
      Object.assign(d.duraklar[2].gorev, { soru: "Galileo mu Newton mu?", secenekler: ["Newton", "Galileo"], dogru_cevap: "Galileo", ipucu_1: "Galileo'nun deneyini düşün." });
    });
    expect(kapi(soruda, "ogrenme-kalitesi").karar).toBe("PASS");

    const bos = oyun((d) => (d.duraklar[4].hikaye_metni = "  "));
    expect(kapi(bos, "oyun-kalitesi").bulgular[0]).toMatchObject({ kod: "hikaye-bos", karar: "REVIEW", durakId: "d5" });
    expect(degerlendir(bos).karar).toBe("REVIEW");
  });

  it("sayısal ipucu: cevabı veren sayı yakalanır; sıra sayısı, sorudaki sayı ve binlik ayracı yanlış alarm vermez", () => {
    expect(kapi(oyun((d) => sayisalGorev(d, { dogru_cevap: "9.8", ipucu_2: "Sonuç 9,8 çıkar." })), "ogrenme-kalitesi").bulgular[0]).toMatchObject({ kod: "ipucu-cevap" });
    expect(kapi(oyun((d) => sayisalGorev(d, { dogru_cevap: "12", ipucu_1: "Cevap 12." })), "ogrenme-kalitesi").karar).toBe("REVIEW");
    expect(kapi(oyun((d) => sayisalGorev(d, { dogru_cevap: "1000", ipucu_1: "Yaklaşık 1.000 kadar." })), "ogrenme-kalitesi").karar).toBe("REVIEW");
    expect(kapi(oyun((d) => sayisalGorev(d, { dogru_cevap: "2", ipucu_1: "Newton'un 2. yasasını kullan.", ipucu_2: "Kuvvetlerin 3.'sünü düşün." })), "ogrenme-kalitesi").karar).toBe("PASS");
    expect(kapi(oyun((d) => sayisalGorev(d, { dogru_cevap: "1", ipucu_1: "1.000 gramı kilograma çevir." })), "ogrenme-kalitesi").karar).toBe("PASS");
    expect(kapi(oyun((d) => sayisalGorev(d, { soru: "Kütlesi 2 kg olan cisme 4 N uygulanıyor; kütle kaç kg?", dogru_cevap: "2", ipucu_1: "2 kg'lık cismi düşün." })), "ogrenme-kalitesi").karar).toBe("PASS");
    expect(metindekiSayilar("Bu 2. yasa; 3,5 m; 1.250 kg; x2 değil; -4 derece.")).toEqual([3.5, 1250, -4]);
  });

  it("rozetler: REVIEW ve BLOCK doğru rozete ve Yayına Uygunluk'a yansır", () => {
    const s = degerlendir(oyun((d) => (d.duraklar[1].hikaye_metni = "Kumarhanenin önündesin.")));
    expect(rozetler(s)).toEqual(expect.arrayContaining([{ ad: "Çocuk Güvenliği", karar: "REVIEW" }, { ad: "Yayına Uygunluk", karar: "REVIEW" }, { ad: "Oyun Mantığı", karar: "PASS" }]));
    expect(rozetler(degerlendir(oyun((d) => (d.duraklar[4].hikaye_metni = ""))))).toContainEqual({ ad: "Oyun Mantığı", karar: "REVIEW" });
    const ikisi = degerlendir(oyun((d) => ((d.duraklar[4].hikaye_metni = ""), (d.duraklar[2].hikaye_metni = "Siktir."))));
    expect(ikisi.karar).toBe("BLOCK");
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
  const tek = (metin: string) => metinleriTara([{ metin, yer: "metin" }]);

  it("açık küfür ve müstehcenlik yayını engeller; bağlama bağlı ifade gözden geçirme ister", () => {
    expect(tara("Siktir git dedi.")).toEqual([expect.objectContaining({ kategori: "kufur", engel: true, terim: "siktir", durakId: "d3", yer: '"Rota A" durağı · hikâye' })]);
    expect(tek("porno sitesi")[0]).toMatchObject({ kategori: "cinsel", engel: true });
    expect(tek("Kahpe felek")[0]).toMatchObject({ kategori: "kufur", engel: false });
    expect(tara("Kumar masasına otur.")[0]).toMatchObject({ kategori: "kumar", engel: false });
    expect(tek("Bahis oynayalım")[0]).toMatchObject({ kategori: "kumar", terim: "bahis oynayalım" });
    expect(tek("Bu iksir eroindir.")[0]).toMatchObject({ kategori: "madde", engel: false });
    expect(tek("Telefon numaranı buraya yaz.")[0]).toMatchObject({ kategori: "kisisel-veri" });
    expect(tek("Kendine zarar verme oyunu.")[0]).toMatchObject({ kategori: "kendine-zarar" });
  });

  it("Türkçe büyük harf, ASCII I, şapkalı harf, ayrı yazım ve NFD ile eşleşir; mesajda metindeki asıl kelime görünür", () => {
    expect(tek("İNTİHAR mektubu")[0]).toMatchObject({ kategori: "kendine-zarar", terim: "intihar" });
    expect(tek("KUMARHANEYE gir")[0]).toMatchObject({ kategori: "kumar", terim: "kumarhaneye" });
    expect(tek("SIKTIR")[0]).toMatchObject({ kategori: "kufur", engel: true });
    expect(tek("Sen bir Gerizekâlısın")[0]).toMatchObject({ kategori: "zorbalik", terim: "gerizekâlısın" });
    expect(tek("geri zekalı çocuk")[0]).toMatchObject({ kategori: "zorbalik", terim: "geri zekalı" });
    expect(tek("Sarhos".normalize("NFD") + " ve " + "sarhoş".normalize("NFD"))[0]).toMatchObject({ kategori: "madde" });
  });

  it.each([
    "Kurtuluş Savaşı'nda cephane taşıyan kadınlar",
    "Bitkilerde eşeyli üreme ve cinsel hücreler",
    "Esrarengiz bir kapı açıldı; mağaranın esrar perdesi kalktı.",
    "Alkoller ve karboksilik asitler",
    "HCl(aq) + NaOH(aq) → NaCl(aq) + H2O(s)",
    "Şifreyi çöz ve kapıyı aç. Şifrenin ilk rakamı 4, parolanın son harfi K.",
    "Sevgili öğrenciler, bahçede buluşalım.",
    "Anahtar sözcük: seksen dört",
    "Londra Boğazlar Sözleşmesi imzalandı.",
    "Jüpiter çıplak gözle görülebilir; çıplak bakır tel kullan.",
    "İpi bıçakla kes.",
    "Bira mayası glikozu fermente eder; şarap sirkeye dönüşür.",
    "Bahis konusu olan antlaşma",
    "Ezik elmayı ayır.",
    "Hocalı Katliamı ve Engizisyon dönemi",
    "Acil durumda 112 telefon numarasını ara.",
    "İbn-i Sina ve amino asitler",
    "Rakım 1200 metre.",
    "Sigaranın zararlarını öğren.",
  ])("müfredat ve macera dili yanlış alarm vermez: %s", (metin) => {
    expect(tek(metin)).toEqual([]);
  });

  it("öğrencinin gördüğü tüm alanlar taranır ve alan adı mesajda yer alır", () => {
    expect(cocukGuvenligiTara(oyun((d) => (d.duraklar[0].gorev.secenekler = ["A", "rulet", "C"])))[0]).toMatchObject({ durakId: "d1", yer: '"Başlangıç" durağı · seçenekler' });
    expect(cocukGuvenligiTara(oyun((d) => (d.duraklar[1].secimler[0].metin = "Kumarhaneye git")))[0].yer).toBe('"Yol Ayrımı" durağı · seçimler');
    expect(cocukGuvenligiTara(oyun((d) => (d.duraklar[1].gorev.ipucu_2 = "Salak olma")))[0].yer).toBe('"Yol Ayrımı" durağı · ipuçları');
    expect(cocukGuvenligiTara(oyun((d) => (d.final.basari_metni = "Sarhoş kaptan kazandı")))[0].yer).toBe("Final · başarı metni");
    expect(cocukGuvenligiTara(oyun((d) => (d.meta.baslik = "Kumar Adası")))[0].yer).toBe("Oyun girişi · başlık");
  });

  it("klasik oyun durakları ve topluluk özeti yalnız engelleyen ifadeye bakar", () => {
    expect(klasikDurakEngelleri([{ qr: 3, name: "Liman", hikaye: "Siktir git." }])).toEqual([expect.objectContaining({ karar: "BLOCK", mesaj: expect.stringContaining("3. durak · hikâye") })]);
    expect(klasikDurakEngelleri([{ qr: 3, name: "Kumarhane", hikaye: "Rulet" }])).toEqual([]);
    expect(ozetEngelli({ baslik: "Orospu Adası", konu: "Kuvvet" })).toBe(true);
    expect(ozetEngelli({ baslik: "Kumar Adası", konu: "Kuvvet" })).toBe(false);
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
  const topluluk = async () => (await (await api.topluluk.GET(new Request("http://localhost/api/topluluk"))).json()).oyunlar as { baslik: string; oyun_id: string }[];

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

  it("kütüphaneden yayında da aynı kural: BLOCK 422, REVIEW 201 + yonetisim ve topluluğa gitmez", async () => {
    const kaydet = async (definition: GameDefinition) =>
      (await (await api.library.POST(cerezli(jsonRequest("/api/library", { definition, dersler })))).json()).id as string;
    const yayin = (id: string) => api.libraryPublish.POST(cerezli(jsonRequest(`/api/library/${id}/publish`, {})), api.idParams(id));

    const engelli = await yayin(await kaydet(oyun((d) => (d.duraklar[2].hikaye_metni = "Siktir git."))));
    expect(engelli.status).toBe(422);
    expect((await engelli.json()).yonetisim.karar).toBe("BLOCK");

    const inceleme = await yayin(await kaydet(oyun((d) => (d.duraklar[1].hikaye_metni = "Bahis oynayalım."))));
    expect(inceleme.status).toBe(201);
    expect((await inceleme.json()).yonetisim.karar).toBe("REVIEW");
    expect(await topluluk()).toEqual([]);
  });

  it("klasik (composer öncesi) yayında öğrenciye görünen durak metni engelliyse 422", async () => {
    const yayin = samplePublish();
    yayin.stops[1] = { ...yayin.stops[1], hikaye: "Siktir git buradan." };
    const res = await api.games.POST(jsonRequest("/api/games", yayin));
    expect(res.status).toBe(422);
    expect((await res.json()).bulgular[0].mesaj).toMatch(/durak · hikâye/);
    expect((await api.games.POST(jsonRequest("/api/games", samplePublish()))).status).toBe(201);
  });

  it("yönetişimden önce topluluğa girmiş engelli kayıt: listede görünmez, detayı 404 ve pasife alınır", async () => {
    const eski = oyun((d) => (d.meta.baslik = "Eski Oyun"));
    await yayinla(eski);
    const [kayit] = await topluluk();
    const store = api.toplulukStore.getToplulukStore();
    // Kaydın yönetişimden önce eklendiğini taklit et: içerik sonradan engelli hâle gelir.
    const tam = (await store.get(kayit.oyun_id))!;
    tam.definition.duraklar[2].hikaye_metni = "Siktir git.";
    const detay = await api.toplulukOyun.GET(cerezli(new Request(`http://localhost/api/topluluk/${kayit.oyun_id}`)), api.idParams(kayit.oyun_id));
    expect(detay.status).toBe(404);
    expect((await store.get(kayit.oyun_id))!.aktif).toBe(false);
    expect(await topluluk()).toEqual([]);
  });
});

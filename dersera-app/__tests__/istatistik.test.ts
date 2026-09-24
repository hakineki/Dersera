import { clearRedisEnv, recordingCommand } from "./helpers/fakeRedis";
import { buildApi, hesapAc, jsonRequest, katilVeBitir, toplulugaKoy } from "./helpers/api";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";
import { getUniteler } from "@/data/mufredat/programlar";
import { createRedisIstatistikStore } from "@/lib/istatistikStore";
import { createRedisToplulukStore } from "@/lib/toplulukStore";
import { BOS_PUAN_SAYACI, kovaliPuanEkle, PUAN_KOVASI } from "@/lib/istatistik";
import { enAzOyunMs, KOD_BASINA_EN_COK_OGRENCI } from "@/lib/istatistikService";

const fizik = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const dersler = [{ ders: "fizik", konuId: getUniteler(10, "fizik")[0].id }];
const oyun = (baslik: string) => {
  const d = makeDefinition(fizik, 8);
  d.meta.baslik = baslik;
  return d;
};
const ADLAR = ["Kartal", "Şahin", "Atmaca", "Doğan", "Kerkenez", "Baykuş", "Serçe", "Martı", "Leylek", "Turna", "Bülbül"];

describe("öğrenci puanı ve kütüphane istatistikleri", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  let ogretmen: string;
  beforeEach(async () => {
    clearRedisEnv();
    api = await buildApi();
    ogretmen = await hesapAc(api, "ogretmen1");
  });

  const cerezli = (req: Request, c: string) => (req.headers.set("cookie", c), req);
  // Kütüphaneye kaydeder ve aynı içeriği topluluğa (sahibi adına, yayında) koyar: yayın kodları içerik özetiyle o kayda bağlanır.
  const kaydet = async (baslik: string, c = ogretmen) => {
    const id = (await (await api.library.POST(cerezli(jsonRequest("/api/library", { definition: oyun(baslik), dersler }), c))).json()).id as string;
    const sahip = await api.libraryService.istekSahibi(cerezli(new Request("http://localhost/"), c));
    await toplulugaKoy(api, oyun(baslik), dersler, { olusturan: sahip! });
    return id;
  };
  const kutuphanedenYayinla = async (id: string, c = ogretmen) => {
    const res = await api.libraryPublish.POST(cerezli(jsonRequest(`/api/library/${id}/publish`, {}), c), api.idParams(id));
    expect(res.status).toBe(201);
    return (await res.json()).game.code as string;
  };
  const bitir = (kod: string, nickname: string, cerez: string | null = null) => katilVeBitir(api, kod, nickname, cerez);
  const puanVer = (kod: string, body: Record<string, unknown>, cerez?: string) => {
    const req = jsonRequest(`/api/games/${kod}/puan`, body);
    return api.puan.POST(cerez ? cerezli(req, cerez) : req, api.params(kod));
  };
  // Bitirip puan verir; durum kodunu döndürür.
  const bitirVePuanla = async (kod: string, nickname: string, puan: number) => (await puanVer(kod, { nickname, playerToken: await bitir(kod, nickname), puan })).status;
  const kutuphane = async (c = ogretmen) => (await (await api.library.GET(cerezli(new Request("http://localhost/api/library"), c))).json()).oyunlar;
  const topluluk = async () => (await (await api.topluluk.GET(new Request("http://localhost/api/topluluk"))).json()).oyunlar;

  it("öğrenci sayısı katılımla değil, oyunu bitirip sonucu kaydedilen öğrenciyle artar (farklı sınıf yayınları dahil)", async () => {
    const id = await kaydet("Hareket");
    const kod1 = await kutuphanedenYayinla(id);
    const kod2 = await kutuphanedenYayinla(id);
    expect((await api.join.POST(jsonRequest("/join", { nickname: "Yarım" }), api.params(kod1))).status).toBe(201);
    expect((await kutuphane())[0].ogrenci_sayisi).toBe(0);
    await bitir(kod1, "Kartal");
    await bitir(kod1, "Şahin");
    await bitir(kod2, "Atmaca");
    expect((await kutuphane())[0]).toMatchObject({ id, ogrenci_sayisi: 3 });
  });

  it("aynı öğrencinin sonucu tekrar gönderilse de bir kez sayılır", async () => {
    const kod = await kutuphanedenYayinla(await kaydet("Tekrar sonuç"));
    const playerToken = await bitir(kod, "Kartal");
    const sonuc = { nickname: "Kartal", netSeconds: 400, penaltySeconds: 0, hintsUsed: 0, completedAt: 1_790_000_000_000 };
    expect((await api.results.POST(jsonRequest("/api/results", { gameCode: kod, playerToken, result: sonuc }))).status).toBe(201);
    expect((await kutuphane())[0].ogrenci_sayisi).toBe(1);
  });

  it(`ortalama ve oy sayısı yalnız her ${PUAN_KOVASI} oyda bir güncellenir (k-anonimlik: fark tek puanı vermez)`, async () => {
    const id = await kaydet("Eşik");
    const kod = await kutuphanedenYayinla(id);
    const puanlar = [4, 4, 5, 4, 5, 1, 1, 1, 1, 1, 5];
    const oyla = async (i: number) => expect(await bitirVePuanla(kod, ADLAR[i], puanlar[i])).toBe(201);
    for (let i = 0; i < 4; i++) await oyla(i);
    expect((await kutuphane())[0]).toMatchObject({ ogrenci_sayisi: 4, puan_ortalama: null, puan_sayisi: 0 });
    expect((await topluluk())[0]).toMatchObject({ puan_ortalama: null, puan_sayisi: 0 });
    await oyla(4);
    expect((await kutuphane())[0]).toMatchObject({ ogrenci_sayisi: 5, puan_ortalama: 4.4, puan_sayisi: 5 });
    expect((await topluluk())[0]).toMatchObject({ oynanma_sayisi: 5, puan_ortalama: 4.4, puan_sayisi: 5 });
    // 6. öğrencinin (puan 1) oyu görünen değeri değiştirmez; öğretmen onun puanını çıkaramaz.
    await oyla(5);
    expect((await kutuphane())[0]).toMatchObject({ ogrenci_sayisi: 6, puan_ortalama: 4.4, puan_sayisi: 5 });
    expect((await topluluk())[0]).toMatchObject({ puan_ortalama: 4.4, puan_sayisi: 5 });
    for (let i = 6; i < 10; i++) await oyla(i);
    expect((await kutuphane())[0]).toMatchObject({ puan_ortalama: 2.7, puan_sayisi: 10 });
    expect((await topluluk())[0]).toMatchObject({ puan_ortalama: 2.7, puan_sayisi: 10 });
    await oyla(10);
    expect((await kutuphane())[0]).toMatchObject({ puan_ortalama: 2.7, puan_sayisi: 10 });
  });

  it("kova mantığı: anlık görüntü yalnız sayı kovanın katına gelince alınır", () => {
    let p = BOS_PUAN_SAYACI;
    for (const puan of [5, 5, 5, 5]) p = kovaliPuanEkle(p, puan);
    expect(p).toEqual({ toplam: 20, sayi: 4, gosterToplam: 0, gosterSayi: 0 });
    p = kovaliPuanEkle(p, 3);
    expect(p).toEqual({ toplam: 23, sayi: 5, gosterToplam: 23, gosterSayi: 5 });
    p = kovaliPuanEkle(p, 1);
    expect(p).toEqual({ toplam: 24, sayi: 6, gosterToplam: 23, gosterSayi: 5 });
  });

  it("oyunu bitirmeyen öğrenci puan veremez (403)", async () => {
    const kod = await kutuphanedenYayinla(await kaydet("Bitirmeden"));
    const katil = await api.join.POST(jsonRequest("/join", { nickname: "Kartal" }), api.params(kod));
    const playerToken = (await katil.json()).playerToken;
    const res = await puanVer(kod, { nickname: "Kartal", playerToken, puan: 5 });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/bitir/);
    expect((await kutuphane())[0].puan_sayisi).toBe(0);
  });

  it("aynı öğrenci ikinci kez puan veremez (409); toplamlar değişmez", async () => {
    const kod = await kutuphanedenYayinla(await kaydet("Tekrar"));
    const t = await bitir(kod, "Kartal");
    expect((await puanVer(kod, { nickname: "Kartal", playerToken: t, puan: 5 })).status).toBe(201);
    expect((await puanVer(kod, { nickname: "kartal", playerToken: t, puan: 1 })).status).toBe(409);
    // Tekrar sayılsaydı dördüncü öğrencide kova dolar ve ortalama farklı olurdu.
    for (let i = 1; i < 4; i++) await bitirVePuanla(kod, ADLAR[i], 1);
    expect((await kutuphane())[0]).toMatchObject({ puan_ortalama: null, puan_sayisi: 0 });
    await bitirVePuanla(kod, ADLAR[4], 1);
    expect((await kutuphane())[0]).toMatchObject({ puan_ortalama: 1.8, puan_sayisi: 5 });
  });

  it("öğretmenin kendi oturumuyla bitirdiği ve puanladığı oyun sayılmaz", async () => {
    const id = await kaydet("Kendi");
    const kod = await kutuphanedenYayinla(id);
    const t = await bitir(kod, "Öğretmen", ogretmen);
    expect((await puanVer(kod, { nickname: "Öğretmen", playerToken: t, puan: 5 }, ogretmen)).status).toBe(201);
    expect((await kutuphane())[0]).toMatchObject({ ogrenci_sayisi: 0 });
    expect((await topluluk())[0]).toMatchObject({ oynanma_sayisi: 0 });
    // Başka bir öğretmenin oturumu (ör. meslektaş sınıfta denedi) normal öğrenci gibi sayılır.
    const baska = await hesapAc(api, "ogretmen2");
    const t2 = await bitir(kod, "Misafir", baska);
    expect((await puanVer(kod, { nickname: "Misafir", playerToken: t2, puan: 3 }, baska)).status).toBe(201);
    for (let i = 0; i < 3; i++) await bitirVePuanla(kod, ADLAR[i], 3);
    // Sahibin oyu sayılsaydı burada 5 oy olurdu.
    expect((await kutuphane())[0]).toMatchObject({ ogrenci_sayisi: 4, puan_sayisi: 0 });
    expect((await topluluk())[0]).toMatchObject({ oynanma_sayisi: 4, puan_sayisi: 0 });
    await bitirVePuanla(kod, ADLAR[3], 3);
    expect((await kutuphane())[0]).toMatchObject({ ogrenci_sayisi: 5, puan_ortalama: 3, puan_sayisi: 5 });
  });

  it(`tek bir yayın kodu en çok ${KOD_BASINA_EN_COK_OGRENCI} öğrenci sayar; sınır dışı oylar toplamlara eklenmez`, async () => {
    const kod = await kutuphanedenYayinla(await kaydet("Sınır"));
    const tokenlar: string[] = [];
    for (let i = 0; i < KOD_BASINA_EN_COK_OGRENCI; i++) tokenlar.push(await bitir(kod, `Ogrenci${i}`));
    for (let i = 0; i < 4; i++) await puanVer(kod, { nickname: `Ogrenci${i}`, playerToken: tokenlar[i], puan: 5 });
    const fazla = await bitir(kod, "Fazladan");
    expect((await puanVer(kod, { nickname: "Fazladan", playerToken: fazla, puan: 1 })).status).toBe(201);
    // Sınır dışı oy sayılsaydı kova dolardı.
    expect((await kutuphane())[0]).toMatchObject({ ogrenci_sayisi: KOD_BASINA_EN_COK_OGRENCI, puan_sayisi: 0 });
    expect((await topluluk())[0].oynanma_sayisi).toBe(KOD_BASINA_EN_COK_OGRENCI);
  });

  it.each([
    ["sıfır", 0],
    ["altı", 6],
    ["ondalık", 3.5],
    ["metin", "5"],
    ["yok", undefined],
  ])("geçersiz puan 422: %s", async (_l, puan) => {
    const kod = await kutuphanedenYayinla(await kaydet("Geçersiz"));
    const t = await bitir(kod, "Kartal");
    expect((await puanVer(kod, { nickname: "Kartal", playerToken: t, puan })).status).toBe(422);
  });

  it("oyuncu anahtarı olmadan ya da başkasının adına puan verilemez; bilinmeyen oyun 404", async () => {
    const kod = await kutuphanedenYayinla(await kaydet("Yetki"));
    const t = await bitir(kod, "Kartal");
    await bitir(kod, "Şahin");
    expect((await puanVer(kod, { nickname: "Kartal", playerToken: "uydurma", puan: 5 })).status).toBe(403);
    expect((await puanVer(kod, { nickname: "Şahin", playerToken: t, puan: 5 })).status).toBe(403);
    expect((await puanVer(kod, { nickname: "Kartal", puan: 5 })).status).toBe(403);
    expect((await puanVer("ZZZ-999", { nickname: "Kartal", playerToken: t, puan: 5 })).status).toBe(404);
    expect((await kutuphane())[0].puan_sayisi).toBe(0);
  });

  it("composer'dan kütüphane oyunu yayınında kod bağlanır; başka öğretmenin kütüphane kimliği bağlanmaz", async () => {
    const id = await kaydet("Composer");
    const yayin = async (c: string, kutuphaneId: string) => {
      const res = await api.games.POST(cerezli(jsonRequest("/api/games", { composer: { definition: oyun("Composer"), dersler }, kutuphaneId }), c));
      return (await res.json()).game.code as string;
    };
    const kod = await yayin(ogretmen, id);
    await bitir(kod, "Kartal");
    expect((await kutuphane())[0].ogrenci_sayisi).toBe(1);
    const yabanci = await hesapAc(api, "ogretmen2");
    const kod2 = await yayin(yabanci, id);
    await bitir(kod2, "Şahin");
    expect((await kutuphane())[0].ogrenci_sayisi).toBe(1);
  });

  it("kütüphane kaydı silinince sayaçları da silinir", async () => {
    const id = await kaydet("Silinecek");
    const kod = await kutuphanedenYayinla(id);
    for (let i = 0; i < PUAN_KOVASI; i++) await bitirVePuanla(kod, ADLAR[i], 5);
    const sahip = await api.libraryService.istekSahibi(cerezli(new Request("http://localhost/"), ogretmen));
    const sayaclar = () => api.istatistikStore.getIstatistikStore().istatistikler([`${sahip}:${id}`]);
    expect(await sayaclar()).toEqual([{ ogrenci: 5, puanToplam: 25, puanSayisi: 5 }]);
    const sil = new Request(`http://localhost/api/library/${id}`, { method: "DELETE" });
    expect((await api.libraryItem.DELETE(cerezli(sil, ogretmen), api.idParams(id))).status).toBe(200);
    expect(await sayaclar()).toEqual([{ ogrenci: 0, puanToplam: 0, puanSayisi: 0 }]);
  });

  it("sonuç kaydında bitiriş yazılamadıysa, puan verirken kayıtlı sonuçtan kurtarılır", async () => {
    const kod = await kutuphanedenYayinla(await kaydet("Kurtarma"));
    const store = api.istatistikStore.getIstatistikStore();
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    const spy = jest.spyOn(store, "bitirenKaydet").mockRejectedValueOnce(new Error("redis kapalı"));
    const t = await bitir(kod, "Kartal");
    expect((await kutuphane())[0].ogrenci_sayisi).toBe(0);
    expect((await puanVer(kod, { nickname: "Kartal", playerToken: t, puan: 4 })).status).toBe(201);
    expect((await kutuphane())[0].ogrenci_sayisi).toBe(1);
    spy.mockRestore();
    err.mockRestore();
  });

  it("oyuncu özeti koda göre tuzlanır: takma ad saklanmaz, farklı oyunlarda eşleşmez", async () => {
    const id = await kaydet("Tuz");
    const kod1 = await kutuphanedenYayinla(id);
    const kod2 = await kutuphanedenYayinla(id);
    const spy = jest.spyOn(api.istatistikStore.getIstatistikStore(), "bitirenKaydet");
    await bitir(kod1, "Kartal");
    await bitir(kod2, "Kartal");
    const [o1, o2] = spy.mock.calls.map((c) => c[1]);
    expect(o1).toMatch(/^[0-9a-f]{64}$/);
    expect(o1).not.toBe(o2);
    spy.mockRestore();
  });

  it("tek tek puanlar ve takma adlar hiçbir yanıtta yer almaz; 'Oyunu Kullan' detayı saklı puan alanı vermez", async () => {
    const kod = await kutuphanedenYayinla(await kaydet("Gizlilik"));
    await bitirVePuanla(kod, "GizliKartal", 1);
    const yanitlar = JSON.stringify(await kutuphane()) + JSON.stringify(await topluluk());
    expect(yanitlar).not.toMatch(/GizliKartal|gizlikartal/);
    const [o] = await topluluk();
    const detay = await (await api.toplulukOyun.GET(cerezli(new Request(`http://localhost/api/topluluk/${o.oyun_id}`), ogretmen), api.idParams(o.oyun_id))).json();
    expect(detay.oyun).not.toHaveProperty("puan_ortalama");
    expect(detay.oyun).not.toHaveProperty("puan_sayisi");
  });

  it("istatistik deposu hata verirse liste yine gelir (sıfırlarla), sonuç kaydı bozulmaz, puan 503 döner", async () => {
    const kod = await kutuphanedenYayinla(await kaydet("Hata"));
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    const spy = jest.spyOn(api.istatistikStore, "getIstatistikStore").mockImplementation(() => {
      throw new Error("redis kapalı");
    });
    const t = await bitir(kod, "Kartal");
    expect((await puanVer(kod, { nickname: "Kartal", playerToken: t, puan: 5 })).status).toBe(503);
    expect((await kutuphane())[0]).toMatchObject({ ogrenci_sayisi: 0, puan_ortalama: null });
    spy.mockRestore();
    err.mockRestore();
  });

  it("topluluk deposu puan eklerken hata verirse öğrencinin puanı yine kaydedilir", async () => {
    const kod = await kutuphanedenYayinla(await kaydet("Topluluk hatası"));
    const t = await bitir(kod, "Kartal");
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    const store = api.toplulukStore.getToplulukStore();
    const spy = jest.spyOn(store, "puanEkle").mockRejectedValue(new Error("redis kapalı"));
    expect((await puanVer(kod, { nickname: "Kartal", playerToken: t, puan: 4 })).status).toBe(201);
    expect((await puanVer(kod, { nickname: "Kartal", playerToken: t, puan: 4 })).status).toBe(409); // oy kaydedilmiş
    spy.mockRestore();
    err.mockRestore();
  });
});

describe("en kısa oynama süresi", () => {
  it("oyun süresinin dörtte biri, en az 2 dakika; ortam değişkeni geçersiz kılar", () => {
    const eski = process.env.DERSERA_EN_AZ_OYUN_SN;
    delete process.env.DERSERA_EN_AZ_OYUN_SN;
    try {
      expect(enAzOyunMs(40)).toBe(10 * 60 * 1000);
      expect(enAzOyunMs(20)).toBe(5 * 60 * 1000);
      expect(enAzOyunMs(null)).toBe(2 * 60 * 1000);
      expect(enAzOyunMs(4)).toBe(2 * 60 * 1000);
      process.env.DERSERA_EN_AZ_OYUN_SN = "30";
      expect(enAzOyunMs(60)).toBe(30 * 1000);
    } finally {
      process.env.DERSERA_EN_AZ_OYUN_SN = eski;
    }
  });
});

describe("Redis istatistik deposu", () => {
  it("bitiriş ve oy tek betikte yazılır; oyuncu özeti saklanır, puan değeri saklanmaz; liste tek MGET", async () => {
    const { command, calls } = recordingCommand((a) => (a[0] === "EVAL" ? 1 : a[0] === "HGET" ? "1" : a[0] === "MGET" ? ["3", "11", "3"] : "OK"));
    const s = createRedisIstatistikStore(command);
    const oyuncu = "a".repeat(64);
    expect(await s.bitirenKaydet("ABC-123", oyuncu, "hesap:x:k1", true, 60, 5000)).toBe("yeni-sayildi");
    expect(calls[0].slice(2)).toEqual(["2", "dersera:istatistik:bitiren:ABC-123", "dersera:istatistik:kutuphane:hesap:x:k1:ogrenci", oyuncu, "5000", "60", "1", "1"]);
    expect(await s.bitirisDurumu("ABC-123", oyuncu)).toBe("sayildi");
    expect(calls[1]).toEqual(["HGET", "dersera:istatistik:bitiren:ABC-123", oyuncu]);
    expect(await s.puanKaydet("ABC-123", oyuncu, "hesap:x:k1", 4, true, 5000)).toBe(true);
    expect(calls[2][1]).toContain("MSET");
    expect(calls[2].slice(2)).toEqual([
      "5",
      "dersera:istatistik:oy:ABC-123",
      "dersera:istatistik:kutuphane:hesap:x:k1:puanToplam",
      "dersera:istatistik:kutuphane:hesap:x:k1:puanSayisi",
      "dersera:istatistik:kutuphane:hesap:x:k1:puanToplamGoster",
      "dersera:istatistik:kutuphane:hesap:x:k1:puanSayisiGoster",
      oyuncu,
      "5000",
      "1",
      "4",
      String(PUAN_KOVASI),
    ]);
    // Tek bir EVAL: oy kaydı ile toplamlar ayrı ayrı yazılmaz.
    expect(calls.filter((c) => c[0] === "INCRBY" || c[0] === "INCR" || c[0] === "HSETNX")).toEqual([]);
    expect(await s.istatistikler(["hesap:x:k1"])).toEqual([{ ogrenci: 3, puanToplam: 11, puanSayisi: 3 }]);
    // Liste yalnız anlık görüntüyü okur; canlı sayaçlar dışarı çıkmaz.
    expect(calls.at(-1)).toEqual([
      "MGET",
      "dersera:istatistik:kutuphane:hesap:x:k1:ogrenci",
      "dersera:istatistik:kutuphane:hesap:x:k1:puanToplamGoster",
      "dersera:istatistik:kutuphane:hesap:x:k1:puanSayisiGoster",
    ]);
    await s.sil("hesap:x:k1");
    expect(calls.at(-1)).toEqual([
      "DEL",
      "dersera:istatistik:kutuphane:hesap:x:k1:ogrenci",
      "dersera:istatistik:kutuphane:hesap:x:k1:puanToplam",
      "dersera:istatistik:kutuphane:hesap:x:k1:puanSayisi",
      "dersera:istatistik:kutuphane:hesap:x:k1:puanToplamGoster",
      "dersera:istatistik:kutuphane:hesap:x:k1:puanSayisiGoster",
    ]);
  });

  it("çok sayıda kaynak parçalı MGET ile okunur; sıra korunur", async () => {
    // Her MGET yanıtı kaynak başına [ogrenci, puanToplam, puanSayisi]; ogrenci = kaynağın sırası.
    const { command, calls } = recordingCommand((a) => a.slice(1).map((k, i) => (i % 3 === 0 ? /:k(\d+):/.exec(k)![1] : "0")));
    const s = createRedisIstatistikStore(command);
    const kaynaklar = Array.from({ length: 1201 }, (_, i) => `hesap:x:k${i}`);
    const ist = await s.istatistikler(kaynaklar);
    expect(calls.map((c) => c.length - 1)).toEqual([1500, 1500, 603]);
    expect(ist.map((x) => x.ogrenci)).toEqual(kaynaklar.map((_, i) => i));
  });

  it("topluluk puanı tek betikte kovalı yazılır; oluşturan küçük anahtardan okunur, yoksa kayıttan bir kez doldurulur", async () => {
    let olusturan: string | null = null;
    const { command, calls } = recordingCommand((a) =>
      a[0] === "GET" && a[1].includes(":olusturan:") ? olusturan : a[0] === "GET" ? JSON.stringify({ olusturan: "hesap:x" }) : 1
    );
    const s = createRedisToplulukStore(command);
    await s.puanEkle("oyun1", 4);
    expect(calls[0][1]).toContain("MSET");
    expect(calls[0].slice(2)).toEqual([
      "4",
      "dersera:topluluk:puan-toplam:oyun1",
      "dersera:topluluk:puan-sayisi:oyun1",
      "dersera:topluluk:puan-toplam-goster:oyun1",
      "dersera:topluluk:puan-sayisi-goster:oyun1",
      "4",
      String(PUAN_KOVASI),
    ]);
    expect(await s.olusturani("oyun1")).toBe("hesap:x");
    expect(calls.at(-1)).toEqual(["SET", "dersera:topluluk:olusturan:oyun1", "hesap:x"]);
    olusturan = "hesap:x";
    const once = calls.length;
    expect(await s.olusturani("oyun1")).toBe("hesap:x");
    expect(calls.slice(once)).toEqual([["GET", "dersera:topluluk:olusturan:oyun1"]]);
  });

  it("betik dönüşleri doğru eşlenir: 0 zaten, 2 sayılmadı; HGET '0' sayılmadı, null yok", async () => {
    let evalYaniti = 0;
    let hget: string | null = "0";
    const { command } = recordingCommand((a) => (a[0] === "EVAL" ? evalYaniti : a[0] === "HGET" ? hget : "OK"));
    const s = createRedisIstatistikStore(command);
    expect(await s.bitirenKaydet("ABC-123", "o", null, true, 60, 5000)).toBe("zaten");
    evalYaniti = 2;
    expect(await s.bitirenKaydet("ABC-123", "o", null, true, 60, 5000)).toBe("yeni-sayilmadi");
    expect(await s.bitirisDurumu("ABC-123", "o")).toBe("sayilmadi");
    hget = null;
    expect(await s.bitirisDurumu("ABC-123", "o")).toBe("yok");
    evalYaniti = 0;
    expect(await s.puanKaydet("ABC-123", "o", null, 3, true, 5000)).toBe(false);
  });
});

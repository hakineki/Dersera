import { clearRedisEnv, recordingCommand } from "./helpers/fakeRedis";
import { buildApi, hesapAc, jsonRequest, katilVeBitir, toplulugaKoy } from "./helpers/api";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";
import { getUniteler } from "@/data/mufredat/programlar";
import type { GameDefinition } from "@/lib/composer/definition";
import { TOPLULUK_KURALLARI as K } from "@/lib/topluluk";
import { createRedisToplulukStore } from "@/lib/toplulukStore";

const girdi = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const dersler = [{ ders: "fizik", konuId: getUniteler(10, "fizik")[0].id }];
const oyun = (baslik = "Topluluk Oyunu") => {
  const d = makeDefinition(girdi, 8);
  d.meta.baslik = baslik;
  return d;
};

describe("öğretmen puanı", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  let sahip: string;
  let d: GameDefinition;
  let id: string;
  beforeEach(async () => {
    clearRedisEnv();
    api = await buildApi();
    sahip = await hesapAc(api, "sahip1");
    d = oyun();
    id = await toplulugaKoy(api, d, dersler, { olusturan: await sahipOf(sahip) });
  });

  const cerezli = (req: Request, c: string) => (req.headers.set("cookie", c), req);
  function sahipOf(c: string) {
    return api.libraryService.istekSahibi(cerezli(new Request("http://localhost/"), c)) as Promise<string>;
  }
  const yayinla = async (c: string, def = d) => {
    const res = await api.games.POST(cerezli(jsonRequest("/api/games", { composer: { definition: def, dersler } }), c));
    expect(res.status).toBe(201);
    return (await res.json()).game.code as string;
  };
  // Öğretmen oyunu sınıfında oynatır: yayınlar ve n öğrenci bitirir.
  const oynat = async (c: string, n: number, def = d) => {
    const kod = await yayinla(c, def);
    for (let i = 0; i < n; i++) await katilVeBitir(api, kod, `Ogrenci${i}`);
  };
  const durum = async (c: string, oyunId = id) => api.toplulukOgretmenPuani.GET(cerezli(new Request(`http://localhost/api/topluluk/${oyunId}/ogretmen-puani`), c), api.idParams(oyunId));
  const ver = (c: string, puan: unknown, oyunId = id) => api.toplulukOgretmenPuani.POST(cerezli(jsonRequest(`/api/topluluk/${oyunId}/ogretmen-puani`, { puan }), c), api.idParams(oyunId));
  const liste = async () => (await (await api.topluluk.GET(new Request("http://localhost/api/topluluk"))).json()).oyunlar;

  it(`yalnız oyunu sınıfında oynatan öğretmen puanlar (en az ${K.ogretmenPuaniEnAzOgrenci} öğrenci bitirmeli)`, async () => {
    const t = await hesapAc(api, "ogretmen1");
    await oynat(t, K.ogretmenPuaniEnAzOgrenci - 1);
    const once = await (await durum(t)).json();
    expect(once).toMatchObject({ uygun: false, benim: null, sayi: 0, ortalama: null });
    expect(once.neden).toMatch(new RegExp(`şu an ${K.ogretmenPuaniEnAzOgrenci - 1}`));
    expect((await ver(t, 4)).status).toBe(403);
    const kod = await yayinla(t);
    await katilVeBitir(api, kod, "Son");
    expect(await (await durum(t)).json()).toMatchObject({ uygun: true });
    expect(await (await ver(t, 4)).json()).toMatchObject({ benim: 4, sayi: 1, ortalama: null });
    // Güncelleme: sayı artmaz, toplam farkla değişir.
    expect(await (await ver(t, 2)).json()).toMatchObject({ benim: 2, sayi: 1 });
  });

  it(`ortalama en az ${K.ogretmenPuaniGosterim} öğretmen puanlayınca görünür; topluluk listesinde de`, async () => {
    const puanlar = [5, 4, 3];
    for (const [i, p] of puanlar.entries()) {
      const t = await hesapAc(api, `ogretmen${i}`);
      await oynat(t, K.ogretmenPuaniEnAzOgrenci);
      await ver(t, p);
    }
    const t0 = await hesapAc(api, "okuyan1");
    expect(await (await durum(t0)).json()).toMatchObject({ ortalama: 4, sayi: 3, benim: null, uygun: false });
    expect((await liste())[0]).toMatchObject({ ogretmen_puan_ortalama: 4, ogretmen_puan_sayisi: 3 });
  });

  it("oyunun sahibi puanlayamaz; kendi sınıfındaki bitirişler öğretmen kullanımına sayılmaz", async () => {
    await oynat(sahip, K.ogretmenPuaniEnAzOgrenci);
    const r = await ver(sahip, 5);
    expect(r.status).toBe(403);
    expect((await r.json()).error).toMatch(/Kendi oyununu/);
    const kullanim = await api.toplulukStore.getToplulukStore().ogretmenKullanimi(id, await sahipOf(sahip));
    expect(kullanim).toBe(0);
  });

  it("farklı içerikli (düzenlenmiş) oyunun yayını bu kayda sayılmaz; öğretmene nedeni söylenir", async () => {
    const t = await hesapAc(api, "ogretmen1");
    const baska = oyun("Düzenlenmiş kopya");
    await oynat(t, K.ogretmenPuaniEnAzOgrenci, baska);
    const d = await (await durum(t)).json();
    expect(d).toMatchObject({ uygun: false });
    expect(d.neden).toMatch(/değiştirmeden.*Düzenlediğin kopyaların sonuçları bu oyuna sayılmaz/);
  });

  it("yayınlayanın kendi oturumundan gelen bitirişler onun puan hakkına sayılmaz", async () => {
    const t = await hesapAc(api, "ogretmen1");
    const kod = await yayinla(t);
    for (let i = 0; i < K.ogretmenPuaniEnAzOgrenci; i++) await katilVeBitir(api, kod, `Kendim${i}`, t);
    expect(await (await durum(t)).json()).toMatchObject({ uygun: false });
  });

  it("sahte bitirişe karşı: katılımdan hemen sonra gelen bitiriş sayılmaz, yeterli süre sonra gelen sayılır", async () => {
    process.env.DERSERA_EN_AZ_OYUN_SN = "600";
    try {
      const t = await hesapAc(api, "ogretmen1");
      const kod = await yayinla(t);
      for (let i = 0; i < K.ogretmenPuaniEnAzOgrenci; i++) await katilVeBitir(api, kod, `Hizli${i}`);
      expect(await (await durum(t)).json()).toMatchObject({ uygun: false });
      expect((await liste())[0].oynanma_sayisi).toBe(0);
      // Katılım şimdi, sonuç 11 dakika sonra.
      const tokenlar: string[] = [];
      for (let i = 0; i < K.ogretmenPuaniEnAzOgrenci; i++) {
        const r = await api.join.POST(jsonRequest("/join", { nickname: `Gercek${i}` }), api.params(kod));
        tokenlar.push((await r.json()).playerToken);
      }
      const ileri = Date.now() + 11 * 60 * 1000;
      const spy = jest.spyOn(Date, "now").mockReturnValue(ileri);
      for (const [i, playerToken] of tokenlar.entries()) {
        const sonuc = { nickname: `Gercek${i}`, netSeconds: 600, penaltySeconds: 0, hintsUsed: 0, completedAt: ileri };
        expect((await api.results.POST(jsonRequest("/api/results", { gameCode: kod, playerToken, result: sonuc }))).status).toBe(201);
      }
      spy.mockRestore();
      expect(await (await durum(t)).json()).toMatchObject({ uygun: true });
      expect((await liste())[0].oynanma_sayisi).toBe(K.ogretmenPuaniEnAzOgrenci);
    } finally {
      process.env.DERSERA_EN_AZ_OYUN_SN = "0";
    }
  });

  it("geçersiz puan 422; toplulukta olmayan kayıt 404; oturumsuz 401", async () => {
    const t = await hesapAc(api, "ogretmen1");
    await oynat(t, K.ogretmenPuaniEnAzOgrenci);
    for (const p of [0, 6, 3.5, "4", null]) expect((await ver(t, p)).status).toBe(422);
    const yok = "00000000-0000-4000-8000-000000000000";
    expect((await durum(t, yok)).status).toBe(404);
    expect((await ver(t, 4, yok)).status).toBe(404);
    expect((await durum(t, "bozuk")).status).toBe(404);
    await api.toplulukStore.getToplulukStore().durumGecis(id, ["yayinda"], "geri-cekildi", "yayinda");
    expect((await ver(t, 4)).status).toBe(404);
    expect((await api.toplulukOgretmenPuani.GET(new Request(`http://localhost/api/topluluk/${id}/ogretmen-puani`), api.idParams(id))).status).toBe(401);
  });

  it("Oyunu Kullan kopyası kütüphaneye topluluk kaynağıyla kaydedilir; sürüm kaydında korunur; geçersiz kimlik yok sayılır", async () => {
    const t = await hesapAc(api, "ogretmen1");
    const kaydet = async (toplulukId: unknown) =>
      (await (await api.library.POST(cerezli(jsonRequest("/api/library", { definition: d, dersler, toplulukId }), t))).json()).id as string;
    const k1 = await kaydet(id);
    const k2 = await kaydet("bozuk");
    const k3 = await kaydet("00000000-0000-4000-8000-000000000000");
    const liste1 = await (await api.library.GET(cerezli(new Request("http://localhost/api/library"), t))).json();
    expect(liste1.oyunlar.find((o: { id: string }) => o.id === k1).topluluk_kaynagi).toBe(id);
    expect(liste1.oyunlar.find((o: { id: string }) => o.id === k2).topluluk_kaynagi).toBeNull();
    // Biçimi doğru ama toplulukta olmayan kimlik yazılmaz.
    expect(liste1.oyunlar.find((o: { id: string }) => o.id === k3).topluluk_kaynagi).toBeNull();
    const y = JSON.parse(JSON.stringify(d)) as GameDefinition;
    y.duraklar[0].gorev.soru = "Değişti";
    const put = new Request(`http://localhost/api/library/${k1}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ definition: y }) });
    expect((await api.libraryItem.PUT(cerezli(put, t), api.idParams(k1))).status).toBe(200);
    const liste2 = await (await api.library.GET(cerezli(new Request("http://localhost/api/library"), t))).json();
    expect(liste2.oyunlar.find((o: { id: string }) => o.id === k1)).toMatchObject({ topluluk_kaynagi: id, surum: 2 });
  });
});

describe("Redis: öğretmen puanı", () => {
  it("puan tek betikte: güncellemede fark eklenir; özet MGET; liste özeti öğretmen sayaçlarını da okur", async () => {
    const { command, calls } = recordingCommand((a) => (a[0] === "MGET" ? ["12", "3"] : a[0] === "HGET" ? "4" : 1));
    const s = createRedisToplulukStore(command);
    await s.ogretmenPuanla("oyun1", "hesap:a", 5);
    expect(calls[0][1]).toContain("if eski then");
    expect(calls[0].slice(2)).toEqual(["3", "dersera:topluluk:ogretmen-puan:oyun1", "dersera:topluluk:ogretmen-puan-toplam:oyun1", "dersera:topluluk:ogretmen-puan-sayi:oyun1", "hesap:a", "5"]);
    expect(await s.ogretmenPuanOzeti("oyun1")).toEqual({ toplam: 12, sayi: 3 });
    expect(await s.ogretmenPuani("oyun1", "hesap:a")).toBe(4);
    await s.ogretmenKullanimArtir("oyun1", "hesap:a");
    expect(calls.at(-1)).toEqual(["HINCRBY", "dersera:topluluk:ogretmen-kullanim:oyun1", "hesap:a", "1"]);
    await s.kodYayinlayanBagla("ABC-123", "hesap:a", 5000);
    expect(calls.at(-1)).toEqual(["SET", "dersera:topluluk:kod-yayinlayan:ABC-123", "hesap:a", "PX", "5000"]);
  });
});

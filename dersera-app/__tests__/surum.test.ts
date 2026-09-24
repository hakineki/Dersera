import { clearRedisEnv } from "./helpers/fakeRedis";
import { buildApi, hesapAc, jsonRequest } from "./helpers/api";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";
import { getUniteler } from "@/data/mufredat/programlar";
import type { GameDefinition } from "@/lib/composer/definition";
import { degisimOrani, parmakizi, surumKarari, VARYANT_ESIGI } from "@/lib/surum";

const girdi = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const dersler = [{ ders: "fizik", konuId: getUniteler(10, "fizik")[0].id }];
const oyun = () => makeDefinition(girdi, 8);
const kopya = (d: GameDefinition) => JSON.parse(JSON.stringify(d)) as GameDefinition;
// n durağın sorusunu değiştirir.
const degistir = (d: GameDefinition, n: number) => {
  const y = kopya(d);
  for (let i = 0; i < n; i++) y.duraklar[i].gorev.soru = `Yeni soru ${i}`;
  return y;
};

describe("sürüm kararı (saf)", () => {
  const oran = (a: GameDefinition, b: GameDefinition) => degisimOrani(parmakizi(a), parmakizi(b));

  it("değişim oranı: giriş + envanter + final + her durak; duraklar içerikçe eşleşir", () => {
    const d = oyun();
    expect(oran(d, kopya(d))).toBe(0);
    expect(oran(d, degistir(d, 1))).toBeCloseTo(1 / 11);
    const baslik = kopya(d);
    baslik.meta.baslik = "Yeni başlık";
    expect(oran(d, baslik)).toBeCloseTo(1 / 11);
    // Son durak silinince bir önceki durağın rotası da değişir (finale bağlanır): 2 birim.
    const eksik = kopya(d);
    eksik.duraklar.pop();
    expect(oran(d, eksik)).toBeCloseTo(2 / 11);
    // Bir durağın içeriğini düzenlemek ona giden durakları değişmiş göstermez.
    const orta = kopya(d);
    orta.duraklar[4].gorev.soru = "Orta durak yeni soru";
    expect(oran(d, orta)).toBeCloseTo(1 / 11);
  });

  it("rota değişikliği içerik aynı kalsa da değişim sayılır; nesne kimlikleri yeniden adlandırılınca sayılmaz", () => {
    const d = oyun();
    const rota = kopya(d);
    // Seçim sahnesinin iki rotası yer değiştirir: durak metinleri aynı, dallanma farklı.
    const secim = rota.duraklar.find((x) => x.secimler.length >= 2)!;
    [secim.secimler[0].hedef_durak_id, secim.secimler[1].hedef_durak_id] = [secim.secimler[1].hedef_durak_id, secim.secimler[0].hedef_durak_id];
    expect(oran(d, rota)).toBeCloseTo(1 / 11);
    const nesne = kopya(d);
    const yeni = (id: string) => `z-${id}`;
    nesne.envanter.forEach((e) => (e.id = yeni(e.id)));
    nesne.duraklar.forEach((x) => {
      if (x.gorev.odul_id) x.gorev.odul_id = yeni(x.gorev.odul_id);
    });
    nesne.final.gerekli_nesneler = nesne.final.gerekli_nesneler.map(yeni);
    expect(oran(d, nesne)).toBe(0);
  });

  it("durak kimlikleri yeniden numaralansa da içerik aynıysa değişim sıfırdır", () => {
    const d = oyun();
    const y = kopya(d);
    const yeniId = (id: string) => `x-${id}`;
    for (const durak of y.duraklar) {
      durak.id = yeniId(durak.id);
      durak.secimler.forEach((c) => (c.hedef_durak_id = yeniId(c.hedef_durak_id)));
      if (durak.varsayilan_sonraki_durak_id) durak.varsayilan_sonraki_durak_id = yeniId(durak.varsayilan_sonraki_durak_id);
    }
    expect(oran(d, y)).toBe(0);
    // Kimlikler değiştiği için içerik aynı olsa da kayıt yeni sürümdür (aynı değil).
    expect(surumKarari(d, y, parmakizi(d))).toEqual({ tur: "surum", oran: 0 });
  });

  it(`tabana göre en çok %${VARYANT_ESIGI * 100} değişiklik yeni sürüm, fazlası varyant; kimlik değişikliği varyant; değişmezse aynı`, () => {
    const d = oyun();
    const taban = parmakizi(d);
    expect(surumKarari(d, kopya(d), taban)).toEqual({ tur: "ayni" });
    expect(surumKarari(d, degistir(d, 3), taban)).toMatchObject({ tur: "surum" }); // 3/11 ≈ %27
    expect(surumKarari(d, degistir(d, 4), taban)).toMatchObject({ tur: "varyant", neden: "oran" }); // 4/11 ≈ %36
    const alan = kopya(d);
    alan.meta.alan = "okul";
    expect(surumKarari(d, alan, taban)).toMatchObject({ tur: "varyant", neden: "kimlik" });
    const konu = kopya(d);
    konu.meta.konu = "Başka konu";
    expect(surumKarari(d, konu, taban)).toMatchObject({ tur: "varyant", neden: "kimlik" });
  });

  it("art arda küçük değişiklikler tabana göre birikir: eşik aşılınca varyant", () => {
    const d = oyun();
    const taban = parmakizi(d);
    const a = degistir(d, 3);
    expect(surumKarari(d, a, taban)).toMatchObject({ tur: "surum" });
    const b = kopya(a);
    b.duraklar[5].gorev.soru = "Başka soru";
    // Son kayda göre yalnız 1/11, tabana göre 4/11.
    expect(surumKarari(a, b, taban)).toMatchObject({ tur: "varyant", neden: "oran" });
  });
});

describe("kütüphanede sürümleme", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  let cerez: string;
  beforeEach(async () => {
    clearRedisEnv();
    api = await buildApi();
    cerez = await hesapAc(api, "ogretmen1");
  });
  const cerezli = (req: Request) => (req.headers.set("cookie", cerez), req);
  const kaydet = async (d: GameDefinition) => (await (await api.library.POST(cerezli(jsonRequest("/api/library", { definition: d, dersler })))).json()).id as string;
  const guncelle = async (id: string, d: GameDefinition, surum?: number) => {
    const put = new Request(`http://localhost/api/library/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ definition: d, surum }) });
    return api.libraryItem.PUT(cerezli(put), api.idParams(id));
  };
  const liste = async () => (await (await api.library.GET(cerezli(new Request("http://localhost/api/library")))).json()).oyunlar as { id: string; baslik: string; surum?: number; soy_id?: string; turetildigi?: { id: string; baslik: string } | null }[];

  it("küçük değişiklik aynı oyunun sürümünü artırır; değişmeyen kayıt sürüm artırmaz", async () => {
    const d = oyun();
    const id = await kaydet(d);
    expect((await liste())[0]).toMatchObject({ id });
    const ayni = await (await guncelle(id, kopya(d))).json();
    expect(ayni).toMatchObject({ id, surum: { tur: "ayni", surum: 1 } });
    const r = await (await guncelle(id, degistir(d, 2))).json();
    expect(r).toMatchObject({ id, surum: { tur: "surum", surum: 2 } });
    const r3 = await (await guncelle(id, degistir(degistir(d, 2), 3))).json();
    expect(r3.surum.surum).toBe(3);
    expect(await liste()).toEqual([expect.objectContaining({ id, surum: 3, soy_id: id, turetildigi: null })]);
  });

  it("büyük değişiklik yeni varyant açar; özgün oyun olduğu gibi kalır", async () => {
    const d = oyun();
    d.meta.baslik = "Özgün";
    const id = await kaydet(d);
    const buyuk = degistir(d, 5);
    buyuk.meta.baslik = "Uyarlama";
    const res = await guncelle(id, buyuk);
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.id).not.toBe(id);
    expect(r.surum).toMatchObject({ tur: "varyant", surum: 1, neden: "oran" });
    const l = await liste();
    expect(l.find((o) => o.id === id)).toMatchObject({ baslik: "Özgün" });
    expect(l.find((o) => o.id === r.id)).toMatchObject({ baslik: "Uyarlama", surum: 1, soy_id: id, turetildigi: { id, baslik: "Özgün" } });
  });

  it("eski sekmeden (daha eski sürümden) gelen kayıt yeni sürümü ezmez: 409", async () => {
    const d = oyun();
    const id = await kaydet(d);
    expect((await guncelle(id, degistir(d, 1), 1)).status).toBe(200);
    const eski = await guncelle(id, degistir(d, 2), 1);
    expect(eski.status).toBe(409);
    expect((await eski.json()).error).toMatch(/daha yeni bir sürüm/);
    expect((await guncelle(id, degistir(d, 2), 2)).status).toBe(200);
  });

  it("aynı sürümden eşzamanlı iki kayıt: biri yazılır, diğeri 409 (sessiz veri kaybı yok)", async () => {
    const d = oyun();
    const id = await kaydet(d);
    const sonuc = await Promise.all([guncelle(id, degistir(d, 1), 1), guncelle(id, degistir(d, 2), 1)]);
    expect(sonuc.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await liste())[0].surum).toBe(2);
  });

  it("kayıt okunduktan sonra silinirse düzenleme onu geri getirmez", async () => {
    const d = oyun();
    const id = await kaydet(d);
    const store = api.libraryStore.getLibraryStore();
    const get = jest.spyOn(store, "get");
    get.mockImplementationOnce(async (o, i) => {
      const k = (await store.list(o)).find((x) => x.id === i) ?? null;
      await store.remove(o, i);
      return k;
    });
    expect((await guncelle(id, degistir(d, 1))).status).toBe(404);
    get.mockRestore();
    expect(await liste()).toEqual([]);
  });

  it("liste yanıtı sürüm tabanını (iç iz) taşımaz", async () => {
    await kaydet(oyun());
    expect(JSON.stringify(await liste())).not.toContain("taban");
  });

  it("kütüphane doluysa varyant açılmaz (409), özgün oyun değişmez", async () => {
    const d = oyun();
    const id = await kaydet(d);
    const store = api.libraryStore.getLibraryStore();
    jest.spyOn(store, "count").mockResolvedValue(50);
    const res = await guncelle(id, degistir(d, 6));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/varyant.*dolu/);
    jest.restoreAllMocks();
    expect((await liste())).toHaveLength(1);
  });

  it("eski kayıt (sürüm alanı yok) sürüm 1 sayılır", async () => {
    const d = oyun();
    const id = await kaydet(d);
    const store = api.libraryStore.getLibraryStore();
    const sahip = (await api.libraryService.istekSahibi(cerezli(new Request("http://localhost/"))))!;
    const k = (await store.get(sahip, id))!;
    delete k.surum;
    delete k.soy_id;
    delete k.taban;
    await store.replace(sahip, k);
    expect((await (await guncelle(id, degistir(d, 1))).json()).surum).toMatchObject({ tur: "surum", surum: 2 });
  });

  it("süren sınıf oturumu başladığı sürümle biter: yayınlanmış oyun kodu düzenlemeden etkilenmez", async () => {
    const d = oyun();
    d.meta.baslik = "Sürüm 1";
    const id = await kaydet(d);
    const pub = await api.libraryPublish.POST(cerezli(jsonRequest(`/api/library/${id}/publish`, {})), api.idParams(id));
    const kod = (await pub.json()).game.code as string;
    const yeni = degistir(d, 1);
    yeni.meta.baslik = "Sürüm 2";
    await guncelle(id, yeni);
    const oyunKaydi = await api.gamesStore.getGamesStore().get(kod);
    expect(oyunKaydi!.definition!.meta.baslik).toBe("Sürüm 1");
  });
});

describe("Redis kütüphane deposu: sürüm denetimli yazım", () => {
  it("tek betikte: kayıt yoksa 0, sürüm farklıysa -1, eşitse yazar", async () => {
    const { createRedisLibraryStore } = await import("@/lib/libraryStore");
    const { recordingCommand } = await import("./helpers/fakeRedis");
    let yanit = 1;
    const { command, calls } = recordingCommand(() => yanit);
    const s = createRedisLibraryStore(command);
    const kayit = { id: "abc12345", surum: 3 } as unknown as Parameters<typeof s.replace>[1];
    expect(await s.replaceIfSurum("hesap:x", kayit, 2)).toBe("ok");
    expect(calls[0][1]).toContain(`string.match(v, '"surum":(%d+)') or '1'`);
    expect(calls[0].slice(2, 6)).toEqual(["1", "dersera:kutuphane:hesap:x", "abc12345", "2"]);
    yanit = -1;
    expect(await s.replaceIfSurum("hesap:x", kayit, 2)).toBe("catisma");
    yanit = 0;
    expect(await s.replaceIfSurum("hesap:x", kayit, 2)).toBe("yok");
  });
});

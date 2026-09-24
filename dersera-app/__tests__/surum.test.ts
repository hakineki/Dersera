import { clearRedisEnv } from "./helpers/fakeRedis";
import { buildApi, hesapAc, jsonRequest } from "./helpers/api";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";
import { getUniteler } from "@/data/mufredat/programlar";
import type { GameDefinition } from "@/lib/composer/definition";
import { degisimOrani, surumKarari, VARYANT_ESIGI } from "@/lib/surum";

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
  it("değişim oranı: giriş + her durak + envanter + final birimleri", () => {
    const d = oyun();
    expect(degisimOrani(d, kopya(d))).toBe(0);
    expect(degisimOrani(d, degistir(d, 1))).toBeCloseTo(1 / 11);
    const baslik = kopya(d);
    baslik.meta.baslik = "Yeni başlık";
    expect(degisimOrani(d, baslik)).toBeCloseTo(1 / 11);
    const eksik = kopya(d);
    eksik.duraklar.pop();
    expect(degisimOrani(d, eksik)).toBeGreaterThan(0);
  });

  it(`en çok %${VARYANT_ESIGI * 100} değişiklik yeni sürüm, fazlası varyant; kimlik değişikliği her zaman varyant; hiç değişmezse aynı`, () => {
    const d = oyun();
    expect(surumKarari(d, kopya(d))).toEqual({ tur: "ayni" });
    expect(surumKarari(d, degistir(d, 3))).toMatchObject({ tur: "surum" }); // 3/11 ≈ %27
    expect(surumKarari(d, degistir(d, 4))).toMatchObject({ tur: "varyant", neden: "oran" }); // 4/11 ≈ %36
    const alan = kopya(d);
    alan.meta.alan = "okul";
    expect(surumKarari(d, alan)).toMatchObject({ tur: "varyant", neden: "kimlik" });
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
  const guncelle = async (id: string, d: GameDefinition) => {
    const put = new Request(`http://localhost/api/library/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ definition: d }) });
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

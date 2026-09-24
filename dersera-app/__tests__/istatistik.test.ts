import { clearRedisEnv, recordingCommand } from "./helpers/fakeRedis";
import { buildApi, hesapAc, jsonRequest } from "./helpers/api";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";
import { getUniteler } from "@/data/mufredat/programlar";
import { createRedisIstatistikStore } from "@/lib/istatistikStore";

const fizik = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const dersler = [{ ders: "fizik", konuId: getUniteler(10, "fizik")[0].id }];
const oyun = (baslik: string) => {
  const d = makeDefinition(fizik, 8);
  d.meta.baslik = baslik;
  return d;
};

describe("öğrenci puanı ve kütüphane istatistikleri", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  let ogretmen: string;
  beforeEach(async () => {
    clearRedisEnv();
    api = await buildApi();
    ogretmen = await hesapAc(api, "ogretmen1");
  });

  const cerezli = (req: Request, c: string) => (req.headers.set("cookie", c), req);
  const kaydet = async (baslik: string, c = ogretmen) => (await (await api.library.POST(cerezli(jsonRequest("/api/library", { definition: oyun(baslik), dersler }), c))).json()).id as string;
  const kutuphanedenYayinla = async (id: string, c = ogretmen) => {
    const res = await api.libraryPublish.POST(cerezli(jsonRequest(`/api/library/${id}/publish`, {}), c), api.idParams(id));
    expect(res.status).toBe(201);
    return (await res.json()).game.code as string;
  };
  const katil = async (kod: string, nickname: string) => {
    const res = await api.join.POST(jsonRequest("/join", { nickname }), api.params(kod));
    expect(res.status).toBe(201);
    return (await res.json()).playerToken as string;
  };
  const puanVer = (kod: string, body: Record<string, unknown>) => api.puan.POST(jsonRequest(`/api/games/${kod}/puan`, body), api.params(kod));
  const kutuphane = async (c = ogretmen) => (await (await api.library.GET(cerezli(new Request("http://localhost/api/library"), c))).json()).oyunlar;

  it("kütüphane oyununda öğrenci sayısı ve puan ortalaması birikir (farklı sınıf yayınları dahil)", async () => {
    const id = await kaydet("Hareket");
    const kod1 = await kutuphanedenYayinla(id);
    const kod2 = await kutuphanedenYayinla(id);
    const t1 = await katil(kod1, "Kartal");
    const t2 = await katil(kod1, "Şahin");
    const t3 = await katil(kod2, "Atmaca");
    expect((await puanVer(kod1, { nickname: "Kartal", playerToken: t1, puan: 3 })).status).toBe(201);
    expect((await puanVer(kod1, { nickname: "Şahin", playerToken: t2, puan: 5 })).status).toBe(201);
    expect((await puanVer(kod2, { nickname: "Atmaca", playerToken: t3, puan: 4 })).status).toBe(201);
    const [o] = await kutuphane();
    expect(o).toMatchObject({ id, ogrenci_sayisi: 3, puan_ortalama: 4, puan_sayisi: 3 });
  });

  it("puan yoksa ortalama null; ortalama bir ondalık basamağa yuvarlanır", async () => {
    const id = await kaydet("Yuvarlama");
    const kod = await kutuphanedenYayinla(id);
    expect((await kutuphane())[0]).toMatchObject({ ogrenci_sayisi: 0, puan_ortalama: null, puan_sayisi: 0 });
    for (const [n, p] of [["Kartal", 4], ["Şahin", 4], ["Atmaca", 5]] as const) {
      await puanVer(kod, { nickname: n, playerToken: await katil(kod, n), puan: p });
    }
    expect((await kutuphane())[0].puan_ortalama).toBe(4.3);
  });

  it("aynı öğrenci ikinci kez puan veremez; toplamlar değişmez", async () => {
    const kod = await kutuphanedenYayinla(await kaydet("Tekrar"));
    const t = await katil(kod, "Kartal");
    expect((await puanVer(kod, { nickname: "Kartal", playerToken: t, puan: 5 })).status).toBe(201);
    expect((await puanVer(kod, { nickname: "kartal", playerToken: t, puan: 1 })).status).toBe(409);
    expect((await kutuphane())[0]).toMatchObject({ puan_ortalama: 5, puan_sayisi: 1 });
  });

  it.each([
    ["sıfır", 0],
    ["altı", 6],
    ["ondalık", 3.5],
    ["metin", "5"],
    ["yok", undefined],
  ])("geçersiz puan 422: %s", async (_l, puan) => {
    const kod = await kutuphanedenYayinla(await kaydet("Geçersiz"));
    const t = await katil(kod, "Kartal");
    expect((await puanVer(kod, { nickname: "Kartal", playerToken: t, puan })).status).toBe(422);
  });

  it("oyuncu anahtarı olmadan ya da başkasının adına puan verilemez; bilinmeyen oyun 404", async () => {
    const kod = await kutuphanedenYayinla(await kaydet("Yetki"));
    const t = await katil(kod, "Kartal");
    await katil(kod, "Şahin");
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
    await katil(kod, "Kartal");
    expect((await kutuphane())[0].ogrenci_sayisi).toBe(1);
    const yabanci = await hesapAc(api, "ogretmen2");
    const kod2 = await yayin(yabanci, id);
    await katil(kod2, "Şahin");
    expect((await kutuphane())[0].ogrenci_sayisi).toBe(1);
  });

  it("topluluk özetinde öğrenci puanı ortalaması görünür", async () => {
    const kod = await kutuphanedenYayinla(await kaydet("Topluluk"));
    await puanVer(kod, { nickname: "Kartal", playerToken: await katil(kod, "Kartal"), puan: 2 });
    await puanVer(kod, { nickname: "Şahin", playerToken: await katil(kod, "Şahin"), puan: 5 });
    const liste = await (await api.topluluk.GET(new Request("http://localhost/api/topluluk"))).json();
    expect(liste.oyunlar[0]).toMatchObject({ oynanma_sayisi: 2, puan_ortalama: 3.5, puan_sayisi: 2 });
  });

  it("tek tek puanlar ve takma adlar hiçbir yanıtta yer almaz", async () => {
    const kod = await kutuphanedenYayinla(await kaydet("Gizlilik"));
    await puanVer(kod, { nickname: "GizliKartal", playerToken: await katil(kod, "GizliKartal"), puan: 1 });
    const yanitlar = JSON.stringify(await kutuphane()) + JSON.stringify(await (await api.topluluk.GET(new Request("http://localhost/api/topluluk"))).json());
    expect(yanitlar).not.toMatch(/GizliKartal|gizlikartal/);
  });

  it("istatistik deposu hata verirse liste yine gelir (sıfırlarla), katılım bozulmaz, puan 503 döner", async () => {
    const kod = await kutuphanedenYayinla(await kaydet("Hata"));
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    const spy = jest.spyOn(api.istatistikStore, "getIstatistikStore").mockImplementation(() => {
      throw new Error("redis kapalı");
    });
    const t = await katil(kod, "Kartal");
    expect((await puanVer(kod, { nickname: "Kartal", playerToken: t, puan: 5 })).status).toBe(503);
    expect((await kutuphane())[0]).toMatchObject({ ogrenci_sayisi: 0, puan_ortalama: null });
    spy.mockRestore();
    err.mockRestore();
  });
});

describe("Redis istatistik deposu", () => {
  it("oy yalnız 'verdi' bilgisini süreli tutar; toplamlar sayaçlarda; liste tek MGET", async () => {
    const { command, calls } = recordingCommand((a) => (a[0] === "HSETNX" ? 1 : a[0] === "MGET" ? ["3", "11", "3"] : "OK"));
    const s = createRedisIstatistikStore(command);
    expect(await s.oyKaydet("ABC-123", "kartal", 5000)).toBe(true);
    expect(calls.slice(0, 2)).toEqual([
      ["HSETNX", "dersera:istatistik:oy:ABC-123", "kartal", "1"],
      ["PEXPIRE", "dersera:istatistik:oy:ABC-123", "5000"],
    ]);
    await s.puanEkle("hesap:x:k1", 4);
    expect(calls.slice(2, 4)).toEqual([
      ["INCRBY", "dersera:istatistik:kutuphane:hesap:x:k1:puanToplam", "4"],
      ["INCR", "dersera:istatistik:kutuphane:hesap:x:k1:puanSayisi"],
    ]);
    expect(await s.istatistikler(["hesap:x:k1"])).toEqual([{ ogrenci: 3, puanToplam: 11, puanSayisi: 3 }]);
    expect(calls.at(-1)).toEqual([
      "MGET",
      "dersera:istatistik:kutuphane:hesap:x:k1:ogrenci",
      "dersera:istatistik:kutuphane:hesap:x:k1:puanToplam",
      "dersera:istatistik:kutuphane:hesap:x:k1:puanSayisi",
    ]);
  });
});

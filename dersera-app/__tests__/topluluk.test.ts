import { clearRedisEnv, recordingCommand } from "./helpers/fakeRedis";
import { buildApi, hesapAc, jsonRequest, katilVeBitir, samplePublish, toplulugaKoy } from "./helpers/api";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";
import { getUniteler } from "@/data/mufredat/programlar";
import type { GameDefinition } from "@/lib/composer/definition";
import { createRedisToplulukStore, siraSkoru } from "@/lib/toplulukStore";
import { EN_COK_TARAMA, listeSorgusu } from "@/lib/toplulukService";
import { durumOf, type ToplulukKaydi } from "@/lib/topluluk";

const fizik = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const matematik = resolvedInput({ sinif: 11, ders: "matematik", sure: 60, deneyim: "macera", alan: "okul" });
const fizikDersler = [{ ders: "fizik", konuId: getUniteler(10, "fizik")[0].id }];
const matDersler = [{ ders: "matematik", konuId: getUniteler(11, "matematik")[0].id }];

describe("topluluk kütüphanesi", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  let ogretmen: string;
  beforeEach(async () => {
    clearRedisEnv();
    api = await buildApi();
    ogretmen = await hesapAc(api, "ogretmen1");
  });

  const yayinla = async (definition: GameDefinition, dersler: { ders: string; konuId: string }[], cerez: string | null = ogretmen) => {
    const req = jsonRequest("/api/games", { composer: { definition, dersler } });
    if (cerez) req.headers.set("cookie", cerez);
    const res = await api.games.POST(req);
    expect(res.status).toBe(201);
    return (await res.json()) as { game: { code: string } };
  };
  const liste = async (qs = "") => {
    const res = await api.topluluk.GET(new Request(`http://localhost/api/topluluk${qs ? "?" + qs : ""}`));
    return { res, data: await res.json() };
  };
  const baslikli = (input: typeof fizik, baslik: string, durak = 8) => {
    const d = makeDefinition(input, durak);
    d.meta.baslik = baslik;
    return d;
  };
  const sahipOf = (cerez: string) => {
    const req = new Request("http://localhost/");
    req.headers.set("cookie", cerez);
    return api.libraryService.istekSahibi(req) as Promise<string>;
  };

  it("yayın topluluğa hiçbir şey eklemez: composer, kütüphane, oturumsuz ve klasik yayın", async () => {
    await yayinla(baslikli(fizik, "Composer"), fizikDersler);
    await yayinla(baslikli(fizik, "Anonim"), fizikDersler, null);
    const req = jsonRequest("/api/library", { definition: baslikli(fizik, "Kütüphane"), dersler: fizikDersler });
    req.headers.set("cookie", ogretmen);
    const { id } = await (await api.library.POST(req)).json();
    const pub = jsonRequest(`/api/library/${id}/publish`, {});
    pub.headers.set("cookie", ogretmen);
    expect((await api.libraryPublish.POST(pub, api.idParams(id))).status).toBe(201);
    expect((await api.games.POST(jsonRequest("/api/games", samplePublish()))).status).toBe(201);
    expect((await liste()).data.oyunlar).toEqual([]);
    expect(await api.toplulukStore.getToplulukStore().sirali(null, 10)).toEqual([]);
  });

  it("yayındaki kayıt özet alanlarıyla listelenir; cevaplar, oluşturan ve iç alanlar listede yok", async () => {
    await toplulugaKoy(api, baslikli(fizik, "Hareketin Sırrı"), fizikDersler);
    const { res, data } = await liste();
    expect(res.status).toBe(200);
    expect(data.oyunlar).toHaveLength(1);
    const o = data.oyunlar[0];
    expect(o).toMatchObject({
      baslik: "Hareketin Sırrı",
      ders: "Fizik",
      konu: fizik.konuAdi,
      sinif: 10,
      sure_dk: 40,
      alan: "sinif",
      deneyim: "dengeli",
      oynanma_sayisi: 0,
      puan_ortalama: null,
      puan_sayisi: 0,
      aktif: true,
    });
    expect(o.oyun_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(data)).not.toMatch(/definition|dogru_cevap|olusturan|dersler|kaynak|onceki_id|durum|gonderim/);
  });

  it("topluluktaki oyunla aynı içeriğin yayını o kayda bağlanır: oynanma bitirenle artar (her sınıf yayını dahil)", async () => {
    const d = baslikli(fizik, "Bir");
    await toplulugaKoy(api, d, fizikDersler);
    const a = await yayinla(d, fizikDersler);
    const b = await yayinla(d, fizikDersler);
    expect((await api.join.POST(jsonRequest("/join", { nickname: "Yarım" }), api.params(a.game.code))).status).toBe(201);
    expect((await liste()).data.oyunlar[0].oynanma_sayisi).toBe(0);
    await katilVeBitir(api, a.game.code, "Kartal");
    await katilVeBitir(api, a.game.code, "Şahin");
    await katilVeBitir(api, b.game.code, "Atmaca");
    expect((await liste()).data.oyunlar[0].oynanma_sayisi).toBe(3);
    // Farklı içerik bağlanmaz.
    const c = await yayinla(baslikli(fizik, "Başka"), fizikDersler);
    await katilVeBitir(api, c.game.code, "Doğan");
    expect((await liste()).data.oyunlar[0].oynanma_sayisi).toBe(3);
  });

  it("aynı öğrencinin sonucu tekrar gönderilse de oynanma bir kez sayılır; oluşturanın kendi oturumu sayılmaz", async () => {
    const d = baslikli(fizik, "Bir");
    await toplulugaKoy(api, d, fizikDersler, { olusturan: await sahipOf(ogretmen) });
    const { game } = await yayinla(d, fizikDersler);
    const token = await katilVeBitir(api, game.code, "Kartal");
    const tekrar = { nickname: "Kartal", netSeconds: 500, penaltySeconds: 0, hintsUsed: 0, completedAt: 1_790_000_000_000 };
    expect((await api.results.POST(jsonRequest("/api/results", { gameCode: game.code, playerToken: token, result: tekrar }))).status).toBe(201);
    await katilVeBitir(api, game.code, "Öğretmen", ogretmen);
    expect((await liste()).data.oyunlar[0].oynanma_sayisi).toBe(1);
  });

  it("topluluk deposu hata verse de yayın ve katılım başarılı olur", async () => {
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    const spy = jest.spyOn(api.toplulukStore, "getToplulukStore").mockImplementation(() => {
      throw new Error("redis kapalı");
    });
    const { game } = await yayinla(baslikli(fizik, "Bir"), fizikDersler);
    await katilVeBitir(api, game.code, "Kartal");
    spy.mockRestore();
    err.mockRestore();
  });

  it("filtreler: ders, sınıf, alan, deneyim ve arama (Türkçe büyük/küçük harf duyarsız)", async () => {
    await toplulugaKoy(api, baslikli(fizik, "Hareketin Sırrı"), fizikDersler);
    await toplulugaKoy(api, baslikli(matematik, "İşlevlerin İzi", 12), matDersler);
    const basliklar = async (qs: string) => (await liste(qs)).data.oyunlar.map((o: { baslik: string }) => o.baslik);
    expect(await basliklar("ders=fizik")).toEqual(["Hareketin Sırrı"]);
    expect(await basliklar("sinif=11")).toEqual(["İşlevlerin İzi"]);
    expect(await basliklar("alan=okul")).toEqual(["İşlevlerin İzi"]);
    expect(await basliklar("deneyim=dengeli")).toEqual(["Hareketin Sırrı"]);
    expect(await basliklar("q=işlevler")).toEqual(["İşlevlerin İzi"]);
    expect(await basliklar("q=fizik")).toEqual(["Hareketin Sırrı"]);
    expect(await basliklar("ders=fizik&sinif=11")).toEqual([]);
  });

  it("varsayılan sıra en yeni önce; imleçle sayfalanır, tekrar ya da atlama olmaz", async () => {
    for (let i = 0; i < 25; i++) await toplulugaKoy(api, baslikli(fizik, `Oyun ${i}`), fizikDersler, { yayinTarihi: 1_700_000_000_000 + i * 1000 });
    const ilk = await liste();
    expect(ilk.data.oyunlar).toHaveLength(20);
    expect(ilk.data.oyunlar[0].baslik).toBe("Oyun 24");
    expect(ilk.data.sonraki).toEqual(expect.any(String));
    const ikinci = await liste(`cursor=${encodeURIComponent(ilk.data.sonraki)}`);
    expect(ikinci.data.oyunlar.map((o: { baslik: string }) => o.baslik)).toEqual(["Oyun 4", "Oyun 3", "Oyun 2", "Oyun 1", "Oyun 0"]);
    expect(ikinci.data.sonraki).toBeNull();
    expect((await liste("limit=3")).data.oyunlar).toHaveLength(3);
  });

  it.each([["ders=astroloji"], ["sinif=8"], ["alan=bahce"], ["deneyim=zor"], ["limit=21"], ["limit=0"], ["cursor=abc"], [`q=${"a".repeat(101)}`]])(
    "geçersiz sorgu 422: %s",
    async (qs) => {
      expect((await liste(qs)).res.status).toBe(422);
    }
  );

  it("'Oyunu Kullan' tam oyunu yalnız öğretmen oturumuyla ve yalnız yayındaki kayıt için verir; gizli alanlar dışarı çıkmaz", async () => {
    const cerez = await hesapAc(api, "ayse");
    const id = await toplulugaKoy(api, baslikli(fizik, "Bir"), fizikDersler, { olusturan: await sahipOf(cerez) });
    const oku = (c: string | null, oyunId = id) => {
      const req = new Request(`http://localhost/api/topluluk/${oyunId}`);
      if (c) req.headers.set("cookie", c);
      return api.toplulukOyun.GET(req, api.idParams(oyunId));
    };
    expect((await oku(null)).status).toBe(401);
    const res = await oku(cerez);
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.oyun.definition.meta.baslik).toBe("Bir");
    expect(d.oyun.dersler).toEqual(fizikDersler);
    expect(d.validation.gecerli).toBe(true);
    expect(JSON.stringify(d)).not.toMatch(/olusturan|kaynak|onceki_id|"durum"|gonderim_tarihi|hesap:/);
    expect((await oku(cerez, "bozuk")).status).toBe(404);
    expect((await oku(cerez, "00000000-0000-4000-8000-000000000000")).status).toBe(404);
    await api.toplulukStore.getToplulukStore().durumYaz(id, "inceleme");
    expect((await oku(cerez)).status).toBe(404);
  });

  it("uzun başlık 120 karakterle sınırlanır", async () => {
    await toplulugaKoy(api, baslikli(fizik, "B".repeat(300)), fizikDersler);
    expect((await liste()).data.oyunlar[0].baslik).toHaveLength(120);
  });

  it("çok dersli oyun her iki dersin filtresinde görünür", async () => {
    const coklu = makeDefinition(resolvedInput({ sinif: 10, ders: ["fizik", "matematik"], sure: 40, deneyim: "dengeli", alan: "sinif" }), 8);
    coklu.meta.baslik = "Disiplinler Arası";
    await toplulugaKoy(api, coklu, [{ ders: "fizik", konuId: getUniteler(10, "fizik")[0].id }, { ders: "matematik", konuId: getUniteler(10, "matematik")[0].id }]);
    const basliklar = async (qs: string) => (await liste(qs)).data.oyunlar.map((o: { baslik: string }) => o.baslik);
    expect(await basliklar("ders=fizik")).toEqual(["Disiplinler Arası"]);
    expect(await basliklar("ders=matematik")).toEqual(["Disiplinler Arası"]);
    expect(await basliklar("ders=kimya")).toEqual([]);
  });

  it(`tarama sınırında (${EN_COK_TARAMA}) eşleşme yoksa boş sayfa ve devam imleci döner; devamda eşleşme bulunur`, async () => {
    const store = api.toplulukStore.getToplulukStore();
    for (let i = 0; i < EN_COK_TARAMA + 5; i++) {
      const d = baslikli(i < 5 ? matematik : fizik, i < 5 ? `Eski ${i}` : `Yeni ${i}`, 5);
      const k = { oyun_id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, baslik: d.meta.baslik, ders: d.meta.ders, konu: d.meta.konu, sinif: d.meta.sinif, sure_dk: 40, alan: d.meta.alan, deneyim: d.meta.deneyim, olusturan: "hesap:x", yayin_tarihi: 1000 + i, puan_ortalama: null, puan_sayisi: 0, aktif: true, definition: d, dersler: [] };
      await store.ekle(k, `ozet${i}`);
    }
    const ilk = await liste("ders=matematik");
    expect(ilk.data.oyunlar).toEqual([]);
    expect(ilk.data.sonraki).toEqual(expect.any(String));
    const devam = await liste(`ders=matematik&cursor=${encodeURIComponent(ilk.data.sonraki)}`);
    expect(devam.data.oyunlar).toHaveLength(5);
  });

  it("durumu olmayan eski kayıt: aktifse yayında, pasifse geri çekilmiş sayılır", () => {
    expect(durumOf({ aktif: true })).toBe("yayinda");
    expect(durumOf({ aktif: false })).toBe("geri-cekildi");
    expect(durumOf({ aktif: false, durum: "inceleme" })).toBe("inceleme");
  });
});

describe("liste sorgusu", () => {
  it("ders anahtarını ders adına çevirir", () => {
    const s = listeSorgusu(new URLSearchParams("ders=turk-dili&sinif=9"));
    expect(s.ok && s.filtre).toEqual({ ders: "Türk Dili ve Edebiyatı", sinif: 9 });
  });

  it.each(["", "-1", "1e5", "abc"])("geçersiz imleç reddedilir: '%s'", (c) => {
    expect(listeSorgusu(new URLSearchParams(`cursor=${c}`)).ok).toBe(false);
  });
});

describe("Redis topluluk deposu", () => {
  function sahteRedis(opts: { nxHata?: boolean } = {}) {
    const db = new Map<string, string>();
    const zset = new Map<string, number>();
    const hash = new Map<string, Map<string, string>>();
    const rc = recordingCommand((a) => {
      const [cmd] = a;
      if (cmd === "SET") {
        if (a.includes("NX")) {
          if (opts.nxHata) throw new Error("bağlantı koptu");
          if (db.has(a[1])) return null;
        }
        const eski = db.get(a[1]) ?? null;
        db.set(a[1], a[2]);
        return a.includes("GET") ? eski : "OK";
      }
      if (cmd === "GET") return db.get(a[1]) ?? null;
      if (cmd === "MGET") return a.slice(1).map((k) => db.get(k) ?? null);
      if (cmd === "DEL") return a.slice(1).filter((k) => db.delete(k)).length;
      if (cmd === "ZADD") return zset.set(a[3], Number(a[2])) && 1;
      if (cmd === "ZREM") return zset.delete(a[2]) ? 1 : 0;
      if (cmd === "ZRANGE") return [...zset.entries()].sort((x, y) => x[1] - y[1]).slice(Number(a[2]), Number(a[3]) + 1).map(([id]) => id);
      if (cmd === "ZREVRANGEBYSCORE") {
        const ust = a[2] === "+inf" ? Infinity : Number(a[2].replace("(", ""));
        const hariç = a[2].startsWith("(");
        const adet = Number(a[7]);
        return [...zset.entries()]
          .filter(([, sk]) => (hariç ? sk < ust : sk <= ust))
          .sort((x, y) => y[1] - x[1])
          .slice(0, adet)
          .flatMap(([id, sk]) => [id, String(sk)]);
      }
      if (cmd === "HSETNX") {
        const h = hash.get(a[1]) ?? hash.set(a[1], new Map()).get(a[1])!;
        if (h.has(a[2])) return 0;
        h.set(a[2], a[3]);
        return 1;
      }
      if (cmd === "HVALS") return [...(hash.get(a[1])?.values() ?? [])];
      return 1;
    });
    return { ...rc, db, zset };
  }
  const kayit = (id: string, t: number, aktif = true) => ({ oyun_id: id, yayin_tarihi: t, baslik: id, aktif, olusturan: "hesap:x" }) as ToplulukKaydi;
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";

  it("önce kayıt, en son içerik anahtarı NX; aynı içerik ikinci kez eklenmez ve yeni kayıt geri alınır", async () => {
    const r = sahteRedis();
    const s = createRedisToplulukStore(r.command);
    expect(await s.ekle(kayit(A, 1000), "ozet")).toBe(A);
    const nxSira = r.calls.findIndex((c) => c.includes("NX"));
    expect(r.calls.slice(0, nxSira).map((c) => c[0])).toEqual(["SET", "SET", "SET", "ZADD"]);
    expect(r.calls.find((c) => c[0] === "ZADD")).toEqual(["ZADD", "dersera:topluluk:sira", String(siraSkoru(1000, A)), A]);
    expect(await s.ekle(kayit(B, 2000), "ozet")).toBe(A);
    expect(r.zset.has(B)).toBe(false);
    expect(r.db.has(`dersera:topluluk:oyun:${B}`)).toBe(false);
    expect(r.db.has(`dersera:topluluk:olusturan:${B}`)).toBe(false);
    await s.kodBagla("ABC-123", A, 5000);
    expect(r.calls.at(-1)).toEqual(["SET", "dersera:topluluk:kod:ABC-123", A, "PX", "5000"]);
  });

  it("aktif olmayan (incelemedeki) kayıt listeye girmez", async () => {
    const r = sahteRedis();
    const s = createRedisToplulukStore(r.command);
    await s.ekle(kayit(A, 1000, false), "a");
    expect(r.calls.some((c) => c[0] === "ZADD")).toBe(false);
    expect(await s.sirali(null, 10)).toEqual([]);
  });

  it("içerik anahtarı yazılamazsa içerik anahtarı var olmayan kaydı göstermez", async () => {
    const hatali = sahteRedis({ nxHata: true });
    await expect(createRedisToplulukStore(hatali.command).ekle(kayit(A, 1000), "ozet")).rejects.toThrow();
    expect(hatali.db.has("dersera:topluluk:icerik:ozet")).toBe(false);
  });

  it("sıralı okuma: imleç hariç tutulur, özeti eksik satır atlanır ama imleç ilerler", async () => {
    const r = sahteRedis();
    const s = createRedisToplulukStore(r.command);
    await s.ekle(kayit(A, 1000), "a");
    await s.ekle(kayit(B, 2000), "b");
    r.db.delete(`dersera:topluluk:ozet:${B}`);
    const ilk = await s.sirali(null, 10);
    expect(ilk.map((o) => [o.ozet?.oyun_id ?? null, o.skor])).toEqual([[null, siraSkoru(2000, B)], [A, siraSkoru(1000, A)]]);
    const devam = await s.sirali(siraSkoru(2000, B), 10);
    expect(devam.map((o) => o.ozet?.oyun_id)).toEqual([A]);
  });

  it("durum yazımı: yayından çıkan sıradan çıkar; yayına giren yeni tarihle sıraya girer; özete iç durum yazılmaz", async () => {
    const r = sahteRedis();
    const s = createRedisToplulukStore(r.command);
    await s.ekle(kayit(A, 1000), "a");
    await s.durumYaz(A, "geri-cekildi");
    expect(r.zset.has(A)).toBe(false);
    expect(JSON.parse(r.db.get(`dersera:topluluk:oyun:${A}`)!)).toMatchObject({ aktif: false, durum: "geri-cekildi" });
    await s.durumYaz(A, "yayinda", 5000);
    expect(r.zset.get(A)).toBe(siraSkoru(5000, A));
    expect(JSON.parse(r.db.get(`dersera:topluluk:oyun:${A}`)!)).toMatchObject({ aktif: true, durum: "yayinda", yayin_tarihi: 5000 });
    const ozet = JSON.parse(r.db.get(`dersera:topluluk:ozet:${A}`)!);
    expect(ozet).toMatchObject({ aktif: true, yayin_tarihi: 5000 });
    expect(ozet).not.toHaveProperty("durum");
    expect(await s.kaynakGuncelle("hesap:x:k1", A)).toBeNull();
    expect(await s.kaynakOku("hesap:x:k1")).toBe(A);
  });

  it("inceleme kuyruğu gönderim sırasıyla; inceleme hesap başına bir kez yazılır", async () => {
    const r = sahteRedis();
    const s = createRedisToplulukStore(r.command);
    await s.kuyrugaEkle(B, 2000);
    await s.kuyrugaEkle(A, 1000);
    expect(await s.kuyruk(10)).toEqual([A, B]);
    await s.kuyruktanCikar(A);
    expect(await s.kuyruk(10)).toEqual([B]);
    const inc = { inceleyen: "hesap:y", karar: "kabul" as const, not: "", tarih: 1 };
    expect(await s.incelemeEkle(B, inc)).toBe(true);
    expect(await s.incelemeEkle(B, { ...inc, karar: "ret" })).toBe(false);
    expect(await s.incelemeler(B)).toEqual([inc]);
    expect(r.calls.find((c) => c[0] === "HSETNX")!.slice(0, 3)).toEqual(["HSETNX", `dersera:topluluk:inceleme:${B}`, "hesap:y"]);
  });
});

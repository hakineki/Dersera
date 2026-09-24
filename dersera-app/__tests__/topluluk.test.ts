import { clearRedisEnv, recordingCommand } from "./helpers/fakeRedis";
import { buildApi, hesapAc, jsonRequest, katilVeBitir, samplePublish } from "./helpers/api";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";
import { getUniteler } from "@/data/mufredat/programlar";
import type { GameDefinition } from "@/lib/composer/definition";
import { createRedisToplulukStore, siraSkoru } from "@/lib/toplulukStore";
import { EN_COK_TARAMA, GUNLUK_TOPLULUK_KAYDI, listeSorgusu } from "@/lib/toplulukService";
import type { ToplulukKaydi } from "@/lib/topluluk";

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

  // cerez: undefined → öğretmen oturumu; null → oturumsuz (anonim) yayın.
  const yayinla = async (definition: GameDefinition, dersler: { ders: string; konuId: string }[], cerez?: string | null) => {
    const req = jsonRequest("/api/games", { composer: { definition, dersler } });
    const c = cerez === undefined ? ogretmen : cerez;
    if (c) req.headers.set("cookie", c);
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

  it("composer yayını topluluğa özet alanlarıyla düşer; cevaplar ve oluşturan listede yok", async () => {
    await yayinla(baslikli(fizik, "Hareketin Sırrı"), fizikDersler);
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
    expect(typeof o.yayin_tarihi).toBe("number");
    expect(JSON.stringify(data)).not.toMatch(/definition|dogru_cevap|olusturan|dersler/);
  });

  it("aynı oyun tekrar yayınlanınca yeni kayıt açılmaz; klasik oyun eklenmez", async () => {
    const d = baslikli(fizik, "Bir");
    await yayinla(d, fizikDersler);
    await yayinla(d, fizikDersler);
    expect((await api.games.POST(jsonRequest("/api/games", samplePublish()))).status).toBe(201);
    expect((await liste()).data.oyunlar).toHaveLength(1);
  });

  it("oynanma sayısı katılımla değil, oyunu bitiren öğrenciyle artar (tekrar yayının kodu da aynı kayda sayılır)", async () => {
    const d = baslikli(fizik, "Bir");
    const a = await yayinla(d, fizikDersler);
    const b = await yayinla(d, fizikDersler);
    expect((await api.join.POST(jsonRequest("/join", { nickname: "Yarım" }), api.params(a.game.code))).status).toBe(201);
    expect((await liste()).data.oyunlar[0].oynanma_sayisi).toBe(0);
    await katilVeBitir(api, a.game.code, "Kartal");
    await katilVeBitir(api, a.game.code, "Şahin");
    await katilVeBitir(api, b.game.code, "Atmaca");
    expect((await liste()).data.oyunlar[0].oynanma_sayisi).toBe(3);
  });

  it("aynı öğrencinin sonucu tekrar gönderilse de oynanma bir kez sayılır; oluşturanın kendi oturumu sayılmaz", async () => {
    const { game } = await yayinla(baslikli(fizik, "Bir"), fizikDersler);
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
    await katilVeBitir(api, game.code, "Kartal"); // katılım ve sonuç kaydı hata vermez
    spy.mockRestore();
    err.mockRestore();
  });

  it("filtreler: ders, sınıf, alan, deneyim ve arama (Türkçe büyük/küçük harf duyarsız)", async () => {
    await yayinla(baslikli(fizik, "Hareketin Sırrı"), fizikDersler);
    await yayinla(baslikli(matematik, "İşlevlerin İzi", 12), matDersler);
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
    // Günlük hesap sınırı (20) aşılmasın diye yayınlar iki hesaba bölünür.
    const ogretmen2 = await hesapAc(api, "ogretmen2");
    const now = jest.spyOn(Date, "now");
    for (let i = 0; i < 25; i++) {
      now.mockReturnValue(1_700_000_000_000 + i * 1000);
      await yayinla(baslikli(fizik, `Oyun ${i}`), fizikDersler, i % 2 ? ogretmen2 : undefined);
    }
    now.mockRestore();
    const ilk = await liste();
    expect(ilk.data.oyunlar).toHaveLength(20);
    expect(ilk.data.oyunlar[0].baslik).toBe("Oyun 24");
    expect(ilk.data.sonraki).toEqual(expect.any(String));
    const ikinci = await liste(`cursor=${encodeURIComponent(ilk.data.sonraki)}`);
    expect(ikinci.data.oyunlar.map((o: { baslik: string }) => o.baslik)).toEqual(["Oyun 4", "Oyun 3", "Oyun 2", "Oyun 1", "Oyun 0"]);
    expect(ikinci.data.sonraki).toBeNull();
    const kucuk = await liste("limit=3");
    expect(kucuk.data.oyunlar).toHaveLength(3);
  });

  it.each([["ders=astroloji"], ["sinif=8"], ["alan=bahce"], ["deneyim=zor"], ["limit=21"], ["limit=0"], ["cursor=abc"], [`q=${"a".repeat(101)}`]])(
    "geçersiz sorgu 422: %s",
    async (qs) => {
      expect((await liste(qs)).res.status).toBe(422);
    }
  );

  it("'Oyunu Kullan' tam oyunu yalnız öğretmen oturumuyla verir; oluşturan gizli kalır", async () => {
    const cerez = await hesapAc(api, "ayse");
    await yayinla(baslikli(fizik, "Bir"), fizikDersler, cerez);
    const id = (await liste()).data.oyunlar[0].oyun_id;
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
    expect(d.hedefler.length).toBeGreaterThan(0);
    expect(JSON.stringify(d)).not.toContain("olusturan");
    expect((await oku(cerez, "bozuk")).status).toBe(404);
    expect((await oku(cerez, "00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });

  it("oluşturan öğretmen hesabıdır; oturumsuz (anonim) yayın topluluğa girmez ama yayın başarılıdır", async () => {
    await yayinla(baslikli(fizik, "Hesaplı"), fizikDersler);
    await yayinla(baslikli(fizik, "Anonim"), fizikDersler, null);
    const store = api.toplulukStore.getToplulukStore();
    const ogeler = await store.sirali(null, 10);
    expect(ogeler).toHaveLength(1);
    const kayit = await store.get(ogeler[0].ozet!.oyun_id);
    expect(kayit!.baslik).toBe("Hesaplı");
    expect(kayit!.olusturan).toMatch(/^hesap:[0-9a-f]{24}$/);
  });

  it("uzun başlık listede 120 karakterle sınırlanır", async () => {
    await yayinla(baslikli(fizik, "B".repeat(300)), fizikDersler);
    expect((await liste()).data.oyunlar[0].baslik).toHaveLength(120);
  });

  it(`bir hesap günde en çok ${GUNLUK_TOPLULUK_KAYDI} topluluk kaydı açar; sonrası yayınlanır ama eklenmez`, async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i <= GUNLUK_TOPLULUK_KAYDI; i++) await yayinla(baslikli(fizik, `Oyun ${i}`), fizikDersler);
    warn.mockRestore();
    const hepsi = [...(await liste()).data.oyunlar, ...(await liste(`cursor=${encodeURIComponent((await liste()).data.sonraki ?? "0")}`)).data.oyunlar];
    expect(hepsi).toHaveLength(GUNLUK_TOPLULUK_KAYDI);
  });

  it("çok dersli oyun her iki dersin filtresinde görünür", async () => {
    const coklu = makeDefinition(resolvedInput({ sinif: 10, ders: ["fizik", "matematik"], sure: 40, deneyim: "dengeli", alan: "sinif" }), 8);
    coklu.meta.baslik = "Disiplinler Arası";
    const dersler = [{ ders: "fizik", konuId: getUniteler(10, "fizik")[0].id }, { ders: "matematik", konuId: getUniteler(10, "matematik")[0].id }];
    await yayinla(coklu, dersler);
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

  it("kütüphaneden tekrar yayın da topluluğa eklenir (sahip hesap)", async () => {
    const cerez = await hesapAc(api, "ayse");
    const kaydet = await api.library.POST(Object.assign(jsonRequest("/api/library", { definition: baslikli(fizik, "Kütüphaneden"), dersler: fizikDersler }), {}));
    expect(kaydet.status).toBe(401); // oturumsuz
    const req = jsonRequest("/api/library", { definition: baslikli(fizik, "Kütüphaneden"), dersler: fizikDersler });
    req.headers.set("cookie", cerez);
    const { id } = await (await api.library.POST(req)).json();
    const pub = jsonRequest(`/api/library/${id}/publish`, {});
    pub.headers.set("cookie", cerez);
    expect((await api.libraryPublish.POST(pub, api.idParams(id))).status).toBe(201);
    expect((await liste()).data.oyunlar.map((o: { baslik: string }) => o.baslik)).toEqual(["Kütüphaneden"]);

    // Düzenlenip yeniden yayınlanınca yeni sürüm listede, eski sürüm pasif (listede görünmez).
    const duzenli = baslikli(fizik, "Kütüphaneden (düzenlendi)");
    const put = new Request(`http://localhost/api/library/${id}`, { method: "PUT", headers: { "Content-Type": "application/json", cookie: cerez }, body: JSON.stringify({ definition: duzenli }) });
    expect((await api.libraryItem.PUT(put, api.idParams(id))).status).toBe(200);
    const pub2 = jsonRequest(`/api/library/${id}/publish`, {});
    pub2.headers.set("cookie", cerez);
    expect((await api.libraryPublish.POST(pub2, api.idParams(id))).status).toBe(201);
    expect((await liste()).data.oyunlar.map((o: { baslik: string }) => o.baslik)).toEqual(["Kütüphaneden (düzenlendi)"]);
  });

  const kutuphaneyeKaydet = async (cerez: string, definition: GameDefinition) => {
    const req = jsonRequest("/api/library", { definition, dersler: fizikDersler });
    req.headers.set("cookie", cerez);
    return (await (await api.library.POST(req)).json()).id as string;
  };
  const kutuphanedenYayinla = async (cerez: string, id: string) => {
    const pub = jsonRequest(`/api/library/${id}/publish`, {});
    pub.headers.set("cookie", cerez);
    expect((await api.libraryPublish.POST(pub, api.idParams(id))).status).toBe(201);
  };
  const guncelle = async (cerez: string, id: string, definition: GameDefinition) => {
    const put = new Request(`http://localhost/api/library/${id}`, { method: "PUT", headers: { "Content-Type": "application/json", cookie: cerez }, body: JSON.stringify({ definition }) });
    expect((await api.libraryItem.PUT(put, api.idParams(id))).status).toBe(200);
  };
  const basliklar = async () => (await liste()).data.oyunlar.map((o: { baslik: string }) => o.baslik).sort();

  it("başka öğretmenin kopyası aslını pasifleştiremez", async () => {
    const t1 = await hesapAc(api, "ogretmen-t1");
    const t2 = await hesapAc(api, "ogretmen-t2");
    const asil = baslikli(fizik, "T1 Oyunu");
    await kutuphanedenYayinla(t1, await kutuphaneyeKaydet(t1, asil));
    // T2 aynı içeriği kendi kütüphanesine alır, yayınlar, sonra düzenleyip yeniden yayınlar.
    const k2 = await kutuphaneyeKaydet(t2, asil);
    await kutuphanedenYayinla(t2, k2);
    await guncelle(t2, k2, baslikli(fizik, "T2 Uyarlaması"));
    await kutuphanedenYayinla(t2, k2);
    expect(await basliklar()).toEqual(["T1 Oyunu", "T2 Uyarlaması"]);
  });

  it("eski sürüme geri dönülünce o sürüm yeniden listelenir", async () => {
    const t1 = await hesapAc(api, "ogretmen-t1");
    const k = await kutuphaneyeKaydet(t1, baslikli(fizik, "Sürüm A"));
    await kutuphanedenYayinla(t1, k);
    await guncelle(t1, k, baslikli(fizik, "Sürüm B"));
    await kutuphanedenYayinla(t1, k);
    expect(await basliklar()).toEqual(["Sürüm B"]);
    await guncelle(t1, k, baslikli(fizik, "Sürüm A"));
    await kutuphanedenYayinla(t1, k);
    expect(await basliklar()).toEqual(["Sürüm A"]);
  });

  it("composer'dan kütüphane oyunu yayınlanınca da eski sürüm pasife alınır; başkasının kütüphane kimliği yok sayılır", async () => {
    const t1 = await hesapAc(api, "ogretmen-t1");
    const k = await kutuphaneyeKaydet(t1, baslikli(fizik, "Taslak 1"));
    const composerYayini = async (cerez: string, baslik: string, kutuphaneId: string) => {
      const req = jsonRequest("/api/games", { composer: { definition: baslikli(fizik, baslik), dersler: fizikDersler }, kutuphaneId });
      req.headers.set("cookie", cerez);
      expect((await api.games.POST(req)).status).toBe(201);
    };
    await composerYayini(t1, "Taslak 1", k);
    await composerYayini(t1, "Taslak 2", k);
    expect(await basliklar()).toEqual(["Taslak 2"]);
    // Başka öğretmen aynı kütüphane kimliğini gönderse de T1'in kaydına dokunamaz.
    const t2 = await hesapAc(api, "ogretmen-t2");
    await composerYayini(t2, "Yabancı", k);
    expect(await basliklar()).toEqual(["Taslak 2", "Yabancı"]);
  });

  it("günlük sınır yalnız yeni kayıtta sayılır: aynı oyunun ek sınıf yayınları koda bağlanmaya devam eder", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const d = baslikli(fizik, "Çok Sınıflı");
    const kodlar: string[] = [];
    for (let i = 0; i < GUNLUK_TOPLULUK_KAYDI + 3; i++) kodlar.push((await yayinla(d, fizikDersler)).game.code);
    warn.mockRestore();
    const son = kodlar[kodlar.length - 1];
    await katilVeBitir(api, son, "Kartal");
    expect((await liste()).data.oyunlar[0].oynanma_sayisi).toBe(1);
  });

  it("kütüphaneden yayında topluluğa oynatılan (doğrulanmış) sürüm gider, yayın anında kaydedilen taslak değil", async () => {
    const cerez = await hesapAc(api, "ayse");
    const req = jsonRequest("/api/library", { definition: baslikli(fizik, "Geçerli"), dersler: fizikDersler });
    req.headers.set("cookie", cerez);
    const { id } = await (await api.library.POST(req)).json();
    // Yayın sırasında taslak (geçersiz) bir düzenleme kaydedilmiş gibi: ikinci okuma bozuk sürümü döndürür.
    const store = api.libraryStore.getLibraryStore();
    const gercekGet = store.get.bind(store);
    let okuma = 0;
    jest.spyOn(store, "get").mockImplementation(async (o, i) => {
      const k = await gercekGet(o, i);
      if (k && ++okuma === 2) return { ...k, definition: { ...k.definition, meta: { ...k.definition.meta, baslik: "TASLAK" } } };
      return k;
    });
    const pub = jsonRequest(`/api/library/${id}/publish`, {});
    pub.headers.set("cookie", cerez);
    expect((await api.libraryPublish.POST(pub, api.idParams(id))).status).toBe(201);
    jest.restoreAllMocks();
    expect((await liste()).data.oyunlar.map((o: { baslik: string }) => o.baslik)).toEqual(["Geçerli"]);
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
      if (cmd === "INCR") return 1;
      return 1;
    });
    return { ...rc, db, zset };
  }
  const kayit = (id: string, t: number) => ({ oyun_id: id, yayin_tarihi: t, baslik: id, aktif: true }) as ToplulukKaydi;
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
    expect(r.calls.some((c) => c[0] === "ZREVRANGEBYSCORE" && c[2] === `(${siraSkoru(2000, B)}` && c.includes("WITHSCORES"))).toBe(true);
  });

  it("kaynak güncellenince önceki sürüm sıradan çıkar ve pasif işaretlenir", async () => {
    const r = sahteRedis();
    const s = createRedisToplulukStore(r.command);
    await s.ekle(kayit(A, 1000), "a");
    expect(await s.kaynakGuncelle("hesap:x:k1", A)).toBeNull();
    expect(await s.kaynakGuncelle("hesap:x:k1", B)).toBe(A);
    await s.pasiflestir(A);
    expect(r.zset.has(A)).toBe(false);
    expect(JSON.parse(r.db.get(`dersera:topluluk:oyun:${A}`)!).aktif).toBe(false);
  });
});

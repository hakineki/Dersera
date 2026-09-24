import { clearRedisEnv, recordingCommand } from "./helpers/fakeRedis";
import { buildApi, hesapAc, jsonRequest, samplePublish } from "./helpers/api";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";
import { getUniteler } from "@/data/mufredat/programlar";
import type { GameDefinition } from "@/lib/composer/definition";
import { createRedisToplulukStore, siraSkoru } from "@/lib/toplulukStore";
import { listeSorgusu } from "@/lib/toplulukService";
import type { ToplulukKaydi } from "@/lib/topluluk";

const fizik = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const matematik = resolvedInput({ sinif: 11, ders: "matematik", sure: 60, deneyim: "macera", alan: "okul" });
const fizikDersler = [{ ders: "fizik", konuId: getUniteler(10, "fizik")[0].id }];
const matDersler = [{ ders: "matematik", konuId: getUniteler(11, "matematik")[0].id }];

describe("topluluk kütüphanesi", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  beforeEach(async () => {
    clearRedisEnv();
    api = await buildApi();
  });

  const yayinla = async (definition: GameDefinition, dersler: { ders: string; konuId: string }[], cerez?: string) => {
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

  it("öğrenci katıldıkça oynanma sayısı artar (tekrar yayının kodu da aynı kayda sayılır)", async () => {
    const d = baslikli(fizik, "Bir");
    const a = await yayinla(d, fizikDersler);
    const b = await yayinla(d, fizikDersler);
    const katil = (kod: string, nickname: string) => api.join.POST(jsonRequest("/join", { nickname }), api.params(kod));
    expect((await katil(a.game.code, "Kartal")).status).toBe(201);
    expect((await katil(a.game.code, "Şahin")).status).toBe(201);
    expect((await katil(a.game.code, "Kartal")).status).toBe(409); // aynı takma ad sayılmaz
    expect((await katil(b.game.code, "Atmaca")).status).toBe(201);
    expect((await liste()).data.oyunlar[0].oynanma_sayisi).toBe(3);
  });

  it("topluluk deposu hata verse de yayın ve katılım başarılı olur", async () => {
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    const spy = jest.spyOn(api.toplulukStore, "getToplulukStore").mockImplementation(() => {
      throw new Error("redis kapalı");
    });
    const { game } = await yayinla(baslikli(fizik, "Bir"), fizikDersler);
    expect((await api.join.POST(jsonRequest("/join", { nickname: "Kartal" }), api.params(game.code))).status).toBe(201);
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
    const now = jest.spyOn(Date, "now");
    for (let i = 0; i < 25; i++) {
      now.mockReturnValue(1_700_000_000_000 + i * 1000);
      await yayinla(baslikli(fizik, `Oyun ${i}`), fizikDersler);
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

  it("oluşturan: oturum varsa öğretmen hesabı, yoksa anonim olarak saklanır", async () => {
    const cerez = await hesapAc(api, "ayse");
    await yayinla(baslikli(fizik, "Hesaplı"), fizikDersler, cerez);
    await yayinla(baslikli(fizik, "Anonim"), fizikDersler);
    const store = api.toplulukStore.getToplulukStore();
    const { ozetler } = await store.sirali(null, 10);
    const kayitlar = await Promise.all(ozetler.map((o) => store.get(o.oyun_id)));
    const byBaslik = Object.fromEntries(kayitlar.map((k) => [k!.baslik, k!.olusturan]));
    expect(byBaslik.Anonim).toBe("anonim");
    expect(byBaslik["Hesaplı"]).toMatch(/^hesap:[0-9a-f]{24}$/);
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
  });
});

describe("liste sorgusu", () => {
  it("ders anahtarını ders adına çevirir", () => {
    const s = listeSorgusu(new URLSearchParams("ders=turk-dili&sinif=9"));
    expect(s.ok && s.filtre).toEqual({ ders: "Türk Dili ve Edebiyatı", sinif: 9 });
  });
});

describe("Redis topluluk deposu", () => {
  it("içerik özetini NX ile alır, sıralı kümeye yazar; kod süreli bağlanır", async () => {
    const db = new Map<string, string>();
    const { command, calls } = recordingCommand((a) => {
      if (a[0] === "SET") {
        if (a.includes("NX") && db.has(a[1])) return null;
        db.set(a[1], a[2]);
        return "OK";
      }
      if (a[0] === "GET") return db.get(a[1]) ?? null;
      return 1;
    });
    const s = createRedisToplulukStore(command);
    const kayit = { oyun_id: "11111111-1111-4111-8111-111111111111", yayin_tarihi: 1000, baslik: "x" } as ToplulukKaydi;
    expect(await s.ekle(kayit, "ozet")).toBe(kayit.oyun_id);
    expect(await s.ekle({ ...kayit, oyun_id: "22222222-2222-4222-8222-222222222222" }, "ozet")).toBe(kayit.oyun_id);
    expect(calls.filter((c) => c[0] === "ZADD")).toEqual([["ZADD", "dersera:topluluk:sira", String(siraSkoru(1000, kayit.oyun_id)), kayit.oyun_id]]);
    await s.kodBagla("ABC-123", kayit.oyun_id, 5000);
    expect(calls.at(-1)).toEqual(["SET", "dersera:topluluk:kod:ABC-123", kayit.oyun_id, "PX", "5000"]);
  });
});

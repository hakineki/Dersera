import { getUniteler, kazanimBul, PROGRAM_DERSLERI, SINIFLAR } from "@/data/mufredat/programlar";
import type { GameDefinition } from "@/lib/composer/definition";
import type { DersKonu } from "@/lib/composer/input";
import { SERBEST_NOT_MAX } from "@/lib/composer/limits";
import { ayOf } from "@/lib/kredi";
import {
  oyunAlanlari,
  pekistirmeAdresi,
  pekistirmeNotu,
  sonrakiAy,
  takipAlanlari,
  takipPenceresi,
  takipRaporuHesapla,
  type KazanimSatiri,
  type KazanimTanimi,
  type KazanimYeri,
  type TakipRaporu,
} from "@/lib/ogrenmeTakibi";
import { takipSinyali } from "@/lib/ogrenmeTakibiService";
import { createMemoryOgrenmeTakibiStore, createRedisOgrenmeTakibiStore } from "@/lib/ogrenmeTakibiStore";
import { buildApi, cerezli, hesapAc, jsonRequest } from "./helpers/api";
import { makeDefinition, resolvedInput } from "./helpers/composerFixtures";
import { clearRedisEnv, recordingCommand } from "./helpers/fakeRedis";

const girdi = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const oyun = (): GameDefinition => makeDefinition(girdi, 7);
const dersler: DersKonu[] = [{ ders: "fizik", konuId: getUniteler(10, "fizik")[0].id }];
const YER: KazanimYeri = { ders: "fizik", sinif: 10, uniteId: dersler[0].konuId };
const cikti = (kod: string, x: string) => `k|fizik|10|${YER.uniteId}|${kod}|${x}`;

describe("öğrenme takibi kuralları", () => {
  it("öğrenci alanları: çıktı ders+sınıf+ünite+kodla, görev türü ayrı; geçersiz değer, final ve yeri bulunmayan çıktı sayılmaz; oyun alanları tekil", () => {
    const d = oyun();
    const [a, b, c] = d.duraklar;
    const alanlar = takipAlanlari(d, { [a.id]: 0, [b.id]: 3, [c.id]: 1, yok: 0, [d.duraklar[3].id]: -1, [d.duraklar[4].id]: Number.NaN }, () => YER);
    expect(alanlar[0]).toBe("bitiren");
    expect(alanlar.filter((x) => x.startsWith("k|") && x.endsWith("|d"))).toHaveLength(3);
    expect(alanlar).toContain(cikti(a.gorev.ogrenme_hedefi, "i"));
    expect(alanlar).toContain(cikti(b.gorev.ogrenme_hedefi, "s"));
    expect(alanlar).toContain(`t|${b.gorev.tur}|s`);
    expect(alanlar.filter((x) => x.endsWith("|i"))).toHaveLength(2);
    // Yeri bulunamayan çıktı: görev türü yine sayılır, çıktı sayılmaz.
    const yersiz = takipAlanlari(d, { [a.id]: 0 }, () => null);
    expect(yersiz).toEqual(["bitiren", `t|${a.gorev.tur}|d`, `t|${a.gorev.tur}|i`]);

    const o = oyunAlanlari(d, () => YER);
    expect(o[0]).toBe("oyun");
    expect(new Set(o).size).toBe(o.length);
    expect(o.slice(1).sort()).toEqual([...new Set(d.duraklar.map((x) => cikti(x.gorev.ogrenme_hedefi, "o")))].sort());
    expect(oyunAlanlari(d, () => null)).toEqual(["oyun"]);
  });

  it("pencere: seçilen ay ve önceki iki ay, yıl dönümünde doğru; sonraki ay", () => {
    expect(takipPenceresi("2026-09")).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(takipPenceresi("2026-02")).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect([sonrakiAy("2026-09"), sonrakiAy("2026-12")]).toEqual(["2026-10", "2027-01"]);
  });

  it("rapor: oranlar en az 5 denemeyle; ay ay gidişat; zorlanılan önce; aynı kod farklı ünitede ayrı satır; görev türleri", () => {
    const tanim = (yer: KazanimYeri, kod: string): KazanimTanimi | null =>
      kod === "YOK.1" ? null : { metin: `${kod} ${yer.uniteId} metni`, ders: yer.ders, dersAd: "Fizik", sinif: yer.sinif, uniteId: yer.uniteId, uniteAd: "Ünite" };
    const k = (unite: string, kod: string, x: string) => `k|fizik|10|${unite}|${kod}|${x}`;
    const r = takipRaporuHesapla(
      ["2026-07", "2026-08", "2026-09"],
      [
        { bitiren: 4, oyun: 1, [k("u1", "A", "d")]: 10, [k("u1", "A", "i")]: 8, [k("u1", "A", "o")]: 1, [k("u1", "B", "d")]: 10, [k("u1", "B", "i")]: 5, "t|eslestirme|d": 20, "t|eslestirme|i": 13 },
        { bitiren: 2, [k("u1", "A", "d")]: 2, [k("u1", "A", "i")]: 0 },
        {
          bitiren: 6,
          oyun: 2,
          [k("u1", "A", "d")]: 10,
          [k("u1", "A", "i")]: 3,
          [k("u1", "A", "s")]: 4,
          [k("u1", "A", "o")]: 2,
          [k("u1", "B", "d")]: 10,
          [k("u1", "B", "i")]: 5,
          [k("u1", "C", "d")]: 3,
          [k("u1", "C", "i")]: 0,
          [k("u1", "YOK.1", "d")]: 6,
          [k("u1", "YOK.1", "i")]: 6,
          // Aynı kod başka ünitede: ayrı satır.
          [k("u2", "A", "d")]: 5,
          [k("u2", "A", "i")]: 5,
        },
      ],
      tanim
    );
    expect(r.bitiren).toEqual([4, 2, 6]);
    expect(r.oyun).toEqual([1, 0, 2]);
    const a = r.kazanimlar.find((x) => x.anahtar === "fizik|10|u1|A")!;
    // 11/22 ilk denemede doğru; 4/22 destek; Temmuz %80 → Eylül %30 düşüyor (Ağustos az veri).
    expect(a).toMatchObject({ kod: "A", oyun: 3, deneme: 22, ilkDenemeOrani: 0.5, aylar: [0.8, null, 0.3], gidisat: "dusuyor", zorluk: "orta" });
    expect(a.tanim?.metin).toBe("A u1 metni");
    expect(a.destekOrani).toBeCloseTo(4 / 22);
    expect(r.kazanimlar.find((x) => x.anahtar === "fizik|10|u2|A")).toMatchObject({ kod: "A", deneme: 5, ilkDenemeOrani: 1, tanim: { uniteId: "u2", metin: "A u2 metni" } });
    expect(r.kazanimlar.find((x) => x.kod === "B")).toMatchObject({ ilkDenemeOrani: 0.5, gidisat: "sabit" });
    expect(r.kazanimlar.find((x) => x.kod === "C")).toMatchObject({ deneme: 3, ilkDenemeOrani: null, zorluk: "az-veri", gidisat: null });
    expect(r.kazanimlar.find((x) => x.kod === "YOK.1")).toMatchObject({ tanim: null, zorluk: "iyi" });
    // Sıra: orta (düşük oran önce, eşitse çok deneme önce), sonra iyi, sonra az veri.
    expect(r.kazanimlar.map((x) => x.anahtar)).toEqual(["fizik|10|u1|A", "fizik|10|u1|B", "fizik|10|u1|YOK.1", "fizik|10|u2|A", "fizik|10|u1|C"]);
    expect(r.turler).toEqual([{ tur: "eslestirme", deneme: 20, ilkDenemeOrani: 0.65, destekOrani: 0 }]);

    const yukselen = takipRaporuHesapla(["2026-08", "2026-09"], [{ [k("u1", "X", "d")]: 10, [k("u1", "X", "i")]: 2 }, { [k("u1", "X", "d")]: 10, [k("u1", "X", "i")]: 3 }], tanim).kazanimlar[0];
    expect(yukselen).toMatchObject({ gidisat: "yukseliyor", zorluk: "zor" });
  });

  it("pekiştirme: ön not çıktıyı ve oranı anlatır, sınırı aşmaz; adres sınıf, ders ve konuyla açılır", () => {
    const satir: KazanimSatiri = {
      anahtar: "fizik|10|u9|FİZ.10.1.1",
      kod: "FİZ.10.1.1",
      tanim: { metin: "Hareket", ders: "fizik", dersAd: "Fizik", sinif: 10, uniteId: "u9", uniteAd: "Kuvvet" },
      oyun: 2,
      deneme: 20,
      ilkDenemeOrani: 0.25,
      destekOrani: 0.3,
      aylar: [null, null, 0.25],
      gidisat: null,
      zorluk: "zor",
    };
    expect(pekistirmeNotu(satir)).toMatch(/FİZ\.10\.1\.1 \(Hareket\).*%25/);
    const uzun = { ...satir, tanim: { ...satir.tanim!, metin: "x".repeat(1000) } };
    expect(pekistirmeNotu(uzun).length).toBe(SERBEST_NOT_MAX);
    const q = new URL(`http://x${pekistirmeAdresi(satir)}`).searchParams;
    expect([q.get("sinif"), q.get("ders"), q.get("konu")]).toEqual(["10", "fizik", "u9"]);
    expect(q.get("not")).toBe(pekistirmeNotu(satir));
    expect(pekistirmeAdresi({ ...satir, tanim: null })).toBeNull();
  });

  it("müfredat: çıktı oyunun konularından bulunur; aynı kod farklı ünite ve sınıfta farklı metindir", () => {
    const u = getUniteler(10, "fizik")[0];
    const c = u.ogrenmeCiktilari[0];
    expect(kazanimBul(10, dersler, c.kod)).toEqual({ kod: c.kod, metin: c.metin, ders: "fizik", sinif: 10, uniteId: u.id, uniteAd: u.ad });
    expect(kazanimBul(10, dersler, "YOK.99.9")).toBeNull();
    expect(kazanimBul(11, dersler, c.kod)).toBeNull();

    const [td9a, td9b] = getUniteler(9, "turk-dili").filter((x) => x.ogrenmeCiktilari.length);
    const td10 = getUniteler(10, "turk-dili").filter((x) => x.ogrenmeCiktilari.length)[0];
    const kod = td9a.ogrenmeCiktilari[0].kod;
    const bul = (sinif: number, unite: { id: string }) => kazanimBul(sinif, [{ ders: "turk-dili", konuId: unite.id }], kod);
    const metinler = [bul(9, td9a), bul(9, td9b), bul(10, td10)].map((x) => x?.metin);
    expect(new Set(metinler).size).toBe(3);
    expect(bul(9, td9b)).toMatchObject({ uniteId: td9b.id, sinif: 9 });
    // Çok dersli oyun: kod kendi dersinin ünitesinde bulunur.
    expect(kazanimBul(10, [{ ders: "turk-dili", konuId: td10.id }, ...dersler], c.kod)).toMatchObject({ ders: "fizik", uniteId: u.id });
  });

  it("müfredat sağlamlığı: bir sınıfta aynı çıktı kodu iki farklı derste geçmez (kazanimBul ilk eşleşmeyi alır)", () => {
    const sahibi = new Map<string, string>();
    const cakisan: string[] = [];
    for (const ders of PROGRAM_DERSLERI)
      for (const sinif of SINIFLAR)
        for (const u of getUniteler(sinif, ders))
          for (const c of u.ogrenmeCiktilari) {
            const k = `${sinif}|${c.kod}`;
            const onceki = sahibi.get(k);
            if (onceki && onceki !== ders) cakisan.push(`${k}: ${onceki}, ${ders}`);
            sahibi.set(k, ders);
          }
    expect(cakisan).toEqual([]);
  });

  it("konuları bilinmeyen oyun (bu özellikten önceki yayın) sayılmaz", async () => {
    const s = createMemoryOgrenmeTakibiStore();
    const d = oyun();
    await takipSinyali({ sahip: "hesap:a", definition: d }, "K1", "o1", { [d.duraklar[0].id]: 0 }, null, 1000, Date.UTC(2026, 8, 15), s);
    expect(await s.sayaclar("hesap:a", ["2026-09"])).toEqual([{}]);
    await takipSinyali({ sahip: "hesap:a", definition: d, dersler }, "K1", "o1", { [d.duraklar[0].id]: 0 }, null, 1000, Date.UTC(2026, 8, 15), s);
    expect((await s.sayaclar("hesap:a", ["2026-09"]))[0][cikti(d.duraklar[0].gorev.ogrenme_hedefi, "i")]).toBe(1);
  });
});

describe("öğrenme takibi deposu", () => {
  it("bellek: öğrenci oyun başına bir kez; oyun alanları oyunun ilk öğrencisinde bir kez", async () => {
    const s = createMemoryOgrenmeTakibiStore();
    expect(await s.ogrenciSay("hesap:a", "2026-09", "K1", "o1", ["bitiren", "k|A|d"], ["oyun", "k|A|o"], 1000)).toBe(true);
    expect(await s.ogrenciSay("hesap:a", "2026-09", "K1", "o1", ["bitiren", "k|A|d"], ["oyun", "k|A|o"], 1000)).toBe(false);
    expect(await s.ogrenciSay("hesap:a", "2026-09", "K1", "o2", ["bitiren", "k|A|d", "k|A|d"], ["oyun", "k|A|o"], 1000)).toBe(true);
    expect(await s.ogrenciSay("hesap:a", "2026-10", "K2", "o1", ["bitiren"], ["oyun"], 1000)).toBe(true);
    expect(await s.sayaclar("hesap:a", ["2026-09", "2026-10", "2026-11"])).toEqual([{ bitiren: 2, "k|A|d": 3, oyun: 1, "k|A|o": 1 }, { bitiren: 1, oyun: 1 }, {}]);
    expect(await s.sayaclar("hesap:b", ["2026-09"])).toEqual([{}]);
  });

  it("Redis: her anahtar KEYS ile; öğrenci çiftleri sayılı, oyun alanları tekil; aylar ayrı okunur", async () => {
    const { command, calls } = recordingCommand((a) => (a[0] === "HGETALL" ? (a[1].endsWith("2026-09") ? ["bitiren", "4"] : []) : 1));
    const s = createRedisOgrenmeTakibiStore(command);
    expect(await s.ogrenciSay("hesap:a", "2026-09", "ABC-123", "o1", ["bitiren", "k|A|d", "k|A|d"], ["oyun", "k|A|o", "k|A|o"], 10)).toBe(true);
    expect(calls[0].slice(2)).toEqual(["2", "dersera:takip:sayilan:ABC-123", "dersera:takip:hesap:a:2026-09", "o1", "1000", expect.any(String), "2", "bitiren", "1", "k|A|d", "2", "oyun", "k|A|o"]);
    expect(await s.sayaclar("hesap:a", ["2026-08", "2026-09"])).toEqual([{}, { bitiren: 4 }]);
    expect(calls.slice(1).map((c) => c.join(" "))).toEqual(["HGETALL dersera:takip:hesap:a:2026-08", "HGETALL dersera:takip:hesap:a:2026-09"]);
  });
});

describe("öğrenme takibi akışı", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  let ogretmen: string;
  beforeEach(async () => {
    clearRedisEnv();
    api = await buildApi();
    ogretmen = await hesapAc(api, "ogretmen1");
    jest.spyOn(api.yzDenetim, "yzDenetle").mockResolvedValue({ durum: "tamam", bulgular: [] });
    jest.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  const yayinla = async (cerez: string | null, def = oyun(), konular: { ders: string; konuId: string }[] = dersler) => {
    const res = await api.games.POST(cerezli(jsonRequest("/api/games", { composer: { definition: def, dersler: konular } }), cerez));
    expect(res.status).toBe(201);
    return { kod: (await res.json()).game.code as string, def };
  };
  // Öğrenci katılır ve bitirir; yanlislar[i] i. durağın yanlış sayısı.
  const bitir = async (kod: string, def: GameDefinition, ad: string, yanlislar: number[], cerez: string | null = null) => {
    const { playerToken } = await (await api.join.POST(jsonRequest("/join", { nickname: ad }), api.params(kod))).json();
    const stopDetails = Object.fromEntries(yanlislar.map((y, i) => [def.duraklar[i].id, { hintsUsed: y, completedAt: i + 1 }]));
    const entry = { nickname: ad, netSeconds: 600, penaltySeconds: 0, hintsUsed: 0, completedAt: Date.now(), stopDetails };
    expect((await api.results.POST(cerezli(jsonRequest("/api/results", { gameCode: kod, playerToken, result: entry }), cerez))).status).toBe(201);
    return playerToken as string;
  };
  const rapor = async (cerez: string | null, qs = ""): Promise<Response> => api.ogrenmeTakibi.GET(cerezli(new Request(`http://localhost/api/ogrenme-takibi${qs}`), cerez));

  it("oturumla yayınlanan oyunun sonuçları öğretmenin raporuna girer; tekrar gönderim ve öğretmenin kendi oynayışı sayılmaz; yayınlayan herkese görünmez", async () => {
    const { kod, def } = await yayinla(ogretmen);
    const acik = await (await api.game.GET(new Request(`http://localhost/api/games/${kod}`), api.params(kod))).text();
    expect(acik).not.toMatch(/sahip|hesap:|dersler/);

    const kartal = await bitir(kod, def, "kartal", [0, 3, 1, 0, 0, 0, 0]);
    await bitir(kod, def, "sahin", [0, 0, 2, 0, 0, 0, 0]);
    // Aynı sonuç ikinci kez.
    const entry = { nickname: "kartal", netSeconds: 600, penaltySeconds: 0, hintsUsed: 0, completedAt: Date.now(), stopDetails: { [def.duraklar[0].id]: { hintsUsed: 5, completedAt: 1 } } };
    expect((await api.results.POST(jsonRequest("/api/results", { gameCode: kod, playerToken: kartal, result: entry }))).status).toBe(201);
    // Öğretmen kendi oyununu kendi oturumuyla oynar.
    await bitir(kod, def, "ogretmenim", [5, 5, 5, 5, 5, 5, 5], ogretmen);

    const res = await rapor(ogretmen);
    expect(res.status).toBe(200);
    const r = (await res.json()) as TakipRaporu;
    expect(r.aylar[2]).toBe(ayOf(Date.now()));
    expect(r.bitiren[2]).toBe(2);
    expect(r.oyun[2]).toBe(1);
    const ilk = def.duraklar[0].gorev.ogrenme_hedefi;
    const satir = r.kazanimlar.find((k) => k.kod === ilk)!;
    const beklenenDeneme = def.duraklar.filter((d) => d.gorev.ogrenme_hedefi === ilk).length * 2;
    expect(satir).toMatchObject({ anahtar: `fizik|10|${YER.uniteId}|${ilk}`, oyun: 1, deneme: beklenenDeneme });
    expect(satir.tanim).toMatchObject({ ders: "fizik", sinif: 10, uniteId: dersler[0].konuId });
    expect(r.turler.reduce((a, t) => a + t.deneme, 0)).toBe(14);
    expect(JSON.stringify(r)).not.toMatch(/kartal|sahin|ogretmenim/);
  });

  it("aynı çıktı kodu farklı ünite ve sınıflarda ayrı satırdır; pekiştirme doğru üniteyi açar", async () => {
    const [td9a, td9b] = getUniteler(9, "turk-dili").filter((x) => x.ogrenmeCiktilari.length);
    const td10 = getUniteler(10, "turk-dili").filter((x) => x.ogrenmeCiktilari.length)[0];
    const turkDili = (sinif: 9 | 10, uniteIndex: number) => makeDefinition(resolvedInput({ sinif, ders: "turk-dili", sure: 40, deneyim: "dengeli", alan: "sinif", uniteIndex }), 7);
    const oyunlar = [
      await yayinla(ogretmen, turkDili(9, 0), [{ ders: "turk-dili", konuId: td9a.id }]),
      await yayinla(ogretmen, turkDili(9, 1), [{ ders: "turk-dili", konuId: td9b.id }]),
      await yayinla(ogretmen, turkDili(10, 0), [{ ders: "turk-dili", konuId: td10.id }]),
    ];
    // 9. sınıf ilk ünitede herkes ilk denemede doğru; diğerlerinde hep yanlış.
    for (const [i, { kod, def }] of oyunlar.entries()) for (const ad of ["ali", "bora", "cem", "deniz", "ece"]) await bitir(kod, def, ad, Array(7).fill(i === 0 ? 0 : 2));
    const r = (await (await rapor(ogretmen)).json()) as TakipRaporu;
    const kod = td9a.ogrenmeCiktilari[0].kod;
    const satirlar = r.kazanimlar.filter((k) => k.kod === kod);
    expect(satirlar.map((s) => s.tanim?.uniteId).sort()).toEqual([td9a.id, td9b.id, td10.id].sort());
    const aSatiri = satirlar.find((s) => s.tanim?.uniteId === td9a.id)!;
    const bSatiri = satirlar.find((s) => s.tanim?.uniteId === td9b.id)!;
    expect([aSatiri.ilkDenemeOrani, bSatiri.ilkDenemeOrani]).toEqual([1, 0]);
    expect(bSatiri.tanim?.metin).toBe(td9b.ogrenmeCiktilari[0].metin);
    const q = new URL(`http://x${pekistirmeAdresi(bSatiri)}`).searchParams;
    expect([q.get("sinif"), q.get("ders"), q.get("konu")]).toEqual(["9", "turk-dili", td9b.id]);
  });

  it("oturumsuz yayın sayılmaz; başka öğretmen yalnız kendi raporunu görür; oturumsuz 401; ay parametresi", async () => {
    const { kod, def } = await yayinla(null);
    await bitir(kod, def, "kartal", [0, 0, 0, 0, 0, 0, 0]);
    const benim = await yayinla(ogretmen);
    await bitir(benim.kod, benim.def, "sahin", [0, 0, 0, 0, 0, 0, 0]);

    expect(((await (await rapor(ogretmen)).json()) as TakipRaporu).bitiren[2]).toBe(1);
    const baska = await hesapAc(api, "ogretmen2");
    const b = (await (await rapor(baska)).json()) as TakipRaporu;
    expect(b.kazanimlar).toEqual([]);
    expect(b.bitiren).toEqual([0, 0, 0]);
    expect((await rapor(null)).status).toBe(401);
    expect(((await (await rapor(ogretmen, "?ay=2026-01")).json()) as TakipRaporu).aylar).toEqual(["2025-11", "2025-12", "2026-01"]);
    expect(((await (await rapor(ogretmen, "?ay=2026-13")).json()) as TakipRaporu).aylar[2]).toBe(ayOf(Date.now()));
  });

  it("kütüphaneden yeniden yayında da yayınlayan ve konular kaydedilir", async () => {
    const kayit = await (await api.library.POST(cerezli(jsonRequest("/api/library", { definition: oyun(), dersler }), ogretmen))).json();
    const pub = await api.libraryPublish.POST(
      cerezli(new Request(`http://localhost/api/library/${kayit.id}/publish`, { method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" }, body: "{}" }), ogretmen),
      api.idParams(kayit.id)
    );
    expect(pub.status).toBe(201);
    const kod = (await pub.json()).game.code as string;
    expect(await api.gamesStore.getGamesStore().get(kod)).toMatchObject({ sahip: `hesap:${await api.authStore.getAuthStore().idByAd("ogretmen1")}`, dersler });
  });

  it("sayaç yazılamazsa sonuç yine kaydedilir", async () => {
    const { kod, def } = await yayinla(ogretmen);
    jest.spyOn(api.ogrenmeTakibiStore.getOgrenmeTakibiStore(), "ogrenciSay").mockRejectedValue(new Error("kesinti"));
    const hata = jest.spyOn(console, "error").mockImplementation(() => {});
    await bitir(kod, def, "kartal", [0, 0, 0, 0, 0, 0, 0]);
    expect(hata).toHaveBeenCalledWith("[takip] sonuç sayılamadı", "kesinti");
  });
});

import { getUniteler } from "@/data/mufredat/programlar";
import type { GameDefinition } from "@/lib/composer/definition";
import type { ResolvedInput } from "@/lib/composer/input";
import { buildUserPrompt } from "@/lib/composer/prompt";
import { buildRecipe } from "@/lib/composer/recipe";
import { IZINLI_QR_IDLERI } from "@/lib/composer/context";
import { ayOf } from "@/lib/kredi";
import { duzenlemeAlanlari, kapsamaUyar, ogrenciAlanlari, raporHesapla, uretimAlanlari, type Oneri } from "@/lib/ogrenme";
import { createMemoryOgrenmeStore, createRedisOgrenmeStore } from "@/lib/ogrenmeStore";
import { buildApi, cerezli, hesapAc, jsonRequest } from "./helpers/api";
import { makeDefinition, resolvedInput, toModelOutput } from "./helpers/composerFixtures";
import { clearRedisEnv, recordingCommand } from "./helpers/fakeRedis";

const girdi = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const oyun = (n = 7): GameDefinition => makeDefinition(girdi, n);

describe("öğrenme döngüsü kuralları", () => {
  it("üretim, düzenleme ve öğrenci sinyalleri kimliksiz alanlara dönüşür", () => {
    const d = oyun();
    const u = uretimAlanlari(d, false, ["ipucu-eksik", "ipucu-eksik", "hedef-disi"], [{ kategori: "siddet", agirlik: "incele" }]);
    expect(u).toContain(`uret|${d.meta.ders}|10`);
    expect(u).toContain(`gecersiz|${d.meta.ders}|10`);
    expect(u.filter((a) => a === "kod|ipucu-eksik")).toHaveLength(1);
    expect(u.filter((a) => a.startsWith("tur-uretilen|"))).toHaveLength(d.duraklar.length);
    expect(u).toContain("denetim|siddet|incele");

    const yeni: GameDefinition = { ...d, duraklar: d.duraklar.map((x, i) => (i === 1 ? { ...x, gorev: { ...x.gorev, soru: "Yeni soru?" } } : x)) };
    expect(duzenlemeAlanlari(d, yeni)).toEqual([`tur-duzenlenen|${d.duraklar[1].gorev.tur}`]);
    expect(duzenlemeAlanlari(d, d)).toEqual([]);

    const o = ogrenciAlanlari(d, { [d.duraklar[0].id]: 0, [d.duraklar[1].id]: 3, yok: 0, [d.duraklar[2].id]: -1 });
    expect(o).toContain(`ogr-bitiren|${d.meta.ders}|10`);
    expect(o.filter((a) => a.startsWith("ogr-deneme|"))).toHaveLength(2);
    expect(o).toContain(`ogr-ilk|${d.duraklar[0].gorev.tur}`);
    expect(o).toContain(`ogr-destek|${d.duraklar[1].gorev.tur}`);
  });

  it("rapor: oranlar yalnız yeterli örnekle; görev türü ve ders kırılımı", () => {
    const r = raporHesapla("2026-09", {
      "uret|Fizik|10": 12,
      "gecersiz|Fizik|10": 3,
      "tur-uretilen|eslestirme": 20,
      "tur-duzenlenen|eslestirme": 9,
      "ogr-deneme|eslestirme": 40,
      "ogr-ilk|eslestirme": 10,
      "ogr-destek|eslestirme": 8,
      "tur-uretilen|sayisal": 2,
      "ogr-deneme|sayisal": 3,
      "ogr-ilk|sayisal": 3,
      "kod|ipucu-eksik": 4,
      "denetim|siddet|incele": 2,
    });
    const es = r.turler.find((t) => t.tur === "eslestirme")!;
    expect(es).toMatchObject({ uretilen: 20, duzenlenen: 9, duzenlenmeOrani: 0.45, deneme: 40, ilkDenemeOrani: 0.25, destekOrani: 0.2 });
    // Az örnek: oran yorumlanmaz.
    expect(r.turler.find((t) => t.tur === "sayisal")).toMatchObject({ duzenlenmeOrani: null, ilkDenemeOrani: null });
    expect(r.dersler).toEqual([{ ders: "Fizik", sinif: 10, uretim: 12, gecersizOrani: 0.25, bitiren: 0, deneme: 0, ilkDenemeOrani: null }]);
    expect(r.kodlar).toEqual([{ kod: "ipucu-eksik", sayi: 4 }]);
    expect(r.toplam).toEqual({ uretim: 12, deneme: 43 });
  });

  it("kapsam: boş kapsam her oyuna; ders ve sınıf verildiyse eşleşene uygulanır", () => {
    expect(kapsamaUyar({ ders: null, sinif: null }, ["Fizik"], 10)).toBe(true);
    expect(kapsamaUyar({ ders: "Fizik", sinif: null }, ["Fizik", "Kimya"], 9)).toBe(true);
    expect(kapsamaUyar({ ders: "Kimya", sinif: null }, ["Fizik"], 10)).toBe(false);
    expect(kapsamaUyar({ ders: null, sinif: 9 }, ["Fizik"], 10)).toBe(false);
  });

  it("istem: onaylı ek kurallar temel kurallardan sonra ve onlara bağlı olarak eklenir; yoksa bölüm yok", () => {
    const recipe = buildRecipe(40, "dengeli", "sinif");
    const kuralsiz = buildUserPrompt(girdi, recipe, IZINLI_QR_IDLERI);
    expect(kuralsiz).not.toContain("Öğrenme döngüsünden");
    const p = buildUserPrompt({ ...girdi, ekKurallar: ["Eşleştirme görevlerinde çiftleri kısa tut."] }, recipe, IZINLI_QR_IDLERI);
    expect(p).toContain("Öğrenme döngüsünden onaylı ek kurallar");
    expect(p).toContain("- Eşleştirme görevlerinde çiftleri kısa tut.");
    expect(p).toMatch(/yukarıdaki kurallarla çelişen kısmı uygulama/);
    expect(p.indexOf("Alan kuralları:")).toBeLessThan(p.indexOf("Öğrenme döngüsünden"));
  });

  it("depo: öğrenci oyun başına bir kez sayılır; öneri kararı beklenen durumdan tek geçiş", async () => {
    const s = createMemoryOgrenmeStore();
    expect(await s.ogrenciSay("2026-09", "ABC-123", "o1", ["ogr-deneme|x"], 1000)).toBe(true);
    expect(await s.ogrenciSay("2026-09", "ABC-123", "o1", ["ogr-deneme|x"], 1000)).toBe(false);
    expect(await s.sayaclar("2026-09")).toEqual({ "ogr-deneme|x": 1 });
    const o: Oneri = { id: "i", tarih: 1, baslik: "b", gerekce: "g", kural: "k", kapsam: { ders: null, sinif: null }, durum: "bekliyor" };
    await s.oneriYaz(o);
    expect(await s.oneriGecis("i", ["bekliyor"], { durum: "aktif", karar: { yonetici: "y", tarih: 2 } })).toMatchObject({ durum: "aktif" });
    expect(await s.oneriGecis("i", ["bekliyor"], { durum: "reddedildi" })).toBeNull();
    expect(await s.oneriGecis("yok", ["bekliyor"], { durum: "aktif" })).toBeNull();
  });
});

describe("öğrenme deposu (Redis komutları)", () => {
  it("her anahtar KEYS ile gider; tekrar eden alan tek artışta toplanır; boş alan listesi komut göndermez", async () => {
    const { command, calls } = recordingCommand((a) => (a[0] === "HGETALL" ? ["uret|Fizik|10", "3"] : a[0] === "HGET" ? JSON.stringify({ id: "i", durum: "bekliyor" }) : 1));
    const s = createRedisOgrenmeStore(command);
    await s.sayaclariArtir("2026-09", []);
    expect(calls).toEqual([]);
    await s.sayaclariArtir("2026-09", ["a|x", "b|y", "a|x"]);
    expect(calls[0].slice(2)).toEqual(["1", "dersera:ogrenme:sinyal:2026-09", expect.any(String), "a|x", "2", "b|y", "1"]);
    expect(await s.ogrenciSay("2026-09", "ABC-123", "o1", ["c|z"], 10)).toBe(true);
    expect(calls[1].slice(2, 7)).toEqual(["2", "dersera:ogrenme:sayilan:ABC-123", "dersera:ogrenme:sinyal:2026-09", "o1", "1000"]);
    expect(await s.sayaclar("2026-09")).toEqual({ "uret|Fizik|10": 3 });
    expect(await s.oneriGecis("i", ["bekliyor"], { durum: "aktif" })).toMatchObject({ id: "i", durum: "aktif" });
    expect(calls.at(-1)!.slice(2)).toEqual(["1", "dersera:ogrenme:oneriler", "i", JSON.stringify({ id: "i", durum: "aktif" }), "bekliyor"]);
  });
});

describe("öğrenme döngüsü akışı", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  let ogretmen: string;
  let yonetici: string;
  const eski = { ...process.env };
  beforeEach(async () => {
    clearRedisEnv();
    process.env.ANTHROPIC_API_KEY = "test-key";
    delete process.env.OPENAI_API_KEY;
    process.env.DERSERA_YONETICILER = "platform1";
    api = await buildApi();
    ogretmen = await hesapAc(api, "ogretmen1");
    yonetici = await hesapAc(api, "platform1");
    jest.spyOn(api.anthropic, "composeGame").mockImplementation(async (input: ResolvedInput) => toModelOutput(makeDefinition(input, 7)));
    jest.spyOn(api.yzDenetim, "yzDenetle").mockResolvedValue({ durum: "tamam", bulgular: [] });
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...eski };
  });

  const ay = () => ayOf(Date.now());
  const olustur = () => {
    const req = cerezli(jsonRequest("/api/compose", { sinif: 10, dersler: [{ ders: "fizik", konuId: getUniteler(10, "fizik")[0].id }], sure: 40, deneyim: "dengeli", alan: "sinif" }), ogretmen);
    req.headers.set("x-forwarded-for", "9.9.9.9");
    return api.compose.POST(req);
  };
  const rapor = async (c: string | null = yonetici) => api.ogrenmeRapor.GET(cerezli(new Request("http://localhost/api/yonetim/ogrenme"), c));
  const oneriIste = (c = yonetici) => api.ogrenmeOneri.POST(cerezli(jsonRequest("/api/yonetim/ogrenme/oneri", {}), c));
  const kararVer = (id: string, karar: string, c = yonetici) =>
    api.ogrenmeKarar.PUT(cerezli(new Request(`http://localhost/api/yonetim/ogrenme/oneri/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ karar }) }), c), api.idParams(id));

  it("oluşturma sinyali yazar; öğrenci sonucu oyun başına bir kez sayılır; kütüphanede değişen durak düzenleme sayılır", async () => {
    const res = await olustur();
    expect(res.status).toBe(200);
    const { definition, dersler } = await res.json();
    const s = api.ogrenmeStore.getOgrenmeStore();
    let say = await s.sayaclar(ay());
    expect(say[`uret|${definition.meta.ders}|10`]).toBe(1);
    expect(Object.keys(say).filter((k) => k.startsWith("tur-uretilen|")).reduce((a, k) => a + say[k], 0)).toBe(7);

    // Yayın, katılım ve iki kez gönderilen aynı sonuç.
    const pub = await (await api.games.POST(jsonRequest("/api/games", { composer: { definition, dersler } }))).json();
    const { playerToken } = await (await api.join.POST(jsonRequest("/join", { nickname: "Kartal" }), api.params(pub.game.code))).json();
    const entry = { nickname: "Kartal", netSeconds: 100, penaltySeconds: 0, hintsUsed: 3, completedAt: Date.now(), stopDetails: { [definition.duraklar[0].id]: { hintsUsed: 0, completedAt: 1 }, [definition.duraklar[1].id]: { hintsUsed: 3, completedAt: 2 } } };
    for (let i = 0; i < 2; i++) expect((await api.results.POST(jsonRequest("/api/results", { gameCode: pub.game.code, playerToken, result: entry }))).status).toBe(201);
    say = await s.sayaclar(ay());
    expect(say[`ogr-bitiren|${definition.meta.ders}|10`]).toBe(1);
    expect(Object.keys(say).filter((k) => k.startsWith("ogr-deneme|")).reduce((a, k) => a + say[k], 0)).toBe(2);

    // Kütüphane: kaydet, bir durağı değiştirip yeni sürüm kaydet.
    const kayit = await (await api.library.POST(cerezli(jsonRequest("/api/library", { definition, dersler }), ogretmen))).json();
    const degisik = { ...definition, duraklar: definition.duraklar.map((d: GameDefinition["duraklar"][number], i: number) => (i === 2 ? { ...d, gorev: { ...d.gorev, soru: "Değişen soru?" } } : d)) };
    const put = await api.libraryItem.PUT(
      cerezli(new Request(`http://localhost/api/library/${kayit.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ definition: degisik, surum: 1 }) }), ogretmen),
      api.idParams(kayit.id)
    );
    expect(put.status).toBe(200);
    say = await s.sayaclar(ay());
    expect(say[`tur-duzenlenen|${definition.duraklar[2].gorev.tur}`]).toBe(1);
  });

  it("yapay zekâ güncellemesi: güncellenen görev türleri sayılır ve talimat kimliksiz saklanır", async () => {
    const { definition, dersler } = await (await olustur()).json();
    jest.spyOn(api.composerService, "yapayZekaylaGuncelle").mockImplementation(async (def: GameDefinition) => ({ definition: def, validation: { gecerli: true, hatalar: [], uyarilar: [] }, guncellenen: [def.duraklar[0].id] }) as never);
    const req = cerezli(jsonRequest("/api/compose/guncelle", { definition, dersler, duraklar: [definition.duraklar[0].id], talimat: "Soruyu\u200b daha somut yap" }), ogretmen);
    req.headers.set("x-forwarded-for", "9.9.9.9");
    expect((await api.composeGuncelle.POST(req)).status).toBe(200);
    const s = api.ogrenmeStore.getOgrenmeStore();
    expect((await s.sayaclar(ay()))[`tur-yz-guncellenen|${definition.duraklar[0].gorev.tur}`]).toBe(1);
    expect(await s.talimatlar(5)).toEqual([`10. sınıf ${definition.meta.ders}: Soruyu daha somut yap`]);
  });

  it("rapor ve öneri yalnız platform yöneticisine; yetersiz veride öneri yok; onaylanan kural sonraki oluşturmaya girer, geri alınınca çıkar", async () => {
    expect((await rapor(null)).status).toBe(401);
    expect((await rapor(ogretmen)).status).toBe(403);
    expect((await oneriIste(ogretmen)).status).toBe(403);
    const az = await oneriIste();
    expect(az.status).toBe(422);
    expect((await az.json()).error).toMatch(/en az 10 oyun/);

    // Eşik kadar üretim doğrudan sayaca yazılır (10 oluşturma kredi/saat sınırına takılır).
    await api.ogrenmeStore.getOgrenmeStore().sayaclariArtir(ay(), Array(10).fill("uret|Fizik|10"));
    // Sağlayıcı çağrısı taklit edilir (öneri istemi Anthropic yolundan gider: OPENAI_API_KEY yok).
    const model = jest.spyOn(api.anthropic, "yapilandirilmisIstek").mockResolvedValue({
      oneriler: [
        { baslik: "Eşleştirmeyi sadeleştir", gerekce: "eşleştirmede ilk deneme %25", kural: "Eşleştirme çiftlerini en çok 4 tut\u200b ve kısa yaz.", ders: "Fizik", sinif: 10 },
        { baslik: "Boş", gerekce: "x", kural: "", ders: "", sinif: 0 },
        { baslik: "Uydurma ders", gerekce: "x", kural: "Her görevde bir örnek ver.", ders: "Astroloji", sinif: 99 },
      ],
    });
    const r = await oneriIste();
    expect(r.status).toBe(201);
    const { oneriler } = (await r.json()) as { oneriler: Oneri[] };
    expect(oneriler).toHaveLength(2);
    expect(oneriler[0]).toMatchObject({ durum: "bekliyor", kural: "Eşleştirme çiftlerini en çok 4 tut ve kısa yaz.", kapsam: { ders: "Fizik", sinif: 10 } });
    // Rapordaki derslerden olmayan ders ve geçersiz sınıf kapsamdan düşer.
    expect(oneriler[1].kapsam).toEqual({ ders: null, sinif: null });
    // İstemde yalnız toplu sayılar ve talimatlar var; kimlik yok.
    const istem = (model.mock.calls[0][1] as { ortak: string }).ortak;
    expect(istem).toContain('"gorevTurleri"');
    expect(istem).not.toMatch(/ogretmen1|platform1|hesap:/);

    // Onaysız kural isteme girmez.
    const compose = api.anthropic.composeGame as jest.Mock;
    compose.mockClear();
    await olustur();
    expect(compose.mock.calls[0][0].ekKurallar).toBeUndefined();

    expect((await kararVer(oneriler[0].id, "onayla", ogretmen)).status).toBe(403);
    expect((await kararVer(oneriler[0].id, "bilinmeyen")).status).toBe(422);
    const onay = await kararVer(oneriler[0].id, "onayla");
    expect(onay.status).toBe(200);
    expect((await onay.json()).oneri).toMatchObject({ durum: "aktif", karar: { yonetici: "platform1" } });
    expect((await kararVer(oneriler[0].id, "onayla")).status).toBe(409);
    compose.mockClear();
    await olustur();
    expect(compose.mock.calls[0][0].ekKurallar).toEqual(["Eşleştirme çiftlerini en çok 4 tut ve kısa yaz."]);

    expect((await kararVer(oneriler[0].id, "geri-al")).status).toBe(200);
    compose.mockClear();
    await olustur();
    expect(compose.mock.calls[0][0].ekKurallar).toBeUndefined();

    const durum = await (await rapor()).json();
    expect(durum.rapor.toplam.uretim).toBe(13);
    expect(durum.oneriler.map((o: Oneri) => o.durum).sort()).toEqual(["bekliyor", "pasif"]);
  });
});

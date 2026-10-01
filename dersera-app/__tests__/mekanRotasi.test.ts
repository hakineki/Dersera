import { mekanBilmeceleri } from "@/data/konumBilmeceleri";
import { MEKANLAR } from "@/data/mekanlar";
import { cocukGuvenligiTara } from "@/lib/composer/cocukGuvenligi";
import { IZINLI_QR_IDLERI, validationContext } from "@/lib/composer/context";
import type { GameDefinition, KonumYeri } from "@/lib/composer/definition";
import { baslangicSec, kanitSayisi, katilimAcilisiMi, konumCezasi, sonrakiRotaDuragi, taramaSonucu } from "@/lib/composer/mekanRotasi";
import { buildUserPrompt } from "@/lib/composer/prompt";
import { bosSablon } from "@/lib/composer/sablon";
import { createMemoryGamesStore, createRedisGamesStore } from "@/lib/gamesStore";
import { createLuaRedis } from "./helpers/luaRedis";
import { joinGame } from "@/lib/gamesService";
import { parseLeaderboardEntry } from "@/lib/results";
import { yanlisSayisi } from "@/lib/gameState";
import type { ResolvedInput } from "@/lib/composer/input";
import { cevapParcalari, konumYeri, mekanlariAta, rotaYerleri, UYARLAMA_SINIRI, uyarlamaUygula } from "@/lib/composer/mekanYerlesimi";
import { GorevDoldurmaRotaSchema, GorevDoldurmaSchema, toDefinition, type ModelOutput } from "@/lib/composer/modelOutput";
import { parcaliUret, type Istek } from "@/lib/composer/parcali";
import { composeAndValidate } from "@/lib/composer/service";
import { buildRecipe } from "@/lib/composer/recipe";
import { arrive, currentStep, FINAL_ID } from "@/lib/composer/scene";
import { validateGame } from "@/lib/composer/validator";
import { yonetisimDegerlendir } from "@/lib/composer/yonetisim";
import { loadSceneState, saveSceneState, type GameProgress } from "@/lib/gameState";
import { fakeClient, makeDefinition, modelYaniti, ornekUyarlama, promptOf, resolvedInput, toModelOutput } from "./helpers/composerFixtures";

const okul = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "macera", alan: "okul" });
const tamam = (ids: string[]): GameProgress => Object.fromEntries(ids.map((id) => [id, { completedAt: 1, hintsUsed: 0 }]));

// Modelin okul oyunu çıktısı: seçim sahneli bir iskelet ve kendi seçtiği mekânlar.
function modelCiktisi(mekanlar: string[]): ModelOutput {
  const out = toModelOutput(makeDefinition(okul, 8));
  out.duraklar.forEach((d, i) => (d.mekan_id = mekanlar[i] ?? ""));
  return out;
}
function rotaOyunu(mekanlar = ["kutuphane", "bahce", "kantin", "spor-salonu", "fen-laboratuvari", "koridor", "merdivenler", "sinif"]): GameDefinition {
  const r = toDefinition(modelCiktisi(mekanlar), okul);
  if (!r.ok) throw new Error(r.error);
  return r.definition;
}

describe("mekân yerleşimi (sunucu)", () => {
  it("geçersiz ve tekrarlanan mekânlar listedeki ilk boş mekânla değişir; sonuç tekrarsız", () => {
    const a = mekanlariAta(["kutuphane", "uzay-ussu", "kutuphane", " bahce ", ""]);
    expect(a[0]).toBe("kutuphane");
    expect(a[3]).toBe("bahce");
    expect(new Set(a).size).toBe(5);
    expect(a.every((id) => MEKANLAR.some((m) => m.id === id))).toBe(true);
    // Model adı yazsa da eşleşir (büyük/küçük harf, boşluk/tire/alt çizgi farkı gözetilmez).
    expect(mekanlariAta(["Kütüphane", "spor salonu", "SPOR_SALONU", "Fen Laboratuvarı"])).toEqual(["kutuphane", "spor-salonu", expect.any(String), "fen-laboratuvari"]);
    // Liste biterse (durak sınırı normalde önler) çökmez.
    expect(mekanlariAta(Array(25).fill(""))).toHaveLength(25);
  });

  it("konum yeri mekânın bankasından ve aynı anahtar için hep aynı bilmece", () => {
    const y = konumYeri("kutuphane", "Oyun:d1");
    expect(y.mekan_adi).toBe("Kütüphane");
    const b = mekanBilmeceleri("kutuphane").find((x) => x.bilmece === y.bilmece)!;
    expect(b).toBeDefined();
    expect([y.nokta, y.ipucu_1, y.ipucu_2]).toEqual([b.nokta, b.ipucu1, b.ipucu2]);
    expect(konumYeri("kutuphane", "Oyun:d1")).toEqual(y);
    expect(() => konumYeri("uzay-ussu", "x")).toThrow();
  });
});

describe("okul oyunu → mekân rotası", () => {
  it("rota doğrusal: seçim yok, sıradaki durağa bağlı, QR'lar sırayla, her durakta mekân ve bilmece; tarif boş", () => {
    const def = rotaOyunu();
    expect(def.meta.rota).toBe("mekan");
    expect(def.duraklar.map((d) => d.sahne_turu)).toEqual(Array(8).fill("gorev"));
    expect(def.duraklar.every((d) => d.secimler.length === 0)).toBe(true);
    expect(def.duraklar.map((d) => d.varsayilan_sonraki_durak_id)).toEqual(["d2", "d3", "d4", "d5", "d6", "d7", "d8", null]);
    expect(def.duraklar.map((d) => d.mekan.qr_durak_id)).toEqual(["qr-1", "qr-2", "qr-3", "qr-4", "qr-5", "qr-6", "qr-7", "qr-8"]);
    expect(def.duraklar.map((d) => d.mekan.yer?.mekan_id)).toEqual(["kutuphane", "bahce", "kantin", "spor-salonu", "fen-laboratuvari", "koridor", "merdivenler", "sinif"]);
    expect(def.duraklar.every((d) => d.mekan.sonraki_durak_tarifi === "" && d.mekan.yer!.bilmece.length > 10)).toBe(true);
  });

  it("model mekânı listede yoksa ya da tekrarlandıysa değişir ve öğretmene not düşülür; adla yazılan mekân not almaz", () => {
    const r = toDefinition(modelCiktisi(["kutuphane", "uzay-ussu", "kutuphane", "Spor Salonu", "fen-laboratuvari", "koridor", "merdivenler", "sinif"]), okul);
    if (!r.ok) throw new Error(r.error);
    expect(r.notlar).toHaveLength(2);
    expect(r.notlar[0]).toContain("uzay-ussu");
    expect(r.notlar[1]).toContain("(kutuphane)");
    expect(r.definition.duraklar[3].mekan.yer?.mekan_id).toBe("spor-salonu");
    const temiz = toDefinition(modelCiktisi(["kutuphane", "bahce", "kantin", "spor-salonu", "fen-laboratuvari", "koridor", "merdivenler", "sinif"]), okul);
    expect(temiz.ok && temiz.notlar).toEqual([]);
  });

  it("boş şablon mekân rotası değildir: okulda eski tarif (seçim bloğu, numaralı QR) ve rota alanları yok", () => {
    const sablon = bosSablon(okul);
    expect(sablon.meta.rota).toBeUndefined();
    expect(sablon.duraklar.some((d) => d.sahne_turu === "secim")).toBe(true);
    expect(sablon.duraklar.every((d) => d.mekan.yer === undefined && d.mekan.qr_durak_id !== null)).toBe(true);
    const eski = buildRecipe(40, "macera", "okul", false);
    expect([eski.rota, eski.secim.min > 0]).toEqual([false, true]);
    expect(eski.alan).toContain("QR");
  });

  it("istem: mekân rotasında QR listesi ve 'ilk durak başlangıçtır' yok; eski okul oyununun güncellemesinde QR listesi var", () => {
    const rota = buildUserPrompt(okul, buildRecipe(40, "macera", "okul"), ["qr-1", "qr-2"]);
    expect(rota).toContain("kutuphane: Kütüphane");
    expect(rota).toContain("dallanma ve seçim sahnesi YOKTUR");
    expect(rota).not.toContain("İlk durak başlangıçtır");
    expect(rota).not.toContain("qr-1, qr-2");
    const eski = buildUserPrompt(okul, buildRecipe(40, "macera", "okul", false), ["qr-1", "qr-2"]);
    expect(eski).toContain("qr-1, qr-2");
    expect(eski).toContain("İlk durak başlangıçtır");
    expect(eski).not.toContain("kutuphane: Kütüphane");
  });

  it("doğrulamadan geçer; tek sınıf oyunu eskisi gibi kalır", () => {
    const def = rotaOyunu();
    const v = validateGame(def, validationContext({ ...okul, ogrenmeCiktilari: okul.ogrenmeCiktilari }));
    expect(v.hatalar).toEqual([]);
    const sinif = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "macera", alan: "sinif" });
    const s = toDefinition(toModelOutput(makeDefinition(sinif, 8)), sinif);
    expect(s.ok && s.definition.meta.rota).toBeUndefined();
    expect(s.ok && s.definition.duraklar[1].sahne_turu).toBe("secim");
  });

  it("tarif: okulda seçim yok, kanıt sayısı durak sayısından (8 durakta 3)", () => {
    expect([kanitSayisi(5), kanitSayisi(8), kanitSayisi(12)]).toEqual([2, 3, 5]);
    const r = buildRecipe(40, "macera", "okul");
    expect([r.secim, r.nesne]).toEqual([{ min: 0, max: 0 }, { min: 3, max: 3 }]);
    expect(buildRecipe(40, "macera", "sinif").secim.min).toBeGreaterThan(0);
  });
});

describe("doğrulayıcı: mekân rotası kuralları", () => {
  const ctx = validationContext({ ...okul, ogrenmeCiktilari: okul.ogrenmeCiktilari });
  const kodlar = (def: GameDefinition) => validateGame(def, ctx).hatalar.map((h) => h.kod);

  it("seçim sahnesi, eksik ya da bilinmeyen mekân, tekrarlanan mekân, aynı iki ipucu reddedilir", () => {
    const secim = rotaOyunu();
    secim.duraklar[1] = { ...secim.duraklar[1], sahne_turu: "secim", secimler: [{ metin: "A", hedef_durak_id: "d3" }, { metin: "B", hedef_durak_id: "d4" }], varsayilan_sonraki_durak_id: null };
    expect(kodlar(secim)).toContain("rota-secim");

    const eksik = rotaOyunu();
    delete eksik.duraklar[2].mekan.yer;
    expect(kodlar(eksik)).toContain("rota-yer-eksik");

    const bilinmeyen = rotaOyunu();
    bilinmeyen.duraklar[2].mekan.yer = { ...bilinmeyen.duraklar[2].mekan.yer!, mekan_id: "uzay-ussu" };
    expect(kodlar(bilinmeyen)).toContain("rota-yer-eksik");

    const tekrar = rotaOyunu();
    tekrar.duraklar[3].mekan.yer = { ...tekrar.duraklar[2].mekan.yer! };
    expect(kodlar(tekrar)).toContain("rota-mekan-tekrar");

    // Mekânın okuldaki adını öğretmen yazabilir ("10-A sınıfı"); boş ad ya da sınırı aşan metin reddedilir.
    const ad = rotaOyunu();
    ad.duraklar[1].mekan.yer = { ...ad.duraklar[1].mekan.yer!, mekan_adi: "Arka bahçe" };
    expect(kodlar(ad).filter((k) => k.startsWith("rota-"))).toEqual([]);
    ad.duraklar[1].mekan.yer = { ...ad.duraklar[1].mekan.yer!, mekan_adi: "  " };
    expect(kodlar(ad)).toContain("rota-yer-eksik");
    const uzun = rotaOyunu();
    uzun.duraklar[1].mekan.yer = { ...uzun.duraklar[1].mekan.yer!, mekan_adi: "x".repeat(41) };
    expect(kodlar(uzun)).toContain("rota-yer-uzun");
    uzun.duraklar[1].mekan.yer = { ...uzun.duraklar[1].mekan.yer!, mekan_adi: "Arka bahçe", bilmece: "x".repeat(321) };
    expect(kodlar(uzun)).toContain("rota-yer-uzun");

    const ayni = rotaOyunu();
    ayni.duraklar[0].mekan.yer = { ...ayni.duraklar[0].mekan.yer!, ipucu_2: ayni.duraklar[0].mekan.yer!.ipucu_1 };
    expect(kodlar(ayni)).toContain("rota-ipucu-ayni");

    const sinifta = rotaOyunu();
    sinifta.meta = { ...sinifta.meta, alan: "sinif" };
    expect(kodlar(sinifta)).toContain("rota-alan");
  });

  it("seçim sahnesi olmaması mekân rotasında hata değil; eski okul oyununda hâlâ hata", () => {
    expect(kodlar(rotaOyunu())).not.toContain("secim-yok");
    const eski = makeDefinition(okul, 8);
    eski.duraklar[1] = { ...eski.duraklar[1], sahne_turu: "gorev", secimler: [], varsayilan_sonraki_durak_id: "d3" };
    expect(kodlar(eski)).toContain("secim-yok");
  });
});

describe("oynatıcı: döngüsel rota ve tarama", () => {
  it("başlangıç rastgele seçilir; rota başlangıçtan döngüsel ilerler, hepsi bitince final", () => {
    const def = rotaOyunu();
    // Katılım sırası: 1.–8. takım farklı duraklardan başlar, 9. takım başa döner; sıra yoksa rastgele.
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((s) => baslangicSec(def, s))).toEqual(["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d1"]);
    expect(baslangicSec(def, null, () => 0)).toBe("d1");
    expect(baslangicSec(def, null, () => 0.99)).toBe("d8");
    expect(sonrakiRotaDuragi(def, "d6", tamam(["d6"]))).toBe("d7");
    expect(sonrakiRotaDuragi(def, "d8", tamam(["d6", "d7", "d8"]))).toBe("d1");
    expect(sonrakiRotaDuragi(def, "d5", tamam(["d6", "d7", "d8", "d1", "d2", "d3", "d4", "d5"]))).toBeNull();

    // d6'dan başlayan takım: d6 → d7 → d8 → d1 … → d5 → final.
    let sahne = { yol: [] as string[], hedef: "d6" as string | null };
    const bitenler: string[] = [];
    const sira: string[] = [];
    for (let adim = 0; adim < 20; adim++) {
      const s = currentStep(def, sahne, tamam(bitenler), false);
      if (s.tur === "gecis") {
        if (s.hedef === FINAL_ID) break;
        sira.push(s.hedef);
        sahne = arrive(sahne, s.hedef);
      } else if (s.tur === "gorev") bitenler.push(s.durak.id);
      else throw new Error(s.tur);
    }
    expect(sira).toEqual(["d6", "d7", "d8", "d1", "d2", "d3", "d4", "d5"]);
  });

  it("tarama: hedefin QR'ı varış; çözülmüş yerin QR'ı uyarı; başka QR yanlış yer ve aynı QR için bir kez ceza", () => {
    const def = rotaOyunu();
    expect(taramaSonucu(def, "d3", 3, {})).toEqual({ tur: "varis" });
    expect(taramaSonucu(def, "d3", 2, tamam(["d2"]))).toEqual({ tur: "cozulmus" });
    expect(taramaSonucu(def, "d3", 5, {})).toEqual({ tur: "yanlis", ceza: true, anahtar: "d3:5" });
    expect(taramaSonucu(def, "d3", 5, {}, ["d3:5"])).toEqual({ tur: "yanlis", ceza: false, anahtar: "d3:5" });
    // Oyunda olmayan QR da yanlış yer; başka hedef için aynı QR yeniden cezalıdır.
    expect(taramaSonucu(def, "d3", 17, {})).toMatchObject({ tur: "yanlis", ceza: true });
    expect(taramaSonucu(def, "d4", 5, {}, ["d3:5"])).toMatchObject({ tur: "yanlis", ceza: true });
    // Başlangıç: oyuna başka bir QR okutarak katılan takım cezalandırılmaz; başlangıç yerinin QR'ı varıştır.
    expect(taramaSonucu(def, "d3", 5, {}, [], true)).toEqual({ tur: "yoksay" });
    expect(taramaSonucu(def, "d3", 3, {}, [], true)).toEqual({ tur: "varis" });
  });

  it("konum cezası ayrı sayılır: öğretmenin yanlış cevap sayısı ipucu ve yanlış QR cezasıyla şişmez", () => {
    expect(konumCezasi({ yol: [], hedef: null, ipucu: { d1: 2, d2: 1 }, yanlis: ["d1:4"] })).toBe(120);
    expect(konumCezasi({ yol: [], hedef: null })).toBe(0);
    const temel = { nickname: "kasif", netSeconds: 600, hintsUsed: 1, completedAt: 1_790_000_000_000 };
    // 1 yanlış cevap (15 sn) + 2 ipucu ve 1 yanlış QR (90 sn).
    const e = parseLeaderboardEntry({ ...temel, penaltySeconds: 105, konumCezaSaniye: 90 })!;
    expect(e.konumCezaSaniye).toBe(90);
    expect(yanlisSayisi(e)).toBe(1);
    expect(yanlisSayisi(parseLeaderboardEntry({ ...temel, penaltySeconds: 45 })!)).toBe(3);
    expect(parseLeaderboardEntry({ ...temel, penaltySeconds: 30, konumCezaSaniye: 60 })).toBeNull();
    expect(parseLeaderboardEntry({ ...temel, penaltySeconds: 30, konumCezaSaniye: -1 })).toBeNull();
  });

  it("katılım açılışı: yalnız başlangıcı henüz seçilmemiş rota kaydı (başlangıç seçilince sonraki açılışlar katılım değil)", () => {
    const def = rotaOyunu();
    expect(katilimAcilisiMi(def, { yol: [], hedef: null })).toBe(true);
    expect(katilimAcilisiMi(def, { yol: [], hedef: "d3" })).toBe(false);
    expect(katilimAcilisiMi(def, { yol: ["d3"], hedef: null })).toBe(false);
    const klasik = toDefinition(toModelOutput(makeDefinition(resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "macera", alan: "sinif" }), 8)), resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "macera", alan: "sinif" }));
    expect(klasik.ok && katilimAcilisiMi(klasik.definition, { yol: [], hedef: null })).toBe(false);
  });

  it("aynı anda katılan takımlar farklı sıra alır (gecikmeli Redis, atomik sayaç)", async () => {
    const redis = createLuaRedis();
    // Her komut 1-15 ms gecikir: istekler iç içe geçer (eski HSETNX + HLEN yolunda aynı sıra çıkıyordu).
    let tohum = 7;
    const gecikme = () => ((tohum = (tohum * 1103515245 + 12345) % 2 ** 31) % 15) + 1;
    const command: typeof redis.command = async (args) => {
      await new Promise((r) => setTimeout(r, gecikme()));
      return redis.command(args);
    };
    const store = createRedisGamesStore(command);
    const kod = "ABC-123";
    const now = Date.now();
    await store.create({ code: kod, adminTokenHash: "x", createdAt: now, expiresAt: now + 3_600_000, stops: [] } as never, now);
    const sonuc = await Promise.all(Array.from({ length: 8 }, (_, i) => joinGame(store, kod, `takim${i + 1}`, now)));
    const siralar = sonuc.map((r) => (r.status === "joined" ? r.sira : null));
    expect([...siralar].sort((a, b) => a! - b!)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // 8 takım 8 duraklı rotada 8 farklı yerden başlar.
    expect(new Set(siralar.map((s) => baslangicSec(rotaOyunu(), s))).size).toBe(8);
    expect(await store.playerCount(kod)).toBe(8);
  });

  it("katılım sırası sunucudan gelir (1, 2, …); alınmış takma ad sıra almaz", async () => {
    const store = createMemoryGamesStore();
    const kod = "ABC-123";
    await store.create({ code: kod, adminTokenHash: "x", createdAt: 1, expiresAt: Date.now() + 3_600_000, stops: [] } as never, Date.now());
    const a = await joinGame(store, kod, "ayse");
    const b = await joinGame(store, kod, "bora");
    expect([a, b].map((r) => (r.status === "joined" ? r.sira : null))).toEqual([1, 2]);
    expect((await joinGame(store, kod, "ayse")).status).toBe("taken");
    const c = await joinGame(store, kod, "cem");
    expect(c.status === "joined" && c.sira).toBe(3);
  });

  it("varış ipucu ve ceza kaydını korur; sahne kaydı yeniden yüklenince ipucu ve yanlış taramalar kalır, bozuklar atılır", () => {
    const s = arrive({ yol: [], hedef: "d1", ipucu: { d1: 2 }, yanlis: ["d1:4"] }, "d1");
    expect(s).toEqual({ yol: ["d1"], hedef: null, ipucu: { d1: 2 }, yanlis: ["d1:4"] });
    const depo = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => depo.get(k) ?? null,
      setItem: (k: string, v: string) => void depo.set(k, v),
      removeItem: (k: string) => void depo.delete(k),
    };
    try {
      saveSceneState(s);
      expect(loadSceneState()).toEqual(s);
      depo.set("dersera:sahne-yolu", JSON.stringify({ yol: ["d1"], hedef: null, ipucu: { d1: 7, d2: "x" }, yanlis: [3, "d1:2"] }));
      expect(loadSceneState()).toEqual({ yol: ["d1"], hedef: null, ipucu: {}, yanlis: ["d1:2"] });
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});

describe("güvenlik taraması", () => {
  it("konum bilmecesi metinleri de taranır", () => {
    const def = rotaOyunu();
    expect(cocukGuvenligiTara(def)).toEqual([]);
    def.duraklar[0].mekan.yer = { ...def.duraklar[0].mekan.yer!, ipucu_2: "Rafın yanındaki kutuya bak, aptal." };
    expect(cocukGuvenligiTara(def).some((e) => e.yer.includes("konum bilmecesi"))).toBe(true);
  });

  it("öğretmenin yazdığı mekân adı (serbest metin) da taranır; engelleyen ifade yayını durdurur", () => {
    const def = rotaOyunu();
    def.duraklar[1].mekan.yer = { ...def.duraklar[1].mekan.yer!, mekan_adi: "Siktir sınıfı" };
    expect(cocukGuvenligiTara(def).some((e) => e.engel && e.durakId === def.duraklar[1].id && e.yer.includes("konum bilmecesi"))).toBe(true);
    expect(yonetisimDegerlendir(def, validateGame(def, validationContext({ ...okul, rota: true }))).karar).toBe("BLOCK");
  });
});

describe("konum bilmecesinin sınıf düzeyine uyarlanması (rehber)", () => {
  const yer = konumYeri("kutuphane", "Oyun:d1");
  const iyi = { bilmece: "Kitapların arasında küçük bir sır saklıyorum. Beni bul!", ipucu_1: "Kitap okunan sessiz odada bu noktayı ara." };

  it("uygun uyarlama bilmeceyi ve 1. ipucunu değiştirir; mekân, nokta ve son ipucu bankadaki gibi kalır", () => {
    const r = uyarlamaUygula(yer, iyi, "PRIMARY_6_10");
    expect(r).toEqual({ yer: { ...yer, bilmece: iyi.bilmece, ipucu_1: iyi.ipucu_1 }, neden: null });
    expect(uyarlamaUygula(yer, undefined, "PRIMARY_6_10")).toEqual({ yer, neden: null });
  });

  it("uygun olmayan uyarlama reddedilir ve bankadaki metin kalır", () => {
    const red = (u: { bilmece: string; ipucu_1: string }, profil: Parameters<typeof uyarlamaUygula>[2] = "MIDDLE_11_14") => uyarlamaUygula(yer, u, profil);
    expect(red({ ...iyi, bilmece: "  " })).toEqual({ yer, neden: "boş" });
    // Düzeye göre uzunluk: ilkokulda kısa, lisede daha uzun bilmeceye yer var.
    const uzun = "Kelime ".repeat(25).trim();
    expect(red({ ...iyi, bilmece: uzun }, "PRIMARY_6_10").neden).toBe("uzun");
    expect(red({ ...iyi, bilmece: uzun }, "HIGH_15_18").neden).toBeNull();
    expect(red({ ...iyi, ipucu_1: ` ${iyi.bilmece.toUpperCase()} ` }).neden).toBe("ipucu aynı");
    expect(red({ ...iyi, ipucu_1: yer.ipucu_2 }).neden).toBe("ipucu aynı");
    // Başka bir mekânı adıyla anan uyarlama takımı yanlış yere gönderebilir; genel sözcükler ("sınıf") sayılmaz.
    expect(red({ ...iyi, bilmece: "Kantine gitmeden önce kitapların arasında beni bul." }).neden).toBe("başka mekân: kantin");
    expect(red({ ...iyi, bilmece: "Sınıftan çıkınca kitapların yanında beni bul." }).neden).toBeNull();
    expect(red({ ...iyi, bilmece: "Sen aptal değilsin, beni bulursun." }).neden).toBe("güvenlik");
  });

  it("ilkokulun kelime kuralına uyan iki cümlelik bilmece (20 kelime) sınıra takılmaz", () => {
    const b = "Kalın ansiklopediler yan yana dizilmiş, her birinin sırtında numaralar parlıyor. Bilgi arayan öğrenciler önümde durur, sen de beni bulabilir misin?";
    expect(b.split(/\s+/)).toHaveLength(20);
    expect(b.length).toBeGreaterThan(140);
    expect(uyarlamaUygula(yer, { ...iyi, bilmece: b }, "PRIMARY_6_10").neden).toBeNull();
  });

  it("bilmece görevin cevabını önceden verirse reddedilir; kısa parçalar ve bankada zaten geçenler sayılmaz", () => {
    expect(cevapParcalari("Kırılma", "A | Işık => Kırılma | b")).toEqual(["kirilma", "işik", "kirilma"]);
    expect(cevapParcalari("12", "Evt")).toEqual([]);
    const u = { bilmece: "Işık camdan geçerken kırılmaya uğrar; ben o camın önündeyim.", ipucu_1: iyi.ipucu_1 };
    expect(uyarlamaUygula(yer, u, "HIGH_15_18", cevapParcalari("Kırılma")).neden).toBe("cevap");
    expect(uyarlamaUygula(yer, u, "HIGH_15_18", cevapParcalari("Yansıma")).neden).toBeNull();
    const kitapli = { ...yer, ipucu_1: "Kırılma konusu kitaplarının yanına bak." };
    expect(uyarlamaUygula(kitapli, u, "HIGH_15_18", cevapParcalari("Kırılma")).neden).toBeNull();
  });

  it("noktanın adı yalnız son ipucunda: bilmece ya da 1. ipucu söylerse reddedilir", () => {
    const sabit: KonumYeri = {
      mekan_id: "kutuphane", mekan_adi: "Kütüphane", nokta: "Ansiklopedi rafı",
      bilmece: "Tek bir kitapta değil, cilt cilt dizilirim.", ipucu_1: "Numaralı kalın kitapları bul.", ipucu_2: "Ansiklopedilerin dizili olduğu rafa bak.",
    };
    expect(uyarlamaUygula(sabit, { ...iyi, bilmece: "Cevap basit: ansiklopedi rafına git." }, "MIDDLE_11_14").neden).toBe("nokta adı");
    expect(uyarlamaUygula(sabit, { ...iyi, ipucu_1: "Ansiklopedi rafında ara." }, "MIDDLE_11_14").neden).toBe("nokta adı");
    expect(uyarlamaUygula(sabit, iyi, "MIDDLE_11_14").neden).toBeNull();
  });

  it("mekân adlarının yaygın söylenişleri yakalanır; gündelik kullanımlar ('idare et') yakalanmaz", () => {
    const red = (bilmece: string) => uyarlamaUygula(yer, { ...iyi, bilmece }, "MIDDLE_11_14").neden;
    expect(red("Okulun kapısından girince kitapların arasında beni bul.")).toBe("başka mekân: okul-kapisi");
    expect(red("Öğretmen odasının önünden geçme, kitapların arasında beni bul.")).toBe("başka mekân: ogretmenler-odasi");
    expect(red("Az ışıkla idare et, kitapların arasında beni bul.")).toBeNull();
  });

  it("bankadaki metin başka mekânı zaten anıyorsa uyarlama da anabilir", () => {
    const bahce = { ...konumYeri("bahce", "Oyun:d2"), ipucu_1: "Kantinin arkasındaki ağaçlara bak." };
    const u = { bilmece: "Kantinin ardında yeşil bir köşe var. Beni bul.", ipucu_1: "Ağaçların olduğu yere git." };
    expect(uyarlamaUygula(bahce, u, "MIDDLE_11_14").neden).toBeNull();
    expect(uyarlamaUygula(bahce, { ...u, bilmece: "Yemekhanenin ardında yeşil bir köşe var." }, "MIDDLE_11_14").neden).toBe("başka mekân: yemekhane");
  });
});

describe("üretimde konum bilmecesi uyarlaması (parçalı akış)", () => {
  beforeEach(() => {
    jest.spyOn(console, "info").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  // Sahte model: aşamaya göre örnek oyundan yanıt verir; görev doldurmaya giden şema ve istemi kaydeder.
  async function parcaliIle(girdi: ResolvedInput) {
    const ornek = toModelOutput(makeDefinition(girdi, 8));
    if (girdi.alan === "okul") ornek.duraklar.forEach((d, i) => (d.mekan_id = MEKANLAR[i].id));
    const gorevler: { sema: unknown; prompt: string }[] = [];
    const istek = (async (sema, _ad, p) => {
      const prompt = `${p.ortak}\n${p.asama}`;
      if (prompt.includes("GÖREV DOLDURMA")) gorevler.push({ sema, prompt });
      return modelYaniti(ornek, prompt);
    }) as Istek;
    const out = await parcaliUret(girdi, buildRecipe(girdi.sure, girdi.deneyim, girdi.alan), IZINLI_QR_IDLERI, istek, 190_000, Date.now, 0);
    return { ornek, gorevler, out };
  }

  const ilkokul = resolvedInput({ sinif: 2, ders: "hayat-bilgisi", sure: 40, deneyim: "macera", alan: "okul" });

  it("rotada rehber her grubun bilmecesini bankadan ve sınıf düzeyi kuralıyla alır; uyarlama tanıma geçer, son ipucu ve nokta bankadan", async () => {
    const { ornek, gorevler, out } = await parcaliIle(ilkokul);
    const yerler = rotaYerleri(ornek.baslik, ornek.duraklar);
    expect(gorevler.every((g) => g.sema === GorevDoldurmaRotaSchema)).toBe(true);
    const ilk = gorevler.find((g) => /döndür: d1, d2, d3\n/.test(g.prompt))!.prompt;
    expect(ilk).toContain("İlkokul: en çok iki kısa cümle");
    // Denetimin sınırları ve cevap yasağı modele de söylenir.
    expect(ilk).toContain(`konum_bilmece en çok ${UYARLAMA_SINIRI.PRIMARY_6_10.bilmece} karakter, konum_ipucu_1 en çok ${UYARLAMA_SINIRI.PRIMARY_6_10.ipucu} karakter`);
    expect(ilk).toContain("durağın görevinin cevabını, seçeneklerini ya da çözümünü bilmecede ve ipucunda verme");
    expect(ilk).toContain(`d1 · ${yerler[0].mekan_adi} · nokta: ${yerler[0].nokta} · bilmece: ${yerler[0].bilmece}`);
    expect(ilk).not.toContain(yerler[3].bilmece);
    expect(out.duraklar.map((d) => d.konum)).toEqual(ornek.duraklar.map((d) => ornekUyarlama(d.isim)));

    const r = toDefinition(out, ilkokul);
    if (!r.ok) throw new Error(r.error);
    r.definition.duraklar.forEach((d, i) => {
      expect(d.mekan.yer).toEqual({ ...yerler[i], bilmece: ornekUyarlama(d.isim).bilmece, ipucu_1: ornekUyarlama(d.isim).ipucu_1 });
    });
  });

  it("lisede bilmece daha dolaylı istenir", async () => {
    const { gorevler } = await parcaliIle(okul);
    expect(gorevler[0].prompt).toContain("Lise: daha dolaylı");
    expect(gorevler[0].prompt).not.toContain("İlkokul:");
  });

  it("tek sınıf oyununda konum bilmecesi istenmez", async () => {
    const sinif = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "macera", alan: "sinif" });
    const { gorevler, out } = await parcaliIle(sinif);
    expect(gorevler.every((g) => g.sema === GorevDoldurmaSchema && !g.prompt.includes("konum_bilmece"))).toBe(true);
    expect(out.duraklar.every((d) => d.konum === undefined)).toBe(true);
  });

  it("uygun olmayan uyarlama yalnız o durakta bankaya döner ve sunucu kaydına yazılır", async () => {
    const { ornek, out } = await parcaliIle(ilkokul);
    const yerler = rotaYerleri(ornek.baslik, ornek.duraklar);
    out.duraklar[0].konum = { bilmece: "", ipucu_1: "x" };
    // Görevin cevabını veren uyarlama (cevap durağın kendi görevinden alınır).
    out.duraklar[1].dogru_cevap = "Fotosentez";
    out.duraklar[1].konum = { bilmece: "Fotosentez yapan yaprakların yanında beni bul.", ipucu_1: "Yeşil yapraklara bak." };
    const r = toDefinition(out, ilkokul);
    if (!r.ok) throw new Error(r.error);
    expect(r.definition.duraklar[0].mekan.yer).toEqual(yerler[0]);
    expect(r.definition.duraklar[1].mekan.yer).toEqual(yerler[1]);
    expect(r.definition.duraklar[2].mekan.yer?.bilmece).toBe(ornekUyarlama(ornek.duraklar[2].isim).bilmece);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("d1 konum bilmecesi uyarlaması kullanılmadı (boş)"));
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("d2 konum bilmecesi uyarlaması kullanılmadı (cevap)"));
  });

  it("düzeltme turu konum uyarlamasını ve mekânı korur; düzeltme istemine konum gitmez", async () => {
    const ornek = toModelOutput(makeDefinition(ilkokul, 8));
    ornek.duraklar.forEach((d, i) => (d.mekan_id = MEKANLAR[i].id));
    // d2'nin görevi boş gelir (soru-bos) → düzeltme çağrısı; model o çağrıda mekânı da değiştirmeye çalışır.
    ornek.duraklar[1].soru = "";
    const duzeltmeIstemleri: string[] = [];
    const client = {
      messages: {
        create: async (body: never) => {
          const prompt = promptOf(body);
          const y = prompt.includes("Düzeltilecek duraklar")
            ? (duzeltmeIstemleri.push(prompt), { duraklar: [{ ...ornek.duraklar[1], soru: "Yeni soru?", mekan_id: "kantin" }] })
            : modelYaniti(ornek, prompt);
          return { model: "test", stop_reason: "end_turn", usage: { output_tokens: 1 }, content: [{ type: "text", text: JSON.stringify(y) }] };
        },
      },
    } as never;
    const { definition, validation } = await composeAndValidate(ilkokul, client);
    expect(duzeltmeIstemleri).toHaveLength(1);
    expect(duzeltmeIstemleri[0].split("Düzeltilecek duraklar (JSON):")[1]).not.toContain('"konum"');
    expect(validation.hatalar.filter((h) => h.kod === "soru-bos")).toEqual([]);
    expect(definition.duraklar[1].gorev.soru).toBe("Yeni soru?");
    const yerler = rotaYerleri(ornek.baslik, ornek.duraklar);
    definition.duraklar.forEach((d, i) => expect(d.mekan.yer).toEqual({ ...yerler[i], ...ornekUyarlama(d.isim) }));
  });

  it("uçtan uca (sahte istemci): ilkokul okul macerası uyarlanmış bilmecelerle doğrulamadan geçer", async () => {
    const ornek = toModelOutput(makeDefinition(ilkokul, 8));
    ornek.duraklar.forEach((d, i) => (d.mekan_id = MEKANLAR[i].id));
    const { client } = fakeClient(ornek);
    const { definition, validation } = await composeAndValidate(ilkokul, client);
    expect(validation.hatalar.filter((h) => h.kod.startsWith("rota-"))).toEqual([]);
    expect(definition.duraklar.every((d) => d.mekan.yer?.bilmece === ornekUyarlama(d.isim).bilmece)).toBe(true);
  });
});

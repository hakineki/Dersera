import { getUniteler, PROGRAM_DERSLERI, SINIFLAR } from "@/data/mufredat/programlar";
import { IZINLI_QR_IDLERI, validationContext } from "@/lib/composer/context";
import type { GameDefinition } from "@/lib/composer/definition";
import { parseComposeInput, type ResolvedInput } from "@/lib/composer/input";
import { bosSablon } from "@/lib/composer/sablon";
import { validateGame } from "@/lib/composer/validator";
import { KAPILAR } from "@/lib/composer/yonetisim";
import { ayOf, KREDI_KURALLARI } from "@/lib/kredi";
import { maxDersSayisi } from "@/lib/composer/recipe";
import { clearRedisEnv } from "./helpers/fakeRedis";
import { buildApi, cerezli, hesapAc, jsonRequest } from "./helpers/api";

const SURELER = [20, 40, 60] as const;
const DENEYIMLER = ["macera", "dengeli", "ders"] as const;
const ALANLAR = ["sinif", "okul"] as const;
const DURAK_SAYISI = { 20: 5, 40: 8, 60: 12 };

// Boş şablonda yalnız öğretmenin yazacağı metinler eksik olabilir; rota, hedef, nesne ve QR kuralları baştan sağlanır.
const ICERIK_KODLARI = new Set(["soru-bos", "cevap-bicimi", "ipucu-eksik", "destek-eksik", "destek-aciklama", "secim-metni-bos", "final-eksik", "final-cevap"]);

function girdi(sure: number, deneyim: string, alan: string, dersler = [{ ders: "fizik", konuId: getUniteler(10, "fizik")[0].id }]): ResolvedInput {
  const r = parseComposeInput({ sinif: 10, dersler, sure, deneyim, alan });
  if (!r.ok) throw new Error(r.error);
  return r.input;
}

// Öğretmenin yazdığını taklit eder: her görev kendine özgü, kurallara uygun metinlerle doldurulur.
function doldur(def: GameDefinition, hikaye = (id: string) => `${id} durağında ipini bulduk.`): GameDefinition {
  return {
    ...def,
    hikaye_giris: "Okulun eski arşivinde bir not bulduk.",
    duraklar: def.duraklar.map((d) => ({
      ...d,
      hikaye_metni: hikaye(d.id),
      mekan: { ...d.mekan, sonraki_durak_tarifi: d.mekan.tur === "qr" ? "Kütüphanenin kapısına git." : "" },
      gorev: {
        ...d.gorev,
        soru: `${d.id} görevinin sorusu nedir?`,
        secenekler: [`${d.id} doğru`, `${d.id} yanlış bir`, `${d.id} yanlış iki`],
        dogru_cevap: `${d.id} doğru`,
        ipucu_1: `${d.id} için tanımı hatırla.`,
        ipucu_2: `${d.id} için birimlere bak.`,
        destek_gorevi: { soru: `${d.id} kolay soru?`, secenekler: ["Evet", "Hayır"], dogru_cevap: "Evet", aciklama: "Tanım böyle der." },
      },
      secimler: d.secimler.map((s, i) => ({ ...s, metin: i === 0 ? "Merdivenlerden in" : "Asansörü dene" })),
    })),
    final: { ...def.final, hikaye_metni: "Kanıtlar bir araya geldi.", soru: "Final sorusu?", secenekler: ["Birinci", "İkinci"], dogru_cevap: "Birinci", basari_metni: "Gizemi çözdün!" },
  };
}

describe("boş şablon iskeleti", () => {
  it.each(SURELER.flatMap((sure) => DENEYIMLER.flatMap((deneyim) => ALANLAR.map((alan) => [sure, deneyim, alan] as const))))(
    "%i dk %s %s: kurallar sağlanır, yalnız öğretmenin yazacağı metinler eksiktir; doldurulunca geçerlidir",
    (sure, deneyim, alan) => {
      const input = girdi(sure, deneyim, alan);
      const def = bosSablon(input);
      expect(def.meta).toMatchObject({ olusturma: "sablon", baslik: input.konuAdi, sure_dk: sure, deneyim, alan });
      expect(def.duraklar).toHaveLength(DURAK_SAYISI[sure]);
      expect(def).toEqual(bosSablon(input));

      const bos = validateGame(def, validationContext(input));
      expect(bos.gecerli).toBe(false);
      expect(bos.hatalar.filter((h) => !ICERIK_KODLARI.has(h.kod))).toEqual([]);

      const dolu = validateGame(doldur(def), validationContext(input));
      expect(dolu.hatalar).toEqual([]);
      // 20 dk macerada ikinci seçim bloğu sığmaz: yalnız orada bu uyarı (engel değil) kalabilir.
      const tolerans = sure === 20 && deneyim === "macera" ? ["secim-sayisi"] : [];
      expect(dolu.uyarilar.map((u) => u.kod).filter((k) => !tolerans.includes(k))).toEqual([]);

      // Öğrenci her durak geçişinde geçiş metnini görür: boş kart çıkmasın.
      expect(def.duraklar.filter((d) => d.varsayilan_sonraki_durak_id !== null || d.sahne_turu === "secim").every((d) => d.mekan.sonraki_durak_tarifi.trim())).toBe(true);

      const qrlar = def.duraklar.map((d) => d.mekan.qr_durak_id);
      if (alan === "okul") {
        expect(new Set(qrlar).size).toBe(qrlar.length);
        expect(qrlar.every((q) => q !== null && IZINLI_QR_IDLERI.includes(q))).toBe(true);
      } else expect(qrlar.every((q) => q === null)).toBe(true);
    }
  );

  it("tarama: her sınıf ve derste (1-2. sınıf ve tek çıktılı üniteler dahil) iskelet kuralları sağlar, doldurulunca geçerlidir", () => {
    const denemeler: [number, string, string, string, string][] = [];
    for (const sinif of SINIFLAR) {
      for (const ders of PROGRAM_DERSLERI) {
        const uniteler = getUniteler(sinif, ders).filter((u) => u.ogrenmeCiktilari.length);
        const secilen = new Set([uniteler[0], uniteler.find((u) => u.ogrenmeCiktilari.length === 1)].filter(Boolean).map((u) => u!.id));
        for (const konuId of secilen) {
          for (const [sure, deneyim, alan] of [[20, "macera", "okul"], [40, "dengeli", "sinif"], [60, "ders", "okul"]] as const) {
            const r = parseComposeInput({ sinif, dersler: [{ ders, konuId }], sure, deneyim, alan });
            if (!r.ok) throw new Error(r.error);
            const def = bosSablon(r.input);
            const bos = validateGame(def, validationContext(r.input)).hatalar.filter((h) => !ICERIK_KODLARI.has(h.kod));
            const dolu = validateGame(doldur(def), validationContext(r.input)).hatalar;
            if (bos.length || dolu.length) denemeler.push([sinif, ders, konuId, bos.map((h) => h.kod).join(), dolu.map((h) => h.kod).join()]);
          }
        }
      }
    }
    expect(denemeler).toEqual([]);
  });

  it("çok dersli en yoğun seçim: izin verilen en çok dersle her ders çalışılır", () => {
    for (const sure of SURELER) {
      const dersler = PROGRAM_DERSLERI.filter((ders) => getUniteler(10, ders).some((u) => u.ogrenmeCiktilari.length))
        .slice(0, maxDersSayisi(sure))
        .map((ders) => ({ ders, konuId: getUniteler(10, ders).find((u) => u.ogrenmeCiktilari.length)!.id }));
      const input = girdi(sure, "macera", "okul", dersler);
      expect(validateGame(doldur(bosSablon(input)), validationContext(input)).hatalar).toEqual([]);
    }
  });

  it("disiplinler arası: her seçili ders en az bir görevde çalışılır", () => {
    const dersler = [
      { ders: "fizik", konuId: getUniteler(10, "fizik")[0].id },
      { ders: "kimya", konuId: getUniteler(10, "kimya")[0].id },
    ];
    const input = girdi(40, "dengeli", "sinif", dersler);
    expect(validateGame(doldur(bosSablon(input)), validationContext(input)).hatalar).toEqual([]);
  });
});

describe("POST /api/compose/sablon ve şablon oyununun yayını", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  let ogretmen: string;
  const eski = { ...process.env };
  beforeEach(async () => {
    clearRedisEnv();
    process.env.ANTHROPIC_API_KEY = "test-key";
    delete process.env.OPENAI_API_KEY;
    api = await buildApi();
    ogretmen = await hesapAc(api, "ogretmen1");
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...eski };
  });

  const secim = { sinif: 10, dersler: [{ ders: "fizik", konuId: getUniteler(10, "fizik")[0].id }], sure: 40, deneyim: "dengeli", alan: "sinif" };
  const sablonIste = (c: string | null = ogretmen, govde: unknown = secim) => api.composeSablon.POST(cerezli(jsonRequest("/api/compose/sablon", govde), c));
  const yayinla = (definition: GameDefinition, dersler: unknown) => api.games.POST(jsonRequest("/api/games", { composer: { definition, dersler } }));
  const sayaclar = () => api.ogrenmeStore.getOgrenmeStore().sayaclar(ayOf(Date.now()));

  it("yalnız giriş yapmış öğretmene; yabancı köken ve geçersiz seçim reddedilir", async () => {
    expect((await sablonIste(null)).status).toBe(401);
    const yabanci = cerezli(jsonRequest("/api/compose/sablon", secim), ogretmen);
    yabanci.headers.set("origin", "https://kotu.example");
    expect((await api.composeSablon.POST(yabanci)).status).toBe(403);
    expect((await sablonIste(ogretmen, { ...secim, sure: 45 })).status).toBe(422);
  });

  it("yapay zekâ çağrılmaz, kredi düşmez, öğrenme sinyali yazılmaz; yanıt oluşturma yanıtıyla aynı biçimdedir", async () => {
    const uret = jest.spyOn(api.anthropic, "composeGame");
    const denetle = jest.spyOn(api.yzDenetim, "yzDenetle");
    const res = await sablonIste();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.definition.meta.olusturma).toBe("sablon");
    expect(json.validation.gecerli).toBe(false);
    expect(json.guvenlik).toEqual({ durum: "bekliyor" });
    expect(json.dersler).toEqual(secim.dersler);
    expect(json.hedefler.length).toBeGreaterThan(0);
    expect(json.kredi.toplam).toBe(KREDI_KURALLARI.aylikHak);
    expect((await (await sablonIste()).json()).kredi.toplam).toBe(KREDI_KURALLARI.aylikHak);
    expect(uret).not.toHaveBeenCalled();
    expect(denetle).not.toHaveBeenCalled();
    expect(await sayaclar()).toEqual({});
  });

  it(`yayında aynı ${KAPILAR.length - 2} sınıf kapısından geçer: boşken yayınlanamaz, engelli içerik durur, işaret kapı atlatmaz`, async () => {
    const denetle = jest.spyOn(api.yzDenetim, "yzDenetle").mockResolvedValue({ durum: "tamam", bulgular: [] });
    const { definition, dersler } = await (await sablonIste()).json();

    const bos = await yayinla(definition, dersler);
    expect(bos.status).toBe(422);
    expect((await bos.json()).error).toBe("Oyun doğrulamadan geçmedi; yayınlanamaz");

    // Kural tabanlı çocuk güvenliği taraması: işaretli ve işaretsiz tanım aynı kararı alır.
    const kufurlu = doldur(definition, (id) => (id === "d3" ? "Siktir git dedi." : `${id} durağında ipini bulduk.`));
    const isaretsiz = { ...kufurlu, meta: { ...kufurlu.meta, olusturma: undefined } };
    for (const d of [kufurlu, isaretsiz]) {
      const r = await yayinla(d, dersler);
      expect(r.status).toBe(422);
      const j = await r.json();
      expect(j.error).toBe("Oyun içerik denetiminden geçmedi; yayınlanamaz");
      expect(j.yonetisim.kapilar.find((k: { kapi: string }) => k.kapi === "cocuk-guvenligi").karar).toBe("BLOCK");
    }

    // Temiz şablon oyunu: bağlam denetimi yayında yapılır; sınıf yayınında benzerlik ve ekonomi kapıları uygulanmaz.
    denetle.mockClear();
    const temiz = doldur(definition);
    const ok = await yayinla(temiz, dersler);
    expect(ok.status).toBe(201);
    const pub = await ok.json();
    expect(denetle).toHaveBeenCalledTimes(1);
    expect(denetle.mock.calls[0][0].meta.olusturma).toBe("sablon");
    const kapilar = pub.yonetisim.kapilar.map((k: { kapi: string; karar: string }) => k.kapi);
    expect(kapilar).toEqual(KAPILAR.map((k) => k.id));
    expect(pub.yonetisim.karar).toBe("PASS");
    expect(pub.game.definition.meta.olusturma).toBe("sablon");

    // Kütüphaneden yayın da aynı yoldan geçer: boş şablon kütüphaneye kaydedilebilir ama yayınlanamaz.
    const kayit = await (await api.library.POST(cerezli(jsonRequest("/api/library", { definition, dersler }), ogretmen))).json();
    const kutuphanedenYayin = await api.libraryPublish.POST(cerezli(jsonRequest(`/api/library/${kayit.id}/publish`, {}), ogretmen), api.idParams(kayit.id));
    expect(kutuphanedenYayin.status).toBe(422);
  });

  it("şablon oyunları öğrenme döngüsüne girmez: öğrenci sonucu, kütüphane düzenlemesi ve yapay zekâ güncellemesi sayılmaz", async () => {
    jest.spyOn(api.yzDenetim, "yzDenetle").mockResolvedValue({ durum: "tamam", bulgular: [] });
    const { definition: bos, dersler } = await (await sablonIste()).json();
    const definition = doldur(bos);

    const pub = await (await yayinla(definition, dersler)).json();
    const { playerToken } = await (await api.join.POST(jsonRequest("/join", { nickname: "Kartal" }), api.params(pub.game.code))).json();
    const entry = { nickname: "Kartal", netSeconds: 100, penaltySeconds: 0, hintsUsed: 1, completedAt: Date.now(), stopDetails: { d1: { hintsUsed: 1, completedAt: 1 } } };
    expect((await api.results.POST(jsonRequest("/api/results", { gameCode: pub.game.code, playerToken, result: entry }))).status).toBe(201);

    const kayit = await (await api.library.POST(cerezli(jsonRequest("/api/library", { definition, dersler }), ogretmen))).json();
    const degisik = { ...definition, duraklar: definition.duraklar.map((d, i) => (i === 2 ? { ...d, gorev: { ...d.gorev, soru: "Değişen soru?" } } : d)) };
    const put = await api.libraryItem.PUT(
      cerezli(new Request(`http://localhost/api/library/${kayit.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ definition: degisik, surum: 1 }) }), ogretmen),
      api.idParams(kayit.id)
    );
    expect(put.status).toBe(200);

    jest.spyOn(api.composerService, "yapayZekaylaGuncelle").mockImplementation(
      async (def: GameDefinition) => ({ definition: def, validation: { gecerli: true, hatalar: [], uyarilar: [] }, guncellenen: [def.duraklar[0].id] }) as never
    );
    const req = cerezli(jsonRequest("/api/compose/guncelle", { definition, dersler, duraklar: ["d1"], talimat: "Daha somut yap" }), ogretmen);
    req.headers.set("x-forwarded-for", "9.9.9.9");
    expect((await api.composeGuncelle.POST(req)).status).toBe(200);

    expect(await sayaclar()).toEqual({});
    expect(await api.ogrenmeStore.getOgrenmeStore().talimatlar(5)).toEqual([]);
  });

  it("öğretmenin kendi öğrenme takibi şablon oyunlarını sayar; işaret kütüphanede ve kütüphaneden yayında korunur", async () => {
    jest.spyOn(api.yzDenetim, "yzDenetle").mockResolvedValue({ durum: "tamam", bulgular: [] });
    const { definition: bos, dersler } = await (await sablonIste()).json();
    const definition = doldur(bos);

    const pub = await (await api.games.POST(cerezli(jsonRequest("/api/games", { composer: { definition, dersler } }), ogretmen))).json();
    const { playerToken } = await (await api.join.POST(jsonRequest("/join", { nickname: "Kartal" }), api.params(pub.game.code))).json();
    const entry = { nickname: "Kartal", netSeconds: 100, penaltySeconds: 0, hintsUsed: 0, completedAt: Date.now(), stopDetails: { d1: { hintsUsed: 0, completedAt: 1 } } };
    expect((await api.results.POST(jsonRequest("/api/results", { gameCode: pub.game.code, playerToken, result: entry }))).status).toBe(201);
    const rapor = await (await api.ogrenmeTakibi.GET(cerezli(new Request("http://localhost/api/ogrenme-takibi"), ogretmen))).json();
    expect(rapor.bitiren[rapor.aylar.indexOf(ayOf(Date.now()))]).toBe(1);
    expect(await sayaclar()).toEqual({});

    const kayit = await (await api.library.POST(cerezli(jsonRequest("/api/library", { definition, dersler }), ogretmen))).json();
    const tekrar = await api.libraryPublish.POST(cerezli(jsonRequest(`/api/library/${kayit.id}/publish`, {}), ogretmen), api.idParams(kayit.id));
    expect(tekrar.status).toBe(201);
    expect((await tekrar.json()).game.definition.meta.olusturma).toBe("sablon");
  });
});

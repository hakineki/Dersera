import { buildRecipe, oyunTokenSiniri } from "@/lib/composer/recipe";
import { onar } from "@/lib/composer/repair";
import { composeAndValidate, validationContext } from "@/lib/composer/service";
import { validateGame } from "@/lib/composer/validator";
import type { GameDefinition } from "@/lib/composer/definition";
import type { ModelOutput } from "@/lib/composer/modelOutput";
import { makeDefinition, resolvedInput, toModelOutput } from "./helpers/composerFixtures";

const input = resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "dengeli", alan: "sinif" });
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const codes = (def: GameDefinition) => validateGame(def, validationContext(input)).hatalar.map((h) => h.kod);

describe("durak sayıları ve token sınırı", () => {
  it.each([
    [20, 5, 18_500],
    [40, 8, 26_000],
    [60, 12, 32_000],
  ])("%i dk → %i durak, %i token", (sure, durak, token) => {
    const r = buildRecipe(sure, "dengeli", "sinif");
    expect(r.anaGorev).toEqual({ min: durak, max: durak });
    expect(oyunTokenSiniri(r)).toBe(token);
  });
});

describe("fazla seçenek kırpma", () => {
  it("6 çiftli eşleştirmeyi 5 çifte indirir ve cevabı tutarlı tutar", () => {
    const def = clone(makeDefinition(input, 8));
    const ciftler = ["a => 1", "b => 2", "c => 3", "d => 4", "e => 5", "f => 6"];
    Object.assign(def.duraklar[0].gorev, { tur: "eslestirme", secenekler: ciftler, dogru_cevap: ciftler.join(" | ") });
    expect(codes(def)).toContain("cevap-bicimi");
    const r = onar(def);
    expect(r.definition.duraklar[0].gorev.secenekler).toHaveLength(5);
    expect(codes(r.definition)).toEqual([]);
    expect(r.notlar.some((n) => n.includes("5 taneye indirildi"))).toBe(true);
  });

  it("7 seçenekli çoktan seçmelide doğru cevabı korur", () => {
    const def = clone(makeDefinition(input, 8));
    Object.assign(def.duraklar[0].gorev, { secenekler: ["A", "B", "C", "D", "E", "F", "G"], dogru_cevap: "G" });
    const g = onar(def).definition.duraklar[0].gorev;
    expect(g.secenekler).toHaveLength(5);
    expect(g.secenekler).toContain("G");
  });

  it("8 öğeli sıralamayı doğru sıranın ilk 6 öğesine indirir", () => {
    const def = clone(makeDefinition(input, 8));
    const ogeler = ["h", "g", "f", "e", "d", "c", "b", "a"];
    Object.assign(def.duraklar[0].gorev, { tur: "siralama", secenekler: ogeler, dogru_cevap: "a | b | c | d | e | f | g | h" });
    const g = onar(def).definition.duraklar[0].gorev;
    expect(g.dogru_cevap).toBe("a | b | c | d | e | f");
    expect(g.secenekler).toEqual(["f", "e", "d", "c", "b", "a"]);
    expect(codes(onar(def).definition)).toEqual([]);
  });

  it("eksik seçeneği uydurmaz: 2 çiftli eşleştirme hatalı kalır", () => {
    const def = clone(makeDefinition(input, 8));
    Object.assign(def.duraklar[0].gorev, { tur: "eslestirme", secenekler: ["a => 1", "b => 2"], dogru_cevap: "a => 1 | b => 2" });
    expect(codes(onar(def).definition)).toContain("cevap-bicimi");
  });
});

describe("hedefli durak düzeltmesi", () => {
  const bozuk = () => {
    const out = toModelOutput(makeDefinition(input, 8));
    Object.assign(out.duraklar[1], { gorev_turu: "eslestirme", secenekler: ["İsra 36 => bilgi", "Mülk 23 => şükür"], dogru_cevap: "İsra 36 => bilgi | Mülk 23 => şükür" });
    return out;
  };
  // Sırayla yanıt veren sahte Anthropic istemcisi.
  function sahte(yanitlar: (unknown | Error)[]) {
    const calls: { body: { max_tokens: number; messages: { content: string }[] } }[] = [];
    let i = 0;
    const client = {
      messages: {
        create: async (body: never) => {
          calls.push({ body });
          const y = yanitlar[i++];
          if (y instanceof Error) throw y;
          return { model: "test", stop_reason: "end_turn", usage: { output_tokens: 1 }, content: [{ type: "text", text: JSON.stringify(y) }] };
        },
      },
    };
    return { client: client as never, calls };
  }
  beforeEach(() => {
    jest.spyOn(console, "info").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("hatalı durağı ikinci çağrıyla yeniden yazdırır; rota ve ödül yapısı korunur", async () => {
    const out = bozuk();
    const d2 = out.duraklar[1];
    const duzelmis = { ...d2, gorev_turu: "coktan_secmeli", secenekler: ["Bilgi", "Şükür", "Sabır"], dogru_cevap: "Bilgi", soru: "Yeni soru?", secimler: [], varsayilan_sonraki_durak_id: "d8", odul_id: "n9" };
    const { client, calls } = sahte([out, { duraklar: [duzelmis] }]);
    const { definition, validation } = await composeAndValidate(input, client);
    expect(calls).toHaveLength(2);
    expect(calls[1].body.max_tokens).toBe(8000);
    expect(calls[1].body.messages[0].content).toContain("3-5 çift olmalı");
    expect(calls[1].body.messages[0].content).toContain('"id":"d2"');
    expect(validation.gecerli).toBe(true);
    const yeni = definition.duraklar[1];
    expect(yeni.gorev.soru).toBe("Yeni soru?");
    // Model rota/ödül alanlarını değiştirse bile ilk çıktıdaki değerler kalır.
    expect(yeni.secimler).toEqual(makeDefinition(input, 8).duraklar[1].secimler);
    expect(yeni.sahne_turu).toBe("secim");
    expect(validation.uyarilar[0].mesaj).toContain("yeniden yazdırıldı");
  });

  it("hata yoksa ikinci çağrı yapılmaz", async () => {
    const { client, calls } = sahte([toModelOutput(makeDefinition(input, 8))]);
    await composeAndValidate(input, client);
    expect(calls).toHaveLength(1);
  });

  it("düzeltme çağrısı başarısız olursa ilk sonuç (hatalarıyla) döner", async () => {
    const { client } = sahte([bozuk(), new Error("ağ hatası")]);
    const { validation } = await composeAndValidate(input, client);
    expect(validation.gecerli).toBe(false);
    expect(validation.hatalar.map((h) => h.kod)).toContain("cevap-bicimi");
  });

  it("düzeltme hatayı azaltmazsa ilk sonuç döner", async () => {
    const out = bozuk();
    const { client } = sahte([out, { duraklar: [out.duraklar[1]] }]);
    const { validation } = await composeAndValidate(input, client);
    expect(validation.uyarilar.some((u) => u.mesaj.includes("yeniden yazdırıldı"))).toBe(false);
    expect(validation.gecerli).toBe(false);
  });

  it("ilk üretim süre bütçesini doldurduysa düzeltme denenmez", async () => {
    const { client, calls } = sahte([bozuk()]);
    let t = 0;
    const now = () => (t += 240_000);
    await composeAndValidate(input, client, now);
    expect(calls).toHaveLength(1);
  });

  it("yapısal (rota) hatası düzeltme çağrısı tetiklemez", async () => {
    const out: ModelOutput = toModelOutput(makeDefinition(input, 8));
    out.duraklar[5].varsayilan_sonraki_durak_id = "yok";
    const { client, calls } = sahte([out]);
    await composeAndValidate(input, client);
    expect(calls).toHaveLength(1);
  });
});

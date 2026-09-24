import { birlestir, gorevTokenSiniri, iskeletTokenSiniri, parcalara, parcaliUret, type Istek } from "@/lib/composer/parcali";
import { ComposeError } from "@/lib/composer/errors";
import { buildRecipe } from "@/lib/composer/recipe";
import { composeAndValidate } from "@/lib/composer/service";
import { IZINLI_QR_IDLERI } from "@/lib/composer/context";
import { GOREV_ISARETI, ISKELET_ISARETI } from "@/lib/composer/prompt";
import type { Iskelet, ModelOutput } from "@/lib/composer/modelOutput";
import { fakeClient, makeDefinition, modelYaniti, promptOf, resolvedInput, toModelOutput } from "./helpers/composerFixtures";

const input60 = resolvedInput({ sinif: 11, ders: "matematik", sure: 60, deneyim: "macera", alan: "okul" });
const recipe60 = buildRecipe(60, "macera", "okul");
const oyun12 = toModelOutput(makeDefinition(input60, 12));

beforeEach(() => {
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

// Aşamaya göre yanıt veren genel istek; eşzamanlı çağrı sayısını ölçer.
function sahteIstek(out: ModelOutput, opts: { hataGrubu?: (ids: string[]) => Error | null; gecikme?: number } = {}) {
  const kayit: { semaAdi: string; prompt: string; maxTokens: number; timeoutMs: number }[] = [];
  let aktif = 0;
  let enCok = 0;
  const istek = (async (_schema, semaAdi, prompt, maxTokens, timeoutMs) => {
    kayit.push({ semaAdi, prompt, maxTokens, timeoutMs });
    aktif++;
    enCok = Math.max(enCok, aktif);
    await new Promise((r) => setTimeout(r, opts.gecikme ?? 5));
    aktif--;
    if (semaAdi === "dersera_gorevler" && opts.hataGrubu) {
      const ids = prompt.match(/döndür: ([^\n]+)/)![1].split(", ");
      const h = opts.hataGrubu(ids);
      if (h) throw h;
    }
    return modelYaniti(out, prompt);
  }) as Istek;
  return { istek, kayit, enCok: () => enCok };
}

describe("parçalı üretim", () => {
  it("12 durak: önce iskelet, sonra 4 görev grubu PARALEL; birleşik çıktı tek çağrılık oyunla aynı", async () => {
    const s = sahteIstek(oyun12);
    const out = await parcaliUret(input60, recipe60, IZINLI_QR_IDLERI, s.istek, 190_000);
    expect(s.kayit.map((k) => k.semaAdi)).toEqual(["dersera_iskelet", "dersera_gorevler", "dersera_gorevler", "dersera_gorevler", "dersera_gorevler"]);
    expect(s.enCok()).toBe(4);
    expect(out).toEqual(oyun12);
  });

  it("token sınırları iskelette durak sayısıyla, görevde grup büyüklüğüyle ölçeklenir", async () => {
    const s = sahteIstek(oyun12);
    await parcaliUret(input60, recipe60, IZINLI_QR_IDLERI, s.istek, 190_000);
    expect(s.kayit[0].maxTokens).toBe(iskeletTokenSiniri(recipe60));
    expect(iskeletTokenSiniri(recipe60)).toBe(3_000 + 12 * 900);
    expect(s.kayit.slice(1).every((k) => k.maxTokens === gorevTokenSiniri(3))).toBe(true);
    expect(gorevTokenSiniri(3)).toBe(1_000 + 3 * 2_500);
    expect(parcalara(["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"]).map((g) => g.length)).toEqual([3, 3, 2]);
  });

  it("iskelet prompt'u görev içeriği yazdırmaz; grup prompt'u iskeleti ve yalnız o grubun kimliklerini taşır", async () => {
    const s = sahteIstek(oyun12);
    await parcaliUret(input60, recipe60, IZINLI_QR_IDLERI, s.istek, 190_000);
    expect(s.kayit[0].prompt).toContain(ISKELET_ISARETI);
    expect(s.kayit[0].prompt).toContain("gorev_ozeti");
    const grup = s.kayit[1].prompt;
    expect(grup).toContain(GOREV_ISARETI);
    expect(grup).toContain('"gorev_ozeti"');
    expect(grup).toMatch(/döndür: d1, d2, d3\n/);
  });

  it("bir grup başarısız olursa o duraklar boş kalır, diğerleri doldurulur", async () => {
    const s = sahteIstek(oyun12, { hataGrubu: (ids) => (ids.includes("d4") ? new Error("ağ") : null) });
    const out = await parcaliUret(input60, recipe60, IZINLI_QR_IDLERI, s.istek, 190_000);
    expect(out.duraklar.filter((d) => d.soru === "").map((d) => d.id)).toEqual(["d4", "d5", "d6"]);
    expect(out.duraklar[0].soru).toBe(oyun12.duraklar[0].soru);
  });

  it("tüm gruplar başarısızsa ilk hata iletilir", async () => {
    const s = sahteIstek(oyun12, { hataGrubu: () => new ComposeError("timeout", "süre") });
    await expect(parcaliUret(input60, recipe60, IZINLI_QR_IDLERI, s.istek, 190_000)).rejects.toMatchObject({ reason: "timeout" });
  });

  it("iskelet bütçeyi tükettiyse görev çağrısı yapılmaz; timeout döner", async () => {
    const s = sahteIstek(oyun12);
    let t = 0;
    const now = () => (t += 180_000);
    await expect(parcaliUret(input60, recipe60, IZINLI_QR_IDLERI, s.istek, 190_000, now)).rejects.toMatchObject({ reason: "timeout" });
    expect(s.kayit).toHaveLength(1);
  });

  it("birleştirme: başka grubun ya da bilinmeyen kimlik yok sayılır; görev türü yalnız doluysa değişir", () => {
    const iskelet = modelYaniti(oyun12, ISKELET_ISARETI) as Iskelet;
    const g1 = { ...(modelYaniti(oyun12, `${GOREV_ISARETI}\nYalnız şu durakların görev içeriğini yaz ve duraklar dizisinde döndür: d1\n`) as { duraklar: ModelOutput["duraklar"] }).duraklar[0] };
    const out = birlestir(iskelet, [{ ...g1, gorev_turu: "" } as never, { ...g1, id: "d99" } as never]);
    expect(out.duraklar[0].gorev_turu).toBe(oyun12.duraklar[0].gorev_turu);
    expect(out.duraklar).toHaveLength(12);
    const tur = birlestir(iskelet, [{ ...g1, gorev_turu: "coktan_secmeli" } as never]);
    expect(tur.duraklar[0].gorev_turu).toBe("coktan_secmeli");
  });

  it("uçtan uca: 60 dk okul oyunu parçalı üretimle geçerli çıkar; başarısız grup düzeltme adımıyla doldurulur", async () => {
    let grupHatasi = true;
    const cagrilar: string[] = [];
    const client = {
      messages: {
        create: async (body: Record<string, unknown>) => {
          const prompt = promptOf(body);
          cagrilar.push(prompt.includes("Düzeltilecek duraklar") ? "duzelt" : prompt.includes(ISKELET_ISARETI) ? "iskelet" : "gorev");
          // d10–d12 grubu bir kez başarısız olur; düzeltme adımı bu durakları yazar.
          if (prompt.includes("döndür: d10, d11, d12") && grupHatasi) {
            grupHatasi = false;
            throw new Error("geçici hata");
          }
          const yanit = prompt.includes("Düzeltilecek duraklar")
            ? { duraklar: oyun12.duraklar.filter((d) => ["d10", "d11", "d12"].includes(d.id)) }
            : modelYaniti(oyun12, prompt);
          return { model: "test", stop_reason: "end_turn", usage: { output_tokens: 1 }, content: [{ type: "text", text: JSON.stringify(yanit) }] };
        },
      },
    };
    const { validation } = await composeAndValidate(input60, client as never);
    expect(cagrilar.filter((c) => c === "iskelet")).toHaveLength(1);
    expect(cagrilar.filter((c) => c === "gorev")).toHaveLength(4);
    expect(cagrilar.filter((c) => c === "duzelt")).toHaveLength(1);
    expect(validation.gecerli).toBe(true);
  });

  it("fakeClient ile tam akış (tek çağrılık testlerle uyum)", async () => {
    const { client, calls } = fakeClient(oyun12);
    const { validation } = await composeAndValidate(input60, client);
    expect(calls).toHaveLength(5);
    expect(validation.gecerli).toBe(true);
  });
});

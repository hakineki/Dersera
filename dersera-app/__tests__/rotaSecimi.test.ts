import { getUniteler } from "@/data/mufredat/programlar";
import { mekanBilmeceleri } from "@/data/konumBilmeceleri";
import { MEKANLAR } from "@/data/mekanlar";
import { parseComposeInput } from "@/lib/composer/input";
import { mekanlariAta, rotaYerleri } from "@/lib/composer/mekanYerlesimi";
import { buildUserPrompt } from "@/lib/composer/prompt";
import { buildRecipe } from "@/lib/composer/recipe";
import { composeAndValidate } from "@/lib/composer/service";
import { clearRedisEnv } from "./helpers/fakeRedis";
import { buildApi, cerezli, jsonRequest, oturumCerezi } from "./helpers/api";
import { fakeClient, makeDefinition, resolvedInput, toModelOutput } from "./helpers/composerFixtures";

// Öğretmenin rota seçimi (mekân rotası 3. aşama): oluşturma formunda durakların mekânı ve okuldaki adı; düzenleyicide
// mekânın hazır bilmecelerinden seçim (oturumlu uç).

describe("rota seçimi girdisi", () => {
  const konu = getUniteler(10, "fizik")[0];
  const okul = { sinif: 10, dersler: [{ ders: "fizik", konuId: konu.id }], sure: 40, deneyim: "macera", alan: "okul" };
  const rota = (rota_secimi: unknown, govde: Record<string, unknown> = okul) => parseComposeInput({ ...govde, rota_secimi });

  it("seçilen mekânlar ve okuldaki adları girdiye geçer; görünmez karakter atılır, listedeki adla aynı ad yok sayılır", () => {
    const r = rota([{ mekan_id: "kantin" }, null, { mekan_id: "sinif", ad: "  10-A\u200b   sınıfı " }, { mekan_id: "bahce", ad: "Bahçe" }]);
    if (!r.ok) throw new Error(r.error);
    expect(r.input.rota_secimi).toEqual([{ mekan_id: "kantin" }, null, { mekan_id: "sinif", ad: "10-A sınıfı" }, { mekan_id: "bahce" }]);
  });

  it("hiç mekân seçilmediyse (tamamı rehberde) rota seçimi yoktur; alan hiç gönderilmezse girdi eskisi gibi", () => {
    const r = rota([null, null, null]);
    expect(r.ok && r.input.rota_secimi).toBeUndefined();
    const eski = parseComposeInput(okul);
    expect(eski.ok && "rota_secimi" in eski.input).toBe(false);
  });

  it.each([
    ["bilinmeyen mekân", [{ mekan_id: "uzay-ussu" }]],
    ["aynı mekân iki kez", [{ mekan_id: "kantin" }, { mekan_id: "kantin", ad: "Üst kantin" }]],
    ["durak sayısından fazla satır (40 dk = 8 durak)", Array.from({ length: 9 }, (_, i) => (i === 0 ? { mekan_id: "kantin" } : null))],
  ])("geçersiz seçim reddedilir: %s", (_ad, secim) => {
    expect(rota(secim)).toEqual({ ok: false, error: "Geçersiz rota seçimi." });
  });

  it("tek sınıf oyununda, uzun adda ya da tanımsız alanda reddedilir", () => {
    expect(rota([{ mekan_id: "kantin" }], { ...okul, alan: "sinif" }).ok).toBe(false);
    expect(rota([{ mekan_id: "kantin", ad: "x".repeat(41) }]).ok).toBe(false);
    expect(rota([{ mekan_id: "kantin", kat: 2 }]).ok).toBe(false);
    expect(rota(Array.from({ length: 6 }, (_, i) => (i === 0 ? { mekan_id: "kantin" } : null)), { ...okul, sure: 20 }).ok).toBe(false);
  });
});

describe("öğretmenin seçtiği mekânlar sabittir", () => {
  it("model seçimi öğretmenin mekânlarıyla çakışırsa ilk boş mekânla değişir", () => {
    expect(mekanlariAta(["kantin", "kutuphane", "uzay-ussu"], ["kutuphane", null, null])).toEqual(["kutuphane", "sinif", "bahce"]);
  });

  it("rota yerleri öğretmenin mekânını ve okuldaki adını kullanır; bilmece o mekânın bankasından", () => {
    const yerler = rotaYerleri("Oyun", [{ id: "d1", mekan_id: "sinif" }, { id: "d2", mekan_id: "kantin" }], [{ mekan_id: "kantin", ad: "Alt kat kantini" }, null]);
    expect(yerler[0]).toMatchObject({ mekan_id: "kantin", mekan_adi: "Alt kat kantini" });
    expect(mekanBilmeceleri("kantin").some((b) => b.nokta === yerler[0].nokta)).toBe(true);
    // d2'yi model kantin seçmişti; kantin öğretmenin olduğu için başka mekân alır.
    expect(yerler[1].mekan_id).not.toBe("kantin");
  });

  it("istem: öğretmenin rotası durak sırasıyla ve okuldaki adıyla verilir; seçim yoksa bölüm yok", () => {
    const girdi = { ...resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "macera", alan: "okul" }), rota_secimi: [{ mekan_id: "kantin" }, null, { mekan_id: "sinif", ad: 'Kat 2 "A" sınıfı' }] };
    const p = buildUserPrompt(girdi, buildRecipe(40, "macera", "okul"), []);
    expect(p).toContain("Öğretmen rotayı belirledi (durak sırasıyla)");
    expect(p).toContain("d1: kantin (Kantin)");
    expect(p).toContain("d2: rehber seçer");
    expect(p).toContain(`d3: sinif (Sınıf; okuldaki adı "Kat 2 'A' sınıfı")`);
    expect(p).toContain("d8: rehber seçer");
    expect(p).not.toContain("d9:");
    expect(buildUserPrompt({ ...girdi, rota_secimi: undefined }, buildRecipe(40, "macera", "okul"), [])).not.toContain("Öğretmen rotayı belirledi");
  });

  it("uçtan uca (sahte istemci): oyun öğretmenin rotasıyla üretilir; model başka mekân yazdıysa öğretmene not düşülür", async () => {
    jest.spyOn(console, "info").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const girdi = {
      ...resolvedInput({ sinif: 10, ders: "fizik", sure: 40, deneyim: "macera", alan: "okul" }),
      rota_secimi: [{ mekan_id: "kantin" }, null, { mekan_id: "sinif", ad: "10-A sınıfı" }],
    };
    const ornek = toModelOutput(makeDefinition(girdi, 8));
    // Model sırayla listedeki mekânları yazar: d1 "sinif" (öğretmen kantin dedi), d5 "kantin" (öğretmenin d1'iyle çakışır).
    ornek.duraklar.forEach((d, i) => (d.mekan_id = MEKANLAR[i].id));
    const { client } = fakeClient(ornek);
    const { definition, validation } = await composeAndValidate(girdi, client);
    const yerler = definition.duraklar.map((d) => d.mekan.yer!);
    expect(yerler[0]).toMatchObject({ mekan_id: "kantin", mekan_adi: "Kantin" });
    expect(yerler[2]).toMatchObject({ mekan_id: "sinif", mekan_adi: "10-A sınıfı" });
    expect(new Set(yerler.map((y) => y.mekan_id)).size).toBe(8);
    expect(validation.hatalar.filter((h) => h.kod.startsWith("rota-"))).toEqual([]);
    expect(validation.uyarilar.some((u) => u.mesaj.includes("rotada seçtiğiniz Kantin kullanıldı"))).toBe(true);
    jest.restoreAllMocks();
  });
});

describe("hazır bilmeceler ucu (düzenleyici)", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;
  beforeEach(async () => {
    clearRedisEnv();
    delete process.env.KAYIT_DAVET_KODU;
    api = await buildApi();
  });
  const iste = (mekan: string, cerez: string | null) => api.konumBilmeceleri.GET(cerezli(new Request(`http://localhost/api/compose/konum-bilmeceleri?mekan=${mekan}`), cerez));

  it("oturumsuz istek reddedilir; öğretmen bilinen mekânın 10 bilmecesini alır, bilinmeyen mekân 400", async () => {
    expect((await iste("kantin", null)).status).toBe(401);
    const kayit = await api.kayit.POST(jsonRequest("/api/auth/kayit", { kullaniciAdi: "ogretmen1", sifre: "gizli-sifre-1", kosulOnayi: true }));
    const cerez = oturumCerezi(kayit);
    const res = await iste("kantin", cerez);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { bilmeceler } = await res.json();
    expect(bilmeceler).toHaveLength(10);
    expect(bilmeceler[0]).toEqual(
      (({ id, nokta, bilmece, ipucu1, ipucu2 }) => ({ id, nokta, bilmece, ipucu1, ipucu2 }))(mekanBilmeceleri("kantin")[0])
    );
    expect((await iste("uzay-ussu", cerez)).status).toBe(400);
  });
});

import { clearRedisEnv, recordingCommand } from "./helpers/fakeRedis";
import { buildApi, cerezli, jsonRequest, oturumCerezi } from "./helpers/api";
import { kullaniciAdiNormal, sifreDogru, sifreOzeti } from "@/lib/auth";
import { createRedisAuthStore } from "@/lib/authStore";

describe("öğretmen hesabı", () => {
  let api: Awaited<ReturnType<typeof buildApi>>;

  beforeEach(async () => {
    clearRedisEnv();
    delete process.env.KAYIT_DAVET_KODU;
    api = await buildApi();
  });

  const post = (route: { POST: (r: Request) => Promise<Response> }, path: string, body: unknown, cerez: string | null = null, ip = "1.1.1.1") => {
    const req = cerezli(jsonRequest(path, body), cerez);
    req.headers.set("x-forwarded-for", ip);
    return route.POST(req);
  };
  const kayit = (kullaniciAdi: string, sifre = "gizli-sifre-1", extra: Record<string, unknown> = {}, ip?: string) =>
    post(api.kayit, "/api/auth/kayit", { kullaniciAdi, sifre, ...extra }, null, ip);
  const giris = (kullaniciAdi: string, sifre: string, ip?: string) => post(api.giris, "/api/auth/giris", { kullaniciAdi, sifre }, null, ip);
  const ben = async (cerez: string | null) => (await (await api.ben.GET(cerezli(new Request("http://localhost/api/auth/ben"), cerez))).json()).hesap;

  it("kayıt hesabı açar ve güvenli oturum çerezi yazar", async () => {
    const res = await kayit("Ayşe.Yılmaz");
    expect(res.status).toBe(201);
    expect((await res.json()).hesap.kullaniciAdi).toBe("ayşe.yılmaz");
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/^dersera_oturum=[A-Za-z0-9_-]{40,}/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toMatch(/Path=\//);
    expect((await ben(oturumCerezi(res))).kullaniciAdi).toBe("ayşe.yılmaz");
  });

  it("yanıt ve oturum bilgisi şifre özetini ya da iç kimliği sızdırmaz", async () => {
    const res = await kayit("ayse");
    const govde = JSON.stringify(await res.json()) + JSON.stringify(await ben(oturumCerezi(res)));
    expect(govde).not.toMatch(/scrypt|sifreOzeti|gizli-sifre|"id"/);
  });

  it("kullanıcı adı büyük/küçük harf duyarsız ve benzersizdir", async () => {
    expect((await kayit("ayse")).status).toBe(201);
    expect((await kayit("AYSE", "baska-sifre-9")).status).toBe(409);
    expect((await giris("Ayse", "gizli-sifre-1")).status).toBe(200);
  });

  it.each([
    ["kısa şifre", "ayse", "kisa"],
    ["kısa kullanıcı adı", "ay", "gizli-sifre-1"],
    ["boşluklu kullanıcı adı", "ay se", "gizli-sifre-1"],
    ["şifre yok", "ayse", undefined],
  ])("geçersiz kayıt reddedilir: %s", async (_l, ad, sifre) => {
    const res = await post(api.kayit, "/api/auth/kayit", { kullaniciAdi: ad, sifre });
    expect(res.status).toBe(422);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("davet kodu tanımlıysa kayıt onu ister", async () => {
    process.env.KAYIT_DAVET_KODU = "okul2026";
    expect((await kayit("ayse")).status).toBe(403);
    expect((await kayit("ayse", "gizli-sifre-1", { davetKodu: "yanlis" })).status).toBe(403);
    expect((await kayit("ayse", "gizli-sifre-1", { davetKodu: "okul2026" })).status).toBe(201);
    const bilgi = await (await api.ben.GET(new Request("http://localhost/api/auth/ben"))).json();
    expect(bilgi.davetGerekli).toBe(true);
    delete process.env.KAYIT_DAVET_KODU;
  });

  it("yanlış şifre ve olmayan kullanıcı aynı yanıtı verir; çerez yazılmaz", async () => {
    await kayit("ayse");
    const a = await giris("ayse", "yanlis-sifre-1");
    const b = await giris("olmayan", "yanlis-sifre-1");
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(await a.json()).toEqual(await b.json());
    expect(a.headers.get("set-cookie")).toBeNull();
  });

  it("çıkış oturumu sunucuda da kapatır: eski çerez artık geçmez", async () => {
    const cerez = oturumCerezi(await kayit("ayse"));
    expect(await ben(cerez)).not.toBeNull();
    const cikis = await post(api.cikis, "/api/auth/cikis", {}, cerez);
    expect(cikis.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
    expect(await ben(cerez)).toBeNull();
  });

  it("uydurma ya da aşırı uzun belirteç oturum sayılmaz", async () => {
    await kayit("ayse");
    expect(await ben("dersera_oturum=uydurma")).toBeNull();
    expect(await ben(`dersera_oturum=${"a".repeat(500)}`)).toBeNull();
  });

  it("şifre değişince diğer cihazların oturumları kapanır; yeni şifre çalışır, eskisi çalışmaz", async () => {
    const cihaz1 = oturumCerezi(await kayit("ayse"))!;
    const cihaz2 = oturumCerezi(await giris("ayse", "gizli-sifre-1"))!;
    expect((await post(api.sifre, "/api/auth/sifre", { mevcutSifre: "yanlis-sifre", yeniSifre: "yeni-sifre-22" }, cihaz1)).status).toBe(403);
    expect((await post(api.sifre, "/api/auth/sifre", { mevcutSifre: "gizli-sifre-1", yeniSifre: "kisa" }, cihaz1)).status).toBe(422);
    const res = await post(api.sifre, "/api/auth/sifre", { mevcutSifre: "gizli-sifre-1", yeniSifre: "yeni-sifre-22" }, cihaz1);
    expect(res.status).toBe(200);
    const yeniCerez = oturumCerezi(res);
    expect(await ben(cihaz2)).toBeNull();
    expect(await ben(cihaz1)).toBeNull();
    expect((await ben(yeniCerez)).kullaniciAdi).toBe("ayse");
    expect((await giris("ayse", "gizli-sifre-1")).status).toBe(401);
    expect((await giris("ayse", "yeni-sifre-22")).status).toBe(200);
  });

  it("kullanıcı adı şifreyle değişir; eski ad boşa çıkar, alınmış ada geçilemez, oturum sürer", async () => {
    const cerez = oturumCerezi(await kayit("ayse"))!;
    await kayit("mehmet");
    const degistir = (yeniKullaniciAdi: string, sifre: string) => post(api.ad, "/api/auth/ad", { yeniKullaniciAdi, sifre }, cerez);
    expect((await degistir("ayse2", "yanlis-sifre")).status).toBe(403);
    expect((await degistir("Mehmet", "gizli-sifre-1")).status).toBe(409);
    expect((await degistir("a", "gizli-sifre-1")).status).toBe(422);
    const res = await degistir("ayse.hoca", "gizli-sifre-1");
    expect(res.status).toBe(200);
    expect((await res.json()).hesap.kullaniciAdi).toBe("ayse.hoca");
    expect((await ben(cerez)).kullaniciAdi).toBe("ayse.hoca");
    expect((await giris("ayse", "gizli-sifre-1")).status).toBe(401);
    expect((await giris("ayse.hoca", "gizli-sifre-1")).status).toBe(200);
    expect((await kayit("ayse", "baska-sifre-9")).status).toBe(201);
  });

  it("hesap işlemleri oturum ister", async () => {
    expect((await post(api.sifre, "/api/auth/sifre", { mevcutSifre: "x", yeniSifre: "yeni-sifre-22" })).status).toBe(401);
    expect((await post(api.ad, "/api/auth/ad", { yeniKullaniciAdi: "x", sifre: "x" })).status).toBe(401);
  });

  it("kullanıcı adına yönelik kaba kuvvet denemesi sınırlanır (farklı IP'lerden de)", async () => {
    await kayit("ayse");
    const durumlar: number[] = [];
    for (let i = 0; i < 11; i++) durumlar.push((await giris("ayse", "yanlis-sifre-1", `10.0.0.${i}`)).status);
    expect(durumlar.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(durumlar[10]).toBe(429);
    // Sınır dolunca doğru şifre de bekler; hesap adı başka IP'den de korunur.
    expect((await giris("ayse", "gizli-sifre-1", "10.9.9.9")).status).toBe(429);
  });

  it("aynı IP'den çok sayıda kayıt sınırlanır", async () => {
    const durumlar: number[] = [];
    for (let i = 0; i < 11; i++) durumlar.push((await kayit(`ogretmen${i}`, "gizli-sifre-1", {}, "2.2.2.2")).status);
    expect(durumlar.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(durumlar[10]).toBe(429);
  });
});

describe("şifre özeti", () => {
  it("scrypt ve tuz kullanır; aynı şifre iki kez farklı özetlenir, doğrulama çalışır", async () => {
    const a = await sifreOzeti("gizli-sifre-1");
    const b = await sifreOzeti("gizli-sifre-1");
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain("gizli-sifre-1");
    expect(await sifreDogru("gizli-sifre-1", a)).toBe(true);
    expect(await sifreDogru("gizli-sifre-2", a)).toBe(false);
    expect(await sifreDogru("gizli-sifre-1", "bozuk")).toBe(false);
  });

  it("kullanıcı adı Türkçe kurallarla küçültülür", () => {
    expect(kullaniciAdiNormal("  İlker.ÖZ ")).toBe("ilker.öz");
    expect(kullaniciAdiNormal("a b")).toBeNull();
    expect(kullaniciAdiNormal(42)).toBeNull();
  });
});

describe("Redis hesap deposu", () => {
  it("kullanıcı adını NX ile alır; oturum belirteci yerine özetini süreli saklar", async () => {
    const db = new Map<string, string>();
    const { command, calls } = recordingCommand((a) => {
      if (a[0] === "SET") {
        if (a.includes("NX") && db.has(a[1])) return null;
        db.set(a[1], a[2]);
        return "OK";
      }
      if (a[0] === "GET") return db.get(a[1]) ?? null;
      if (a[0] === "DEL") return db.delete(a[1]) ? 1 : 0;
    });
    const s = createRedisAuthStore(command);
    const h = { id: "abc", kullaniciAdi: "ayse", sifreOzeti: "x", surum: 1, olusturma: 1 };
    expect(await s.olustur(h)).toBe(true);
    expect(await s.olustur({ ...h, id: "def" })).toBe(false);
    expect(await s.idByAd("ayse")).toBe("abc");
    await s.oturumYaz("ozet123", { id: "abc", surum: 1 }, 1000);
    const oturumYazma = calls.find((c) => c[1] === "dersera:oturum:ozet123")!;
    expect(oturumYazma).toEqual(["SET", "dersera:oturum:ozet123", JSON.stringify({ id: "abc", surum: 1 }), "PX", "1000"]);
    expect(await s.adTasi("abc", "ayse", "ayse2")).toBe(true);
    expect(await s.idByAd("ayse")).toBeNull();
  });
});

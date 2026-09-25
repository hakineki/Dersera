import { ayniHesap, clearTeacherGame, loadTeacherGame, saveTeacherGame, TEACHER_GAME_KEY, type TeacherGame } from "../lib/teacherGame";
import type { HesapOzeti } from "../lib/authClient";

const store: Record<string, string> = {};
Object.defineProperty(global, "localStorage", {
  value: {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  },
  writable: false,
});

const ayse: HesapOzeti = { kullaniciAdi: "ayse.ogretmen", olusturma: 1_750_000_000_000 };
const mehmet: HesapOzeti = { kullaniciAdi: "mehmet.ogretmen", olusturma: 1_750_000_500_000 };
const oyun: TeacherGame = {
  game: { code: "FYU-204", stops: [], aylar: ["eylul"], createdAt: 1, expiresAt: 2, endedAt: null },
  adminToken: "gizli-yonetim-belirteci",
};

describe("teacherGame — kayıt yayınlayan hesaba bağlı", () => {
  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k]);
  });

  it("anahtar değişmedi; kayıt sahibini taşır", () => {
    saveTeacherGame(oyun, ayse);
    expect(TEACHER_GAME_KEY).toBe("dersera:teacher-game");
    const kayit = JSON.parse(store[TEACHER_GAME_KEY]);
    expect(kayit.sahip).toEqual(expect.any(String));
    expect(kayit.adminToken).toBe(oyun.adminToken);
  });

  it("kaydeden hesap oyununu geri okur", () => {
    saveTeacherGame(oyun, ayse);
    expect(loadTeacherGame(ayse)).toEqual(oyun);
  });

  it("ortak bilgisayarda başka hesap öncekinin oyununu ve yönetim belirtecini okuyamaz; kayıt sahibine kalır", () => {
    saveTeacherGame(oyun, ayse);
    expect(loadTeacherGame(mehmet)).toBeNull();
    expect(loadTeacherGame(ayse)).toEqual(oyun);
  });

  it("boşalan kullanıcı adına sonradan kaydolan hesap eski sahibin kaydını okuyamaz", () => {
    saveTeacherGame(oyun, ayse);
    expect(loadTeacherGame({ kullaniciAdi: ayse.kullaniciAdi, olusturma: ayse.olusturma + 1 })).toBeNull();
  });

  it("kullanıcı adı (bu ya da başka cihazda) değişse de kayıt hesabında kalır", () => {
    saveTeacherGame(oyun, ayse);
    expect(loadTeacherGame({ ...ayse, kullaniciAdi: "ayse.yilmaz" })).toEqual(oyun);
  });

  it("ayniHesap yalnız aynı hesabı eşler: ad değişse de aynı, boşalan ada kaydolan farklı, çıkış yapılmışsa değil", () => {
    expect(ayniHesap(ayse, { ...ayse, kullaniciAdi: "ayse.yilmaz" })).toBe(true);
    expect(ayniHesap(ayse, { ...ayse, olusturma: ayse.olusturma + 1 })).toBe(false);
    expect(ayniHesap(ayse, mehmet)).toBe(false);
    expect(ayniHesap(null, ayse)).toBe(false);
    expect(ayniHesap(ayse, null)).toBe(false);
  });

  it("hesaba bağlanmadan önceki sahipsiz kayıt kimseye verilmez ve silinir", () => {
    store[TEACHER_GAME_KEY] = JSON.stringify(oyun);
    expect(loadTeacherGame(ayse)).toBeNull();
    expect(store[TEACHER_GAME_KEY]).toBeUndefined();
    expect(loadTeacherGame(mehmet)).toBeNull();
  });

  it("çıkışta kayıt, kimin olursa olsun, silinir", () => {
    saveTeacherGame(oyun, ayse);
    clearTeacherGame();
    expect(store[TEACHER_GAME_KEY]).toBeUndefined();
    expect(loadTeacherGame(ayse)).toBeNull();
  });

  it("bozuk ya da eksik kayıtta null döner", () => {
    store[TEACHER_GAME_KEY] = "!!!bozuk";
    expect(loadTeacherGame(ayse)).toBeNull();
    saveTeacherGame(oyun, ayse);
    const kayit = JSON.parse(store[TEACHER_GAME_KEY]);
    store[TEACHER_GAME_KEY] = JSON.stringify({ ...kayit, adminToken: 42 });
    expect(loadTeacherGame(ayse)).toBeNull();
  });
});

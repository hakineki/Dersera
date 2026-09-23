import {
  loadTeacherCreds,
  saveTeacherCreds,
  verifyTeacher,
  loadTeacherSession,
  setTeacherSession,
  TEACHER_STORAGE_KEYS,
} from "../lib/teacherAuth";

// Node ortamında localStorage mock'u
const store: Record<string, string> = {};
Object.defineProperty(global, "localStorage", {
  value: {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  },
  writable: true,
});

beforeEach(() => {
  localStorage.clear();
});

describe("öğretmen kimlik bilgileri", () => {
  test("varsayılan kimlik: ogretmen / dersera2025", () => {
    const creds = loadTeacherCreds();
    expect(creds.username).toBe("ogretmen");
    expect(creds.password).toBe("dersera2025");
  });

  test("doğru giriş onaylanır", () => {
    expect(verifyTeacher("ogretmen", "dersera2025")).toBe(true);
  });

  test("yanlış şifre reddedilir", () => {
    expect(verifyTeacher("ogretmen", "yanlis")).toBe(false);
  });

  test("yanlış kullanıcı adı reddedilir", () => {
    expect(verifyTeacher("admin", "dersera2025")).toBe(false);
  });

  test("boş giriş reddedilir", () => {
    expect(verifyTeacher("", "")).toBe(false);
  });

  test("kaydedilen kimlik bilgileri geçerli olur", () => {
    saveTeacherCreds("mudur", "gizli123");
    expect(verifyTeacher("mudur", "gizli123")).toBe(true);
    expect(verifyTeacher("ogretmen", "dersera2025")).toBe(false);
  });

  test("kullanıcı adı trim'lenir", () => {
    saveTeacherCreds("  ogretmen  ", "dersera2025");
    const creds = loadTeacherCreds();
    expect(creds.username).toBe("ogretmen");
  });

  test("localStorage doğru anahtara kaydeder", () => {
    saveTeacherCreds("test", "pass1234");
    const raw = localStorage.getItem(TEACHER_STORAGE_KEYS.CREDS);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.username).toBe("test");
    expect(parsed.password).toBe("pass1234");
  });
});

describe("öğretmen oturumu", () => {
  test("başlangıçta oturum yok", () => {
    expect(loadTeacherSession()).toBe(false);
  });

  test("oturum açılır", () => {
    setTeacherSession(true);
    expect(loadTeacherSession()).toBe(true);
  });

  test("oturum kapatılır", () => {
    setTeacherSession(true);
    setTeacherSession(false);
    expect(loadTeacherSession()).toBe(false);
  });

  test("localStorage doğru anahtara kaydeder", () => {
    setTeacherSession(true);
    expect(localStorage.getItem(TEACHER_STORAGE_KEYS.SESSION)).toBe("1");
  });
});

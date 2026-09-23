import { loadPilotInfo, savePilotInfo, PILOT_STORAGE_KEY, type PilotInfo } from "../lib/pilotInfo";

const store: Record<string, string> = {};
Object.defineProperty(global, "localStorage", {
  value: {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  },
  writable: false,
});

describe("pilotInfo", () => {
  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k]);
  });

  it("PILOT_STORAGE_KEY başlangıcı dersera: ile başlar", () => {
    expect(PILOT_STORAGE_KEY).toBe("dersera:pilot-info");
  });

  it("boş depoda varsayılan boş değerleri döndürür", () => {
    const info = loadPilotInfo();
    expect(info.schoolName).toBe("");
    expect(info.className).toBe("");
    expect(info.teacherName).toBe("");
    expect(info.pilotDate).toBe("");
  });

  it("kaydedilen bilgileri geri yükler", () => {
    const pilot: PilotInfo = {
      schoolName: "Atatürk Lisesi",
      className: "10-A",
      teacherName: "Ayşe Yılmaz",
      pilotDate: "2026-09-23",
    };
    savePilotInfo(pilot);
    const loaded = loadPilotInfo();
    expect(loaded).toEqual(pilot);
  });

  it("doğru anahtara yazar", () => {
    const pilot: PilotInfo = { schoolName: "Test", className: "9-B", teacherName: "Ali", pilotDate: "2026-10-01" };
    savePilotInfo(pilot);
    expect(store[PILOT_STORAGE_KEY]).toBeDefined();
    expect(JSON.parse(store[PILOT_STORAGE_KEY])).toEqual(pilot);
  });

  it("bozuk JSON'da varsayılan döndürür", () => {
    store[PILOT_STORAGE_KEY] = "!!!invalid json!!!";
    const info = loadPilotInfo();
    expect(info.schoolName).toBe("");
  });
});

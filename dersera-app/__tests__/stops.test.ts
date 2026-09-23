import { stops } from "../data/stops";

describe("stops route keys", () => {
  it("kimya-lab durağı mevcut, fizik-lab yok", () => {
    const ids = stops.map((s) => s.id);
    expect(ids).toContain("kimya-lab");
    expect(ids).not.toContain("fizik-lab");
  });

  it("kimya-lab 3. sırada", () => {
    const kimya = stops.find((s) => s.id === "kimya-lab");
    expect(kimya).toBeDefined();
    expect(kimya!.order).toBe(3);
  });

  it("koridor nextStopId kimya-lab'a işaret ediyor", () => {
    const koridor = stops.find((s) => s.id === "koridor");
    expect(koridor).toBeDefined();
    expect(koridor!.nextStopId).toBe("kimya-lab");
  });

  it("tüm nextStopId referansları çözümlenebilir", () => {
    const ids = new Set(stops.map((s) => s.id));
    stops.forEach((s) => {
      if (s.nextStopId) {
        expect(ids.has(s.nextStopId)).toBe(true);
      }
    });
  });
});

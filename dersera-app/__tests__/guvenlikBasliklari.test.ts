import nextConfig from "../next.config";
import { GORSEL_KOKENI, guvenlikBasliklari, icerikGuvenligi } from "@/lib/guvenlikBasliklari";

const yonerge = (csp: string, ad: string) => csp.split("; ").find((y) => y.startsWith(ad + " "));

describe("güvenlik başlıkları", () => {
  it("canlıda: dış betik ve eval yok, çerçeveye alınamaz, eklenti ve dış form yok, HTTPS zorunlu", () => {
    const csp = icerikGuvenligi(false);
    expect(yonerge(csp, "default-src")).toBe("default-src 'self'");
    expect(yonerge(csp, "script-src")).toBe("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("unsafe-eval");
    expect(yonerge(csp, "connect-src")).toBe("connect-src 'self'");
    expect(yonerge(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(yonerge(csp, "object-src")).toBe("object-src 'none'");
    expect(yonerge(csp, "form-action")).toBe("form-action 'self'");
    expect(yonerge(csp, "base-uri")).toBe("base-uri 'self'");
    expect(csp.split("; ")).toContain("upgrade-insecure-requests");
    const b = Object.fromEntries(guvenlikBasliklari(false).map((h) => [h.key, h.value]));
    expect(b["X-Content-Type-Options"]).toBe("nosniff");
    expect(b["X-Frame-Options"]).toBe("DENY");
    expect(b["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(b["Permissions-Policy"]).toContain("camera=()");
    expect(b["Strict-Transport-Security"]).toMatch(/^max-age=\d{8,}; includeSubDomains$/);
  });

  it("oyun görselleri Vercel Blob'dan yüklenebilir (görsel ucu oraya yönlendirir)", () => {
    expect(yonerge(icerikGuvenligi(false), "img-src")).toContain(GORSEL_KOKENI);
    expect(GORSEL_KOKENI).toBe("https://*.public.blob.vercel-storage.com");
  });

  it("geliştirmede yalnız React hata ayıklamasının istediği eval ve anlık yenileme bağlantısı eklenir; HSTS yok", () => {
    const csp = icerikGuvenligi(true);
    expect(yonerge(csp, "script-src")).toBe("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(yonerge(csp, "connect-src")).toBe("connect-src 'self' ws: wss:");
    expect(csp).not.toContain("upgrade-insecure-requests");
    expect(guvenlikBasliklari(true).some((h) => h.key === "Strict-Transport-Security")).toBe(false);
    expect(yonerge(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
  });

  it("next.config tüm yollara uygular", async () => {
    const kurallar = await nextConfig.headers!();
    expect(kurallar).toHaveLength(1);
    expect(kurallar[0].source).toBe("/:path*");
    expect(kurallar[0].headers.map((h) => h.key)).toEqual(expect.arrayContaining(["Content-Security-Policy", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy", "X-Content-Type-Options"]));
  });
});

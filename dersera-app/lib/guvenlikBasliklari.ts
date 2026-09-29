// Tüm yanıtlara eklenen güvenlik başlıkları (next.config.ts). Uygulama yalnız kendi kökenine istek atar; dış
// kaynak olarak yalnız Vercel Blob'daki oyun görselleri (img) vardır. Yazı tipleri derlemede kendi kökenine alınır.
//
// Betiklerde 'unsafe-inline' Next.js'in sayfaya gömdüğü başlatma betikleri içindir (nonce için her sayfa dinamik
// olmalıydı); dış betik, eval, eklenti, çerçeveye alınma ve başka siteye form gönderimi yine kapalıdır.
// Geliştirmede React hata ayıklaması eval ister: 'unsafe-eval' yalnız orada eklenir.

export const GORSEL_KOKENI = "https://*.public.blob.vercel-storage.com";

export function icerikGuvenligi(gelistirme: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${gelistirme ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${GORSEL_KOKENI}`,
    "font-src 'self' data:",
    `connect-src 'self'${gelistirme ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(gelistirme ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function guvenlikBasliklari(gelistirme: boolean): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: icerikGuvenligi(gelistirme) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    // Oyun kodları adres çubuğunda durabilir: başka siteye yalnız köken gider.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Kamera, mikrofon, konum vb. kullanılmıyor (QR'ı telefonun kendi kamerası okur).
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    ...(gelistirme ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
  ];
}

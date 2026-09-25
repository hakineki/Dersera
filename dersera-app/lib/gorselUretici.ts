// Görsel üretimi: Google Gemini görsel modeli (generateContent REST) → WebP'ye sıkıştırma (sharp) → Vercel Blob.
// Yapay zekâ çağrıları tek servis sınırı arkasındadır; bu dosya görselin tek sağlayıcı noktasıdır.

export type GorselHataNedeni = "yapilandirma" | "guvenlik" | "saglayici" | "zaman";

export class GorselHatasi extends Error {
  constructor(
    readonly neden: GorselHataNedeni,
    message: string
  ) {
    super(message);
  }
}

// En ucuz ve hızlı Nano Banana modeli (1K görsel). GORSEL_MODEL ile değiştirilebilir.
export const VARSAYILAN_GORSEL_MODELI = "gemini-3.1-flash-lite-image";
export const gorselModeli = () => process.env.GORSEL_MODEL?.trim() || VARSAYILAN_GORSEL_MODELI;

// Görsel zenginleştirme yalnız sağlayıcı ve depo anahtarları tanımlıyken sunulur.
export const gorselEtkin = () => !!process.env.GEMINI_API_KEY?.trim() && !!process.env.BLOB_READ_WRITE_TOKEN?.trim();

// Route sınırı 60 sn: sağlayıcı 40 sn, tüm üretim (sıkıştırma ve yükleme dahil) 50 sn içinde biter ya da hata sayılır.
export const GORSEL_TIMEOUT_MS = 40_000;
export const URETIM_SURESI_MS = 50_000;
const GUVENLIK_NEDENLERI = new Set(["SAFETY", "IMAGE_SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"]);

interface GeminiYaniti {
  promptFeedback?: { blockReason?: string };
  candidates?: { finishReason?: string; content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[];
}

export async function geminiGorsel(istem: string, fetchFn: typeof fetch = fetch, timeoutMs = GORSEL_TIMEOUT_MS): Promise<Buffer> {
  const anahtar = process.env.GEMINI_API_KEY?.trim();
  if (!anahtar) throw new GorselHatasi("yapilandirma", "GEMINI_API_KEY tanımlı değil");
  let res: Response;
  try {
    res = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(gorselModeli())}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": anahtar },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: istem }] }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:3" } },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const zaman = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new GorselHatasi(zaman ? "zaman" : "saglayici", err instanceof Error ? err.message : String(err));
  }
  if (!res.ok) throw new GorselHatasi(res.status === 401 || res.status === 403 ? "yapilandirma" : "saglayici", `Gemini ${res.status}`);
  const json = (await res.json().catch(() => ({}))) as GeminiYaniti;
  if (json.promptFeedback?.blockReason) throw new GorselHatasi("guvenlik", `istem engellendi: ${json.promptFeedback.blockReason}`);
  const aday = json.candidates?.[0];
  if (aday?.finishReason && GUVENLIK_NEDENLERI.has(aday.finishReason)) throw new GorselHatasi("guvenlik", `görsel engellendi: ${aday.finishReason}`);
  const veri = aday?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
  if (!veri) throw new GorselHatasi("saglayici", `görsel dönmedi (${aday?.finishReason ?? "aday yok"})`);
  return Buffer.from(veri, "base64");
}

// 1024 piksele sığdırılmış WebP: öğrenci cihazına ~100 KB (PNG'nin onda biri), Blob kotası da buna göre dayanır.
export async function webpYap(veri: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(veri).resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
}

// Adres tahmin edilemesin diye rastgele son ek; görseller değişmez, bir yıl önbelleklenir.
export async function blobaYaz(yol: string, veri: Buffer): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) throw new GorselHatasi("yapilandirma", "BLOB_READ_WRITE_TOKEN tanımlı değil");
  const { put } = await import("@vercel/blob");
  const r = await put(yol, veri, {
    access: "public",
    addRandomSuffix: true,
    contentType: "image/webp",
    cacheControlMaxAge: 365 * 24 * 60 * 60,
    abortSignal: AbortSignal.timeout(15_000),
  });
  if (!/^https:\/\//.test(r.url)) throw new GorselHatasi("saglayici", "Blob adresi beklenmedik");
  return r.url;
}

// Tek görselin tüm yolu: üret → sıkıştır → depola; depodaki adresi döner.
export async function gorselUretVeYaz(isId: string, hedef: string, istem: string): Promise<string> {
  const ham = await geminiGorsel(istem);
  return blobaYaz(`gorsel/${isId}/${hedef}.webp`, await webpYap(ham));
}

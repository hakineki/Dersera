import OpenAI from "openai";
import type { ImageGenerateParamsNonStreaming } from "openai/resources/images";

// Görsel üretimi: OpenAI GPT Image (oyun üretimiyle aynı OpenAI hesabı) → WebP'ye sıkıştırma (sharp) → Vercel Blob.
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

// Düşük kalite çocuk kitabı çizimi için yeterli ve en ucuzudur. GORSEL_MODEL / GORSEL_KALITE ile değiştirilebilir.
export const VARSAYILAN_GORSEL_MODELI = "gpt-image-2";
export const gorselModeli = () => process.env.GORSEL_MODEL?.trim() || VARSAYILAN_GORSEL_MODELI;
const KALITELER = ["low", "medium", "high"] as const;
type Kalite = (typeof KALITELER)[number];
export const gorselKalitesi = (): Kalite => {
  const k = process.env.GORSEL_KALITE?.trim();
  return (KALITELER as readonly string[]).includes(k ?? "") ? (k as Kalite) : "low";
};

// Görsel zenginleştirme yalnız sağlayıcı ve depo anahtarları tanımlıyken sunulur.
export const gorselEtkin = () => !!process.env.OPENAI_API_KEY?.trim() && !!process.env.BLOB_READ_WRITE_TOKEN?.trim();

// Route sınırı 60 sn: sağlayıcı 40 sn, tüm üretim (sıkıştırma ve yükleme dahil) 50 sn içinde biter ya da hata sayılır.
export const GORSEL_TIMEOUT_MS = 40_000;
export const URETIM_SURESI_MS = 50_000;

// Yalnız test için enjekte edilebilir; üretimde env'den kurulur.
export interface GorselIstemcisi {
  images: { generate: (body: ImageGenerateParamsNonStreaming, opts?: { timeout?: number }) => Promise<{ data?: { b64_json?: string }[] }> };
}

// İçerik politikası reddi (istem ya da görsel sağlayıcının güvenlik süzgecine takıldı).
const guvenlikReddi = (err: InstanceType<typeof OpenAI.APIError>) =>
  err.status === 400 && /moderation|content_policy|safety/i.test(`${err.code ?? ""} ${err.message}`);

export async function openaiGorsel(istem: string, istemci?: GorselIstemcisi, timeoutMs = GORSEL_TIMEOUT_MS): Promise<Buffer> {
  if (!istemci && !process.env.OPENAI_API_KEY?.trim()) throw new GorselHatasi("yapilandirma", "OPENAI_API_KEY tanımlı değil");
  const c: GorselIstemcisi = istemci ?? new OpenAI({ maxRetries: 0 });
  let r: { data?: { b64_json?: string }[] };
  try {
    // Yatay kadraj; sağlayıcının varsayılan (sıkı) içerik süzgeci açık kalır.
    r = await c.images.generate({ model: gorselModeli(), prompt: istem, n: 1, size: "1536x1024", quality: gorselKalitesi(), output_format: "webp", moderation: "auto" }, { timeout: timeoutMs });
  } catch (err) {
    if (err instanceof OpenAI.APIConnectionTimeoutError) throw new GorselHatasi("zaman", err.message);
    if (err instanceof OpenAI.APIError) {
      if (guvenlikReddi(err)) throw new GorselHatasi("guvenlik", `görsel engellendi: ${err.code ?? err.status}`);
      throw new GorselHatasi(err.status === 401 || err.status === 403 ? "yapilandirma" : "saglayici", `OpenAI ${err.status ?? ""}`);
    }
    throw new GorselHatasi("saglayici", err instanceof Error ? err.message : String(err));
  }
  const veri = r.data?.[0]?.b64_json;
  if (!veri) throw new GorselHatasi("saglayici", "görsel dönmedi");
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
  const ham = await openaiGorsel(istem);
  return blobaYaz(`gorsel/${isId}/${hedef}.webp`, await webpYap(ham));
}

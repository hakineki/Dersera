// E-posta gönderimi (Resend REST API) ve bağlantılarda kullanılan site adresi. Yapılandırma:
//   RESEND_API_KEY, EPOSTA_GONDEREN ("Dersera <bildirim@alanadi>"), DERSERA_SITE_ADRESI ("https://…").
// Canlıda biri eksikse gönderim yapılmaz (EpostaYapilandirilmadiError). Geliştirmede anahtar yoksa e-posta konsola
// yazılır (bağlantı yerelde denenebilsin).

export class EpostaYapilandirilmadiError extends Error {}

export interface Eposta {
  kime: string;
  konu: string;
  metin: string;
}

const RESEND = "https://api.resend.com/emails";
const ZAMAN_ASIMI_MS = 10_000;

export async function epostaGonder(e: Eposta, env: Record<string, string | undefined> = process.env, fetchFn: typeof fetch = fetch): Promise<void> {
  const anahtar = env.RESEND_API_KEY?.trim();
  const gonderen = env.EPOSTA_GONDEREN?.trim();
  if (!anahtar || !gonderen) {
    if (env.NODE_ENV === "production") throw new EpostaYapilandirilmadiError("E-posta gönderimi yapılandırılmadı");
    console.info(`[eposta] (geliştirme, gönderilmedi) kime=${e.kime} konu=${e.konu}\n${e.metin}`);
    return;
  }
  const res = await fetchFn(RESEND, {
    method: "POST",
    headers: { Authorization: `Bearer ${anahtar}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: gonderen, to: [e.kime], subject: e.konu, text: e.metin }),
    signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
  });
  if (!res.ok) throw new Error(`E-posta gönderilemedi (${res.status})`);
}

// Bağlantılar yalnız yapılandırılmış adresle kurulur (istekteki Host başlığına güvenilmez). Geliştirmede istek kökeni.
export function siteAdresi(req: Request, env: Record<string, string | undefined> = process.env): string {
  const tanimli = env.DERSERA_SITE_ADRESI?.trim().replace(/\/+$/, "");
  if (tanimli) return tanimli;
  if (env.NODE_ENV === "production") throw new EpostaYapilandirilmadiError("DERSERA_SITE_ADRESI tanımlı değil");
  return new URL(req.url).origin;
}

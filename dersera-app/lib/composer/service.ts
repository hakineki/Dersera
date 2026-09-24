import { ComposeError, composeGame, yapilandirilmisIstek, type ComposeClient } from "@/lib/composer/anthropic";
import { DuzeltmeSchema, toDefinition, type Duzeltme, type ModelOutput } from "@/lib/composer/modelOutput";
import { buildDuzeltmePrompt, buildUserPrompt } from "@/lib/composer/prompt";
import { composeGameOpenAI, yapilandirilmisIstekOpenAI } from "@/lib/composer/openai";
import type { Recipe } from "@/lib/composer/recipe";
import { onar } from "@/lib/composer/repair";
import type { GameDefinition } from "@/lib/composer/definition";
import { describeKonular, resolveKonular, type DersKonu, type ResolvedInput } from "@/lib/composer/input";
import { IZINLI_QR_IDLERI, validationContext } from "@/lib/composer/context";
import { buildRecipe } from "@/lib/composer/recipe";
import { validateGame, type ValidationResult } from "@/lib/composer/validator";

export { IZINLI_QR_IDLERI, validationContext };

export interface ComposeResult {
  definition: GameDefinition;
  validation: ValidationResult;
}

export type Saglayici = "openai" | "anthropic";

// OPENAI_API_KEY tanımlıysa OpenAI, değilse Anthropic kullanılır (Anthropic yedek sağlayıcıdır).
export function saglayiciFromEnv(): Saglayici {
  return process.env.OPENAI_API_KEY?.trim() ? "openai" : "anthropic";
}

interface Uretici {
  oyun(input: ResolvedInput, recipe: Recipe): Promise<ModelOutput>;
  duzelt(prompt: string, timeoutMs: number): Promise<Duzeltme>;
}

function ureticiSec(client?: ComposeClient): Uretici {
  if (client || saglayiciFromEnv() === "anthropic") {
    return {
      oyun: (input, recipe) => composeGame(input, recipe, IZINLI_QR_IDLERI, client),
      duzelt: (prompt, timeoutMs) => yapilandirilmisIstek(DuzeltmeSchema, prompt, DUZELTME_TOKEN, client, timeoutMs),
    };
  }
  return {
    oyun: (input, recipe) => composeGameOpenAI(input, recipe, IZINLI_QR_IDLERI),
    duzelt: (prompt, timeoutMs) => yapilandirilmisIstekOpenAI(DuzeltmeSchema, "dersera_duzeltme", prompt, DUZELTME_TOKEN, undefined, timeoutMs),
  };
}

// Model çıktısı → onarım → doğrulama.
function degerlendir(raw: ModelOutput, input: ResolvedInput): ComposeResult {
  const converted = toDefinition(raw, input);
  if (!converted.ok) throw new ComposeError("invalid-output", `Çıktı oyun şemasına uymadı: ${converted.error}`);
  const { definition, notlar } = onar(converted.definition);
  const validation = validateGame(definition, validationContext(input));
  validation.uyarilar.unshift(...notlar.map((mesaj) => ({ kod: "otomatik-duzeltme", mesaj })));
  return { definition, validation };
}

// Modelin tek bir durağın içeriğinde yaptığı hatalar (sayı/biçim, eksik ipucu ya da destek) ikinci çağrıyla düzeltilebilir.
const DUZELTILEBILIR = new Set(["soru-bos", "cevap-bicimi", "ipucu-eksik", "ipucu-ayni", "destek-eksik", "destek-aciklama", "hedef-disi"]);
// Route sınırı 280 sn; düzeltme ancak ilk üretimden sonra yeterli süre kaldıysa yapılır.
const TOPLAM_BUTCE_MS = 265_000;
const DUZELTME_MIN_MS = 30_000;
const DUZELTME_MAX_MS = 90_000;
const DUZELTME_TOKEN = 8_000;

// Düzeltilen durağın yalnız içerik alanları alınır; rota ve ödül yapısı ilk çıktıdaki gibi kalır.
const ICERIK_ALANLARI = [
  "hikaye_metni", "gorev_turu", "ogrenme_hedefi", "soru", "secenekler", "dogru_cevap", "ipucu_1", "ipucu_2",
  "destek_soru", "destek_secenekler", "destek_dogru_cevap", "destek_aciklama",
] as const;

function yamala(raw: ModelOutput, duzeltme: Duzeltme, hedef: Set<string>): { raw: ModelOutput; yazilan: string[] } {
  const yeni = new Map(duzeltme.duraklar.filter((d) => hedef.has(d.id)).map((d) => [d.id, d]));
  const yazilan: string[] = [];
  const duraklar = raw.duraklar.map((d) => {
    const y = yeni.get(d.id);
    if (!y) return d;
    yazilan.push(d.isim);
    const kopya = { ...d };
    for (const alan of ICERIK_ALANLARI) (kopya as Record<string, unknown>)[alan] = y[alan];
    return kopya;
  });
  return { raw: { ...raw, duraklar }, yazilan };
}

export async function composeAndValidate(input: ResolvedInput, client?: ComposeClient, now: () => number = Date.now): Promise<ComposeResult> {
  const basla = now();
  const recipe = buildRecipe(input.sure, input.deneyim, input.alan);
  const uretici = ureticiSec(client);
  const raw = await uretici.oyun(input, recipe);
  const sonuc = degerlendir(raw, input);

  const hatalar = sonuc.validation.hatalar.filter((h) => h.durakId && DUZELTILEBILIR.has(h.kod));
  const hedef = new Set(hatalar.map((h) => h.durakId!));
  const kalan = TOPLAM_BUTCE_MS - (now() - basla);
  if (hedef.size === 0 || kalan < DUZELTME_MIN_MS) return sonuc;

  try {
    const prompt = buildDuzeltmePrompt(buildUserPrompt(input, recipe, IZINLI_QR_IDLERI), raw.duraklar.filter((d) => hedef.has(d.id)), hatalar.map((h) => h.mesaj));
    const duzeltme = await uretici.duzelt(prompt, Math.min(kalan - 5_000, DUZELTME_MAX_MS));
    const { raw: yamali, yazilan } = yamala(raw, duzeltme, hedef);
    const yeni = degerlendir(yamali, input);
    // Yalnız hata azaldıysa kabul edilir; aksi hâlde ilk sonuç döner.
    if (yazilan.length === 0 || yeni.validation.hatalar.length >= sonuc.validation.hatalar.length) return sonuc;
    yeni.validation.uyarilar.unshift({ kod: "otomatik-duzeltme", mesaj: `Hatalı bulunan ${yazilan.map((a) => `"${a}"`).join(", ")} görevi yapay zekâya yeniden yazdırıldı; gözden geçirin.` });
    return yeni;
  } catch (err) {
    console.warn("[compose] durak düzeltmesi yapılamadı", err instanceof Error ? err.message : err);
    return sonuc;
  }
}

// Yayın ve düzenleme sonrası: tanımı müfredata göre yeniden doğrular (istemciye güvenmez).
export function revalidate(def: GameDefinition, dersler: DersKonu[]): ValidationResult | null {
  const r = resolveKonular(def.meta.sinif, dersler);
  if (!r.ok) return null;
  const d = describeKonular(r.konular);
  if (d.dersAdi !== def.meta.ders || d.konuAdi !== def.meta.konu) return null;
  return validateGame(
    def,
    validationContext({ alan: def.meta.alan, deneyim: def.meta.deneyim, sure: def.meta.sure_dk, ogrenmeCiktilari: d.ogrenmeCiktilari, hedefDersleri: d.hedefDersleri })
  );
}

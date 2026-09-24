import { composeGame, yapilandirilmisIstek, type ComposeClient } from "@/lib/composer/anthropic";
import { ComposeError } from "@/lib/composer/errors";
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
  duzelt(prompt: string, maxTokens: number, timeoutMs: number): Promise<Duzeltme>;
}

function ureticiSec(client?: ComposeClient): Uretici {
  if (client || saglayiciFromEnv() === "anthropic") {
    return {
      oyun: (input, recipe) => composeGame(input, recipe, IZINLI_QR_IDLERI, client),
      duzelt: (prompt, maxTokens, timeoutMs) => yapilandirilmisIstek(DuzeltmeSchema, prompt, maxTokens, client, timeoutMs),
    };
  }
  return {
    oyun: (input, recipe) => composeGameOpenAI(input, recipe, IZINLI_QR_IDLERI),
    duzelt: (prompt, maxTokens, timeoutMs) => yapilandirilmisIstekOpenAI(DuzeltmeSchema, "dersera_duzeltme", prompt, maxTokens, undefined, timeoutMs),
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
// Route sınırı 280 sn; oturum, oran sınırı ve ağ için pay bırakılır. Düzeltme ancak yeterli süre kaldıysa yapılır.
const TOPLAM_BUTCE_MS = 245_000;
const DUZELTME_MIN_MS = 45_000;
const DUZELTME_MAX_MS = 90_000;
// Tek çağrıda en çok 3 durak yeniden yazılır; token sınırı hedef sayısıyla büyür.
const DUZELTME_EN_COK = 3;
const duzeltmeToken = (n: number) => 1_500 + n * 3_500;

// Düzeltilen durağın yalnız görev içeriği alınır; rota, ödül ve QR ilk çıktıdaki gibi kalır.
// Öğrenme hedefi yalnız o durakta hedef-disi hatası varsa değişebilir (aksi hâlde ders kapsamı bozulabilir).
const ICERIK_ALANLARI = [
  "gorev_turu", "soru", "secenekler", "dogru_cevap", "ipucu_1", "ipucu_2",
  "destek_soru", "destek_secenekler", "destek_dogru_cevap", "destek_aciklama",
] as const;

function yamala(raw: ModelOutput, duzeltme: Duzeltme, hedef: Set<string>, hedefDisi: Set<string>): ModelOutput {
  const yeni = new Map(duzeltme.duraklar.filter((d) => hedef.has(d.id)).map((d) => [d.id, d]));
  const duraklar = raw.duraklar.map((d) => {
    const y = yeni.get(d.id);
    if (!y) return d;
    const kopya = { ...d };
    for (const alan of ICERIK_ALANLARI) (kopya as Record<string, unknown>)[alan] = y[alan];
    if (y.hikaye_metni.trim()) kopya.hikaye_metni = y.hikaye_metni;
    if (hedefDisi.has(d.id)) kopya.ogrenme_hedefi = y.ogrenme_hedefi;
    return kopya;
  });
  return { ...raw, duraklar };
}

const hataAnahtari = (h: { kod: string; durakId?: string }) => `${h.kod}|${h.durakId ?? ""}`;

// Yeni sonuç kabul edilirse: hatalar eski hataların alt kümesi ve daha az olmalı (yeni tür hata doğmamalı).
function dahaIyi(eski: ComposeResult, yeni: ComposeResult): boolean {
  const eskiler = new Set(eski.validation.hatalar.map(hataAnahtari));
  const yeniler = yeni.validation.hatalar.map(hataAnahtari);
  return yeniler.length < eski.validation.hatalar.length && yeniler.every((k) => eskiler.has(k));
}

export async function composeAndValidate(input: ResolvedInput, client?: ComposeClient, now: () => number = Date.now): Promise<ComposeResult> {
  const basla = now();
  const recipe = buildRecipe(input.sure, input.deneyim, input.alan);
  const uretici = ureticiSec(client);
  const raw = await uretici.oyun(input, recipe);
  const sonuc = degerlendir(raw, input);

  const duzeltilebilir = sonuc.validation.hatalar.filter((h) => h.durakId && DUZELTILEBILIR.has(h.kod));
  const hedef = new Set([...new Set(duzeltilebilir.map((h) => h.durakId!))].slice(0, DUZELTME_EN_COK));
  const hatalar = duzeltilebilir.filter((h) => hedef.has(h.durakId!));
  const hedefDisi = new Set(hatalar.filter((h) => h.kod === "hedef-disi").map((h) => h.durakId!));
  const kalan = TOPLAM_BUTCE_MS - (now() - basla);
  if (hedef.size === 0 || kalan < DUZELTME_MIN_MS) return sonuc;

  try {
    const prompt = buildDuzeltmePrompt(buildUserPrompt(input, recipe, IZINLI_QR_IDLERI), raw.duraklar.filter((d) => hedef.has(d.id)), hatalar.map((h) => h.mesaj));
    const duzeltme = await uretici.duzelt(prompt, duzeltmeToken(hedef.size), Math.min(kalan - 5_000, DUZELTME_MAX_MS));
    // Önce tüm yamalar birlikte; olmazsa yalnız kendi hatası tamamen giden duraklar.
    const hepsi = degerlendir(yamala(raw, duzeltme, hedef, hedefDisi), input);
    let secilen: ComposeResult | null = dahaIyi(sonuc, hepsi) ? hepsi : null;
    let yazilanIdler = [...hedef];
    if (!secilen) {
      const temiz = new Set([...hedef].filter((id) => !hepsi.validation.hatalar.some((h) => h.durakId === id)));
      const kismi = temiz.size ? degerlendir(yamala(raw, duzeltme, temiz, hedefDisi), input) : null;
      if (kismi && dahaIyi(sonuc, kismi)) {
        secilen = kismi;
        yazilanIdler = [...temiz];
      }
    }
    if (!secilen) return sonuc;
    const adlar = raw.duraklar.filter((d) => yazilanIdler.includes(d.id)).map((d) => `"${d.isim}"`);
    secilen.validation.uyarilar.unshift({ kod: "otomatik-duzeltme", mesaj: `Hatalı bulunan ${adlar.join(", ")} görevi yapay zekâya yeniden yazdırıldı; gözden geçirin.` });
    return secilen;
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

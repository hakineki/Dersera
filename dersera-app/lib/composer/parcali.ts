import type { z } from "zod";
import { ComposeError } from "@/lib/composer/errors";
import type { ResolvedInput } from "@/lib/composer/input";
import {
  GorevDoldurmaSchema,
  IskeletSchema,
  type GorevIcerigi,
  type Iskelet,
  type ModelOutput,
} from "@/lib/composer/modelOutput";
import { buildGorevPrompt, buildIskeletPrompt, buildUserPrompt, type PromptParcalari } from "@/lib/composer/prompt";
import type { Recipe } from "@/lib/composer/recipe";

// Parçalı üretim: tek büyük çağrı 12 duraklı oyunu süre sınırına sığdıramıyordu (Claude'da durak başına ~3,2k token).
// 1) İskelet: hikâye, final, envanter ve her durağın rotası, görev türü, öğrenme hedefi ve tek cümlelik görev özeti.
// 2) Görevler: durakların soru/cevap/ipucu/destek içeriği PARCA'lık gruplar hâlinde PARALEL doldurulur.
// Sonuç tek çağrıyla üretilmiş gibi ModelOutput'a birleştirilir; doğrulama, onarım ve düzeltme aynen çalışır.

export type Istek = <S extends z.ZodObject<z.ZodRawShape>>(
  schema: S,
  semaAdi: string,
  prompt: PromptParcalari,
  maxTokens: number,
  timeoutMs: number
) => Promise<z.infer<S>>;

export const PARCA = 3;
const ISKELET_MAX_MS = 100_000;
const GOREV_MIN_MS = 20_000;
// Hızlı hatayla (429, 5xx, kesilme) düşen grup, en az bu kadar süre kaldıysa bir kez yeniden denenir.
const YENIDEN_DENEME_MIN_MS = 30_000;
// Görev türü yalnız sayıya duyarlı türlerden değişebilir (ör. 3 çift çıkmayan eşleştirme → çoktan seçmeli).
const DEGISEBILIR_TUR = new Set(["eslestirme", "siralama", "surukle_birak"]);

export const iskeletTokenSiniri = (recipe: Recipe) => 3_000 + recipe.anaGorev.max * 900;
export const gorevTokenSiniri = (durakSayisi: number) => 1_000 + durakSayisi * 2_500;

export function parcalara<T>(liste: T[], boyut = PARCA): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < liste.length; i += boyut) out.push(liste.slice(i, i + boyut));
  return out;
}

const BOS_GOREV = {
  soru: "",
  secenekler: [] as string[],
  dogru_cevap: "",
  ipucu_1: "",
  ipucu_2: "",
  destek_soru: "",
  destek_secenekler: [] as string[],
  destek_dogru_cevap: "",
  destek_aciklama: "",
};

// Doldurulamayan durağın görevi boş kalır; doğrulayıcı bunu "soru-bos" olarak bildirir ve düzeltme adımı yeniden yazdırır.
export function birlestir(iskelet: Iskelet, gorevler: GorevIcerigi[]): ModelOutput {
  const byId = new Map(gorevler.map((g) => [g.id, g]));
  return {
    baslik: iskelet.baslik,
    hikaye_giris: iskelet.hikaye_giris,
    oyun_amaci: iskelet.oyun_amaci,
    ogrenme_hedefleri: iskelet.ogrenme_hedefleri,
    envanter: iskelet.envanter,
    final: iskelet.final,
    duraklar: iskelet.duraklar.map((d) => {
      const g = byId.get(d.id);
      return {
        id: d.id,
        isim: d.isim,
        sahne_turu: d.sahne_turu,
        hikaye_metni: d.hikaye_metni,
        qr_durak_id: d.qr_durak_id,
        sonraki_durak_tarifi: d.sonraki_durak_tarifi,
        gorev_turu: g?.gorev_turu && DEGISEBILIR_TUR.has(d.gorev_turu) ? g.gorev_turu : d.gorev_turu,
        ogrenme_hedefi: d.ogrenme_hedefi,
        ...(g
          ? {
              soru: g.soru,
              secenekler: g.secenekler,
              dogru_cevap: g.dogru_cevap,
              ipucu_1: g.ipucu_1,
              ipucu_2: g.ipucu_2,
              destek_soru: g.destek_soru,
              destek_secenekler: g.destek_secenekler,
              destek_dogru_cevap: g.destek_dogru_cevap,
              destek_aciklama: g.destek_aciklama,
            }
          : BOS_GOREV),
        odul_id: d.odul_id,
        secimler: d.secimler,
        varsayilan_sonraki_durak_id: d.varsayilan_sonraki_durak_id,
      };
    }),
  };
}

export async function parcaliUret(
  input: ResolvedInput,
  recipe: Recipe,
  izinliQrIdleri: string[],
  istek: Istek,
  butceMs: number,
  now: () => number = Date.now
): Promise<ModelOutput> {
  const basla = now();
  const ortak = buildUserPrompt(input, recipe, izinliQrIdleri);
  const iskelet = await istek(IskeletSchema, "dersera_iskelet", { ortak, asama: buildIskeletPrompt() }, iskeletTokenSiniri(recipe), Math.min(ISKELET_MAX_MS, butceMs));
  const iskeletMs = now() - basla;

  const kalan = butceMs - iskeletMs;
  if (kalan < GOREV_MIN_MS) throw new ComposeError("timeout", `İskelet ${Math.round(iskeletMs / 1000)} saniye sürdü; görevler için süre kalmadı`);

  const gruplar = parcalara(iskelet.duraklar.map((d) => d.id));
  const doldur = (ids: string[], maxTokens: number, timeoutMs: number) =>
    istek(GorevDoldurmaSchema, "dersera_gorevler", { ortak, asama: buildGorevPrompt(iskelet, ids) }, maxTokens, timeoutMs);
  // Düşen grup hemen ve kendi başına bir kez yeniden denenir (diğer grupları beklemez); düzeltme adımının üç yeri
  // boş duraklara harcanmasın. Yapılandırma hatası denenmez; token sınırında kesilen çıktı daha yüksek sınırla denenir.
  const nedenler: string[] = [];
  const grupDoldur = async (ids: string[]) => {
    const sinir = gorevTokenSiniri(ids.length);
    try {
      return await doldur(ids, sinir, kalan);
    } catch (err) {
      nedenler.push(hataOzeti(err));
      const yeniKalan = butceMs - (now() - basla);
      if ((err instanceof ComposeError && err.reason === "config") || yeniKalan < YENIDEN_DENEME_MIN_MS) throw err;
      const kesildi = err instanceof ComposeError && err.message.includes("max_tokens");
      return doldur(ids, kesildi ? Math.round(sinir * 1.5) : sinir, yeniKalan);
    }
  };
  const sonuclar = await Promise.allSettled(gruplar.map(grupDoldur));

  const gorevler = sonuclar.flatMap((s, i) => (s.status === "fulfilled" ? s.value.duraklar.filter((g) => gruplar[i].includes(g.id)) : []));
  const yazilan = new Set(gorevler.map((g) => g.id));
  const eksik = iskelet.duraklar.map((d) => d.id).filter((id) => !yazilan.has(id));
  const hala = sonuclar.filter((s): s is PromiseRejectedResult => s.status === "rejected");
  console.info(
    `[compose] parçalı: ${iskelet.duraklar.length} durak, iskelet ${Math.round(iskeletMs / 1000)} sn, toplam ${Math.round((now() - basla) / 1000)} sn, ${gruplar.length} grup` +
      (nedenler.length ? `, düşen: ${nedenler.join("; ")}` : "") +
      (hala.length ? `, yeniden denemeden sonra ${hala.length} grup başarısız` : "") +
      (eksik.length ? `, görevi yazılamayan: ${eksik.join(", ")}` : "")
  );
  // Hiçbir grup doldurulamadıysa oyun kullanılamaz. Zaman aşımı varsa o iletilir (öğretmen tekrar deneyebilir).
  if (hala.length === gruplar.length && gruplar.length > 0) {
    const zamanAsimi = hala.find((s) => s.reason instanceof ComposeError && s.reason.reason === "timeout");
    throw (zamanAsimi ?? hala[0]).reason;
  }
  return birlestir(iskelet, gorevler);
}

function hataOzeti(err: unknown): string {
  if (err instanceof ComposeError) return `${err.reason}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

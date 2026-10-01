import type { Alan, Deneyim } from "@/lib/composer/input";
import { kanitSayisi } from "@/lib/composer/mekanRotasi";

export interface Aralik {
  min: number;
  max: number;
}

// Composer'ın oyun yapısı hedefleri. Model bu sınırlara uyar; doğrulayıcı sert sınırları denetler.
export interface Recipe {
  anaGorev: Aralik;
  secim: Aralik;
  nesne: Aralik;
  dramaturji: string;
  final: string;
  alan: string;
  // Mekân rotası (yeni okul macerası): seçim yok, kanıt sayısı durak sayısından, mekân listesi ve konum bilmecesi.
  rota: boolean;
}

const GOREV_ARALIGI: Record<number, Aralik> = {
  20: { min: 5, max: 5 },
  40: { min: 8, max: 8 },
  60: { min: 12, max: 12 },
};

const DENEYIM: Record<Deneyim, Omit<Recipe, "anaGorev" | "alan" | "rota">> = {
  macera: {
    secim: { min: 2, max: 3 },
    nesne: { min: 3, max: 5 },
    dramaturji:
      "Macera ağırlıklı: güçlü, sürükleyici bir hikâye; daha fazla keşif; kanıt/nesne toplama belirgin; akademik görevler kısa ve hikâyeye gömülü.",
    final: "Final güçlü bir hikâye çözümüdür; öğrenci topladığı kanıtları birleştirerek gizemi çözer.",
  },
  dengeli: {
    secim: { min: 1, max: 2 },
    nesne: { min: 2, max: 4 },
    dramaturji:
      "Dengeli: hikâye ve ders yaklaşık eşit; her öğrenme görevi hikâyenin ilerlemesini sağlar.",
    final: "Final, toplanan nesneleri ve öğrenilen bilgiyi birlikte kullanan bir problemdir.",
  },
  ders: {
    secim: { min: 1, max: 1 },
    nesne: { min: 0, max: 2 },
    dramaturji:
      "Ders ağırlıklı: akademik görev yoğunluğu yüksek, hikâye hafif bir çerçeve; yine de art arda soru soran bir quiz değildir, her görev bir amaca hizmet eder.",
    final: "Final, öğrencinin oyun boyunca öğrendiklerini birleştirmesini gerektiren bir sentez görevidir.",
  },
};

const ALAN_ROTA =
  "Okul macerası (mekân rotası): her durak aşağıdaki okul mekânları listesinden FARKLI bir mekânda geçer; durağın mekan_id alanına o mekânın kimliğini birebir yaz. Durağın hikâyesi o mekânda geçer ve mekânı adıyla anabilir. Öğrenciyi bir sonraki mekâna oyun motoru bir konum bilmecesiyle yönlendirir: sonraki_durak_tarifi ve qr_durak_id alanlarını boş bırak.";

// Eski okul oyunları (mekân rotasından önce) ve boş şablon: numaralı QR durakları.
const ALAN: Record<Alan, string> = {
  sinif:
    "Tek sınıf: öğrenci sınıftan çıkmaz; duraklar sanal sahnelerdir (mekan.tur = \"sanal\", qr_durak_id = null). QR kullanma.",
  okul:
    "Okul macerası: her durak verilen QR listesinden farklı bir QR'a bağlanır (mekan.tur = \"qr\"). Fiziksel mekân adı uydurma; tarifte yalnızca QR numarasını kullan.",
};

// Her seçilen dersin en az bir görevi olacağından ders sayısı, sürenin en fazla durak sayısını aşamaz.
export function maxDersSayisi(sure: number): number {
  return GOREV_ARALIGI[sure]?.max ?? 0;
}

// Mekân rotasında seçim sahnesi yoktur (takımlar farklı duraklardan başlar, rota döngüseldir); kanıt sayısı durak
// sayısından gelir (8 durakta 3) ve final bu kanıtları birleştirir. Yeni okul oyunları mekân rotasıdır; eski okul oyunları
// (güncelleme, yeniden doğrulama) ve boş şablon rota: false ile eski tarifi kullanır.
export function buildRecipe(sure: number, deneyim: Deneyim, alan: Alan, rota = alan === "okul"): Recipe {
  const anaGorev = GOREV_ARALIGI[sure];
  const mekanRotasi = rota && alan === "okul";
  const temel = { anaGorev, ...DENEYIM[deneyim], alan: mekanRotasi ? ALAN_ROTA : ALAN[alan], rota: mekanRotasi };
  if (!mekanRotasi || !anaGorev) return temel;
  const kanit = kanitSayisi(anaGorev.max);
  return {
    ...temel,
    secim: { min: 0, max: 0 },
    nesne: { min: kanit, max: kanit },
    final: `${temel.final} Final, oyun boyunca toplanan ${kanit} kanıtın hepsini birleştirir.`,
  };
}

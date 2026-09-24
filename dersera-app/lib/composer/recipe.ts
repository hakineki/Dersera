import type { Alan, Deneyim } from "@/lib/composer/input";

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
}

const GOREV_ARALIGI: Record<number, Aralik> = {
  20: { min: 5, max: 5 },
  40: { min: 8, max: 8 },
  60: { min: 12, max: 12 },
};

const DENEYIM: Record<Deneyim, Omit<Recipe, "anaGorev" | "alan">> = {
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

// Çıktı uzunluğu durak sayısıyla büyür (ölçüm: 4 duraklı oyun 7,7–15 bin token). Üst sınır süre sınırını korur.
export function oyunTokenSiniri(recipe: Recipe): number {
  return Math.min(32_000, 6_000 + recipe.anaGorev.max * 2_500);
}

export function buildRecipe(sure: number, deneyim: Deneyim, alan: Alan): Recipe {
  return { anaGorev: GOREV_ARALIGI[sure], ...DENEYIM[deneyim], alan: ALAN[alan] };
}

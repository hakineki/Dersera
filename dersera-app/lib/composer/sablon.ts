import { IZINLI_QR_IDLERI } from "@/lib/composer/context";
import type { Durak, GameDefinition } from "@/lib/composer/definition";
import type { ResolvedInput } from "@/lib/composer/input";
import { buildRecipe } from "@/lib/composer/recipe";

// Boş şablon: öğretmenin seçimlerine uygun, oyun kurallarını sağlayan iskelet. Rota (bir seçim sahnesi, iki yol ve
// birleşme), öğrenme hedefleri, final için kanıtlar ve okul macerasında QR'lar hazırdır; öğrencinin göreceği soru,
// seçenek, cevap, ipucu, destek görevi, seçim ve final metinleri boştur ve öğretmen yazar. Boş alanlar doğrulamada hata
// olarak görünür; tamamlanmadan yayınlanamaz (yayın kapıları diğer oyunlarla aynıdır). Yapay zekâ ve kredi kullanılmaz.

// Seçim bloğu: seçim sahnesi, iki alternatif durak ve birleşme; blok 4 durak kaplar. İkinci blok (macera tarzı) ancak
// uzun oyunlarda sığar; sığmazsa doğrulayıcı "seçim sayısı" uyarısı verir (engel değildir).
const BLOK = 4;
const ILK_BLOK = 2;
const VARSAYILAN_AMAC = "Duraklardaki görevleri çöz, finale ulaş.";

// Her dersin öğrenme çıktıları sırayla harmanlanır: disiplinler arası oyunda her ders erken duraklarda çalışılır.
function hedefSirasi(input: ResolvedInput): string[] {
  const listeler = input.dersler.map((k) => k.unite.ogrenmeCiktilari.map((o) => o.kod));
  const enUzun = Math.max(...listeler.map((l) => l.length));
  return Array.from({ length: enUzun }, (_, i) => listeler.flatMap((l) => (i < l.length ? [l[i]] : []))).flat();
}

export function bosSablon(input: ResolvedInput): GameDefinition {
  const recipe = buildRecipe(input.sure, input.deneyim, input.alan);
  const n = recipe.anaGorev.max;
  const blokSayisi = Math.max(1, Math.min(recipe.secim.min, Math.floor((n - ILK_BLOK + 1) / BLOK)));
  const secimler = Array.from({ length: blokSayisi }, (_, b) => ILK_BLOK + b * BLOK);
  const blokOf = (k: number) => secimler.find((s) => k >= s && k < s + BLOK);
  // Alternatif duraklar yalnız bir rotada kalır; final için gereken kanıtlar herkesin geçtiği duraklarda kazanılır.
  const alternatif = (k: number) => {
    const s = blokOf(k);
    return s !== undefined && (k === s + 1 || k === s + 2);
  };

  const ortak = Array.from({ length: n }, (_, i) => i + 1).filter((k) => !alternatif(k));
  const nesneSayisi = Math.min(Math.max(recipe.nesne.min, 2), ortak.length);
  // Kanıtlar ortak duraklara yayılır (baştan, ortadan, sondan).
  const odulDuraklari = new Map(
    Array.from({ length: nesneSayisi }, (_, i) => [ortak[Math.round((i * (ortak.length - 1)) / Math.max(1, nesneSayisi - 1))], `n${i + 1}`])
  );

  const hedefler = hedefSirasi(input);
  const id = (k: number) => `d${k}`;
  const duraklar: Durak[] = Array.from({ length: n }, (_, i) => {
    const k = i + 1;
    const s = blokOf(k);
    const secimSahnesi = s === k;
    const sonraki = s !== undefined && (k === s + 1 || k === s + 2) ? id(s + 3) : k === n ? null : id(k + 1);
    return {
      id: id(k),
      isim: `${k}. durak`,
      sahne_turu: secimSahnesi ? "secim" : s !== undefined && k === s + 3 ? "birlesme" : "gorev",
      hikaye_metni: "",
      mekan: {
        tur: input.alan === "okul" ? "qr" : "sanal",
        qr_durak_id: input.alan === "okul" ? IZINLI_QR_IDLERI[i] : null,
        sonraki_durak_tarifi: "",
      },
      gorev: {
        tur: "coktan_secmeli",
        ogrenme_hedefi: hedefler[i % hedefler.length],
        soru: "",
        secenekler: [],
        dogru_cevap: "",
        ipucu_1: "",
        ipucu_2: "",
        destek_gorevi: { soru: "", secenekler: [], dogru_cevap: "", aciklama: "" },
        odul_id: odulDuraklari.get(k) ?? null,
      },
      secimler: secimSahnesi ? [{ metin: "", hedef_durak_id: id(k + 1) }, { metin: "", hedef_durak_id: id(k + 2) }] : [],
      varsayilan_sonraki_durak_id: secimSahnesi ? null : sonraki,
    };
  });

  const kullanilan = [...new Set(duraklar.map((d) => d.gorev.ogrenme_hedefi))];
  return {
    meta: {
      baslik: input.konuAdi,
      sinif: input.sinif,
      ders: input.dersAdi,
      konu: input.konuAdi,
      sure_dk: input.sure,
      deneyim: input.deneyim,
      alan: input.alan,
      kaynak: "sablon",
    },
    hikaye_giris: "",
    oyun_amaci: VARSAYILAN_AMAC,
    ogrenme_hedefleri: kullanilan,
    envanter: [...odulDuraklari.values()].map((nid, i) => ({ id: nid, tur: "kanit", isim: `Kanıt ${i + 1}`, final_icin_gerekli: true })),
    duraklar,
    final: {
      hikaye_metni: "",
      gerekli_nesneler: [...odulDuraklari.values()],
      ogrenme_hedefleri: kullanilan.slice(0, 2),
      gorev_turu: "coktan_secmeli",
      soru: "",
      secenekler: [],
      dogru_cevap: "",
      basari_metni: "",
    },
  };
}

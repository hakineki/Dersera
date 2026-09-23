import { answerFormatError } from "@/lib/composer/answers";
import type { GameDefinition } from "@/lib/composer/definition";
import type { Recipe } from "@/lib/composer/recipe";

export interface ValidationIssue {
  kod: string;
  mesaj: string;
  durakId?: string;
}

export interface ValidationContext {
  izinliHedefler: string[];
  alan: "sinif" | "okul";
  deneyim: "macera" | "dengeli" | "ders";
  izinliQrIdleri: string[];
  recipe?: Recipe;
  hedefDersleri?: Record<string, string[]>;
}

export interface ValidationResult {
  gecerli: boolean;
  hatalar: ValidationIssue[];
  uyarilar: ValidationIssue[];
}

const ID = /^[a-z0-9-]{1,40}$/;
// Tarifin en büyük hedefi (10 durak) üstünde pay bırakılır; yayın deposunu şişirecek tanımlar reddedilir.
export const LIMITLER = { durak: 12, nesne: 8, secenek: 6, metin: 1000 } as const;
export const FINAL = "__final__";

// Başlangıçtan finale giden bütün yolları kapsayan yönlü grafik. Kenarsız durak finale bağlanır.
export function edgesOf(def: GameDefinition): Map<string, string[]> {
  const edges = new Map<string, string[]>();
  for (const d of def.duraklar) {
    const out = d.secimler.map((s) => s.hedef_durak_id);
    if (d.varsayilan_sonraki_durak_id) out.push(d.varsayilan_sonraki_durak_id);
    edges.set(d.id, out.length ? [...new Set(out)] : [FINAL]);
  }
  return edges;
}

export function reachableFrom(start: string, edges: Map<string, string[]>, skip?: Set<string>): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const n = stack.pop()!;
    if (seen.has(n) || skip?.has(n)) continue;
    seen.add(n);
    for (const m of edges.get(n) ?? []) stack.push(m);
  }
  return seen;
}

function collectStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => collectStrings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => collectStrings(x, out));
  return out;
}

export function validateGame(def: GameDefinition, ctx: ValidationContext): ValidationResult {
  const hatalar: ValidationIssue[] = [];
  const uyarilar: ValidationIssue[] = [];
  const hata = (kod: string, mesaj: string, durakId?: string) => hatalar.push({ kod, mesaj, durakId });
  const uyari = (kod: string, mesaj: string, durakId?: string) => uyarilar.push({ kod, mesaj, durakId });

  const izinliHedef = new Set(ctx.izinliHedefler);
  const durakIdleri = def.duraklar.map((d) => d.id);
  const durakSet = new Set(durakIdleri);
  const envanterIdleri = def.envanter.map((e) => e.id);
  const envanterSet = new Set(envanterIdleri);

  if (def.duraklar.length === 0) {
    hata("durak-yok", "Oyunda hiç durak yok.");
    return { gecerli: false, hatalar, uyarilar };
  }

  // Boyut sınırları
  if (def.duraklar.length > LIMITLER.durak) hata("durak-fazla", `En fazla ${LIMITLER.durak} durak olabilir.`);
  if (def.envanter.length > LIMITLER.nesne) hata("nesne-fazla", `En fazla ${LIMITLER.nesne} nesne olabilir.`);
  const uzun = collectStrings(def).find((s) => s.length > LIMITLER.metin);
  if (uzun !== undefined) hata("metin-uzun", `Metinler en fazla ${LIMITLER.metin} karakter olabilir.`);
  const cokSecenek = [...def.duraklar.flatMap((d) => [d.gorev.secenekler, d.gorev.destek_gorevi.secenekler, d.secimler]), def.final.secenekler].some((a) => a.length > LIMITLER.secenek);
  if (cokSecenek) hata("secenek-fazla", `Bir görevde en fazla ${LIMITLER.secenek} seçenek olabilir.`);

  // Kimlikler
  if (durakSet.size !== durakIdleri.length) hata("durak-id-tekrar", "Durak kimlikleri benzersiz değil.");
  durakIdleri.filter((id) => !ID.test(id)).forEach((id) => hata("durak-id-bicim", `Geçersiz durak kimliği: "${id}".`, id));
  if (envanterSet.size !== envanterIdleri.length) hata("nesne-id-tekrar", "Envanter kimlikleri benzersiz değil.");

  // Referanslar ve durak kuralları
  const odulVerenler = new Map<string, string[]>();
  for (const d of def.duraklar) {
    for (const s of d.secimler) {
      if (!durakSet.has(s.hedef_durak_id)) hata("hedef-yok", `"${d.isim}" seçimi olmayan bir durağa gidiyor: ${s.hedef_durak_id}.`, d.id);
      if (s.hedef_durak_id === d.id) hata("kendine-donus", `"${d.isim}" seçimi kendisine dönüyor.`, d.id);
      if (!s.metin.trim()) hata("secim-metni-bos", `"${d.isim}" durağında boş seçim metni var.`, d.id);
    }
    const sonraki = d.varsayilan_sonraki_durak_id;
    if (sonraki !== null && !durakSet.has(sonraki)) hata("hedef-yok", `"${d.isim}" olmayan bir durağa bağlanıyor: ${sonraki}.`, d.id);
    if (sonraki === d.id) hata("kendine-donus", `"${d.isim}" kendisine bağlanıyor.`, d.id);

    if (d.sahne_turu === "secim") {
      const hedefler = new Set(d.secimler.map((s) => s.hedef_durak_id));
      if (d.secimler.length < 2 || hedefler.size < 2) hata("secim-yetersiz", `"${d.isim}" seçim sahnesinde en az 2 farklı rota olmalı.`, d.id);
      if (sonraki !== null) hata("secim-varsayilan", `"${d.isim}" seçim sahnesinde varsayılan sonraki durak olmamalı.`, d.id);
    } else if (d.secimler.length > 0) {
      hata("secim-yanlis-sahne", `"${d.isim}" seçim sahnesi olmadığı hâlde seçim içeriyor.`, d.id);
    }

    // Görev
    const g = d.gorev;
    if (!g.soru.trim()) hata("soru-bos", `"${d.isim}" görevinde soru yok.`, d.id);
    const bicim = answerFormatError(g.tur, g.secenekler, g.dogru_cevap);
    if (bicim) hata("cevap-bicimi", `"${d.isim}": ${bicim}.`, d.id);
    if (!g.ipucu_1.trim() || !g.ipucu_2.trim()) hata("ipucu-eksik", `"${d.isim}" görevinde iki ipucu olmalı.`, d.id);
    else if (g.ipucu_1.trim() === g.ipucu_2.trim()) hata("ipucu-ayni", `"${d.isim}" görevinin iki ipucu aynı.`, d.id);
    const ds = g.destek_gorevi;
    const destekBicim = answerFormatError("coktan_secmeli", ds.secenekler, ds.dogru_cevap);
    if (!ds.soru.trim() || destekBicim) hata("destek-eksik", `"${d.isim}" destek görevi eksik ya da hatalı${destekBicim ? `: ${destekBicim}` : ""}.`, d.id);
    if (!ds.aciklama.trim()) hata("destek-aciklama", `"${d.isim}" destek görevinde açıklama yok.`, d.id);
    if (!izinliHedef.has(g.ogrenme_hedefi)) hata("hedef-disi", `"${d.isim}" seçilen konunun dışında bir öğrenme hedefi kullanıyor: ${g.ogrenme_hedefi}.`, d.id);
    if (g.odul_id !== null) {
      if (!envanterSet.has(g.odul_id)) hata("odul-yok", `"${d.isim}" envanterde olmayan bir ödül veriyor: ${g.odul_id}.`, d.id);
      else odulVerenler.set(g.odul_id, [...(odulVerenler.get(g.odul_id) ?? []), d.id]);
    }

    // Mekân
    if (ctx.alan === "sinif") {
      if (d.mekan.tur !== "sanal" || d.mekan.qr_durak_id !== null) hata("sinif-qr", `"${d.isim}" tek sınıf oyununda QR gerektirmemeli.`, d.id);
    } else {
      if (d.mekan.tur !== "qr" || !d.mekan.qr_durak_id) hata("okul-qr-eksik", `"${d.isim}" okul macerasında bir QR'a bağlı olmalı.`, d.id);
      else if (!ctx.izinliQrIdleri.includes(d.mekan.qr_durak_id)) hata("qr-bilinmiyor", `"${d.isim}" QR kütüphanesinde olmayan bir QR kullanıyor: ${d.mekan.qr_durak_id}.`, d.id);
    }
  }

  if (ctx.alan === "okul") {
    const qrlar = def.duraklar.map((d) => d.mekan.qr_durak_id).filter((q): q is string => q !== null);
    if (new Set(qrlar).size !== qrlar.length) hata("qr-tekrar", "Aynı QR birden fazla durakta kullanılıyor.");
  }

  // Disiplinler arası oyunda seçilen her ders en az bir görevde çalışılmalı.
  if (ctx.hedefDersleri && Object.keys(ctx.hedefDersleri).length > 1) {
    const kullanilan = new Set(def.duraklar.map((d) => d.gorev.ogrenme_hedefi));
    for (const [ders, kodlar] of Object.entries(ctx.hedefDersleri)) {
      if (!kodlar.some((k) => kullanilan.has(k))) hata("ders-eksik", `Seçilen "${ders}" dersi hiçbir görevde çalışılmıyor.`);
    }
  }

  // Oyun hedefleri de konuya ait olmalı
  def.ogrenme_hedefleri.filter((h) => !izinliHedef.has(h)).forEach((h) => hata("hedef-disi", `Oyun hedefi seçilen konuya ait değil: ${h}.`));

  // Grafik: başlangıç = ilk durak
  const edges = edgesOf(def);
  const start = def.duraklar[0].id;
  const erisilen = reachableFrom(start, edges);
  if (!erisilen.has(FINAL)) hata("final-erisilemez", "Başlangıçtan finale ulaşılamıyor.");
  def.duraklar.filter((d) => !erisilen.has(d.id)).forEach((d) => hata("erisilemez-durak", `"${d.isim}" başlangıçtan ulaşılamıyor.`, d.id));
  // Her erişilen durak finale ulaşabilmeli: aksi hâlde çıkmaz ya da kapalı döngü vardır.
  for (const d of def.duraklar) {
    if (erisilen.has(d.id) && !reachableFrom(d.id, edges).has(FINAL)) {
      hata("cikmaz-rota", `"${d.isim}" durağından finale giden yol yok (çıkmaz ya da kapalı döngü).`, d.id);
    }
  }

  // Anlamlı seçim
  const secimSahneleri = def.duraklar.filter((d) => d.sahne_turu === "secim" && new Set(d.secimler.map((s) => s.hedef_durak_id)).size >= 2);
  if (secimSahneleri.length === 0) hata("secim-yok", "Oyunda en az bir gerçek oyuncu kararı (seçim sahnesi) olmalı.");

  // Envanter ve final
  const f = def.final;
  if (!f.soru.trim() || !f.basari_metni.trim()) hata("final-eksik", "Final görevi ya da başarı metni eksik.");
  const finalBicim = answerFormatError(f.gorev_turu, f.secenekler, f.dogru_cevap);
  if (finalBicim) hata("final-cevap", `Final: ${finalBicim}.`);
  f.ogrenme_hedefleri.filter((h) => !izinliHedef.has(h)).forEach((h) => hata("hedef-disi", `Final hedefi seçilen konuya ait değil: ${h}.`));

  const gerekliler = new Set([...f.gerekli_nesneler, ...def.envanter.filter((e) => e.final_icin_gerekli).map((e) => e.id)]);
  for (const id of gerekliler) {
    if (!envanterSet.has(id)) {
      hata("final-nesne-yok", `Final envanterde olmayan bir nesne istiyor: ${id}.`);
      continue;
    }
    const verenler = odulVerenler.get(id) ?? [];
    if (verenler.length === 0) {
      hata("nesne-kazanilamaz", `Final için gereken "${id}" hiçbir görevde kazanılmıyor.`);
      continue;
    }
    // Ödül veren durakları atlayarak finale ulaşılabiliyorsa, bir rotada nesne kaçırılır ve geri kazanılamaz.
    if (reachableFrom(start, edges, new Set(verenler)).has(FINAL)) {
      hata("nesne-kacirilabilir", `Final için gereken "${id}" bazı rotalarda kazanılmıyor; öğrenci finale bu nesne olmadan ulaşabilir.`);
    }
  }

  if (ctx.deneyim !== "ders" && def.envanter.length === 0) hata("nesne-kullanilmiyor", "Macera ve Dengeli oyunlarda kanıt/nesne kullanılmalı.");
  if (ctx.deneyim !== "ders" && gerekliler.size === 0) hata("final-nesne-kullanmiyor", "Macera ve Dengeli oyunlarda final toplanan nesneleri kullanmalı.");

  // Final önceki oyun verisini birleştirmeli: yalnız parola ya da bağımsız tek soru olamaz.
  const calisilanHedefler = new Set(def.duraklar.map((d) => d.gorev.ogrenme_hedefi));
  const finaldeKullanilan = f.ogrenme_hedefleri.filter((h) => calisilanHedefler.has(h));
  if (gerekliler.size === 0 && finaldeKullanilan.length < 2) {
    hata("final-bagimsiz", "Final önceki görevlerden gelen bilgi veya nesneleri kullanmıyor (en az 2 çalışılmış hedef ya da gerekli nesne olmalı).");
  }

  // Yapı hedefleri (tarif) — sapma yayını engellemez, öğretmene bildirilir.
  if (ctx.recipe) {
    const n = def.duraklar.length;
    if (n < ctx.recipe.anaGorev.min || n > ctx.recipe.anaGorev.max) {
      uyari("gorev-sayisi", `Görev sayısı ${n}; hedef ${ctx.recipe.anaGorev.min}-${ctx.recipe.anaGorev.max}.`);
    }
    if (secimSahneleri.length < ctx.recipe.secim.min) {
      uyari("secim-sayisi", `Seçim sayısı ${secimSahneleri.length}; hedef en az ${ctx.recipe.secim.min}.`);
    }
  }

  return { gecerli: hatalar.length === 0, hatalar, uyarilar };
}

export interface GameSummary {
  durak: number;
  gorev: number;
  dallanma: number;
  nesne: number;
}

export function summarize(def: GameDefinition): GameSummary {
  return {
    durak: def.duraklar.length,
    gorev: def.duraklar.length + 1,
    dallanma: def.duraklar.filter((d) => d.sahne_turu === "secim").length,
    nesne: def.envanter.length,
  };
}

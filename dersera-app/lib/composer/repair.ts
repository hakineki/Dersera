import type { Durak, GameDefinition } from "@/lib/composer/definition";
import { joinAnswer, normalize, splitAnswer } from "@/lib/composer/answers";
import { edgesOf, FINAL, reachableFrom } from "@/lib/composer/validator";

// Modelin dallanan rotalarda sık yaptığı yapı hatalarını yeni bir API çağrısı olmadan onarır.
// Yalnız ilk üretimde çalışır; öğretmenin düzenlemeleri onarılmadan sıkı doğrulanır.
// Her onarım öğretmene uyarı olarak bildirilir.

const bos = (d: Durak) => !d.gorev.soru.trim() && !d.gorev.dogru_cevap.trim();

// Görevsiz seçim durağı: seçimleri, ona bağlanan tek görev durağına taşınır ve boş durak silinir.
function secimDuraginiBirlestir(def: GameDefinition, notlar: string[]) {
  for (const d of [...def.duraklar]) {
    if (d.sahne_turu !== "secim" || !bos(d) || def.duraklar[0].id === d.id) continue;
    const gelenler = def.duraklar.filter(
      (p) => p.varsayilan_sonraki_durak_id === d.id || p.secimler.some((s) => s.hedef_durak_id === d.id)
    );
    const onceki = gelenler[0];
    if (gelenler.length !== 1 || onceki.sahne_turu === "secim" || onceki.varsayilan_sonraki_durak_id !== d.id) continue;
    // Veri kaybı olmasın: ödül/QR taşıyan ya da taşınınca rotası 2'nin altına düşen seçim onarılmaz.
    if (d.gorev.odul_id !== null || d.mekan.qr_durak_id !== null) continue;
    if (d.secimler.some((s) => s.hedef_durak_id === onceki.id)) continue;
    onceki.sahne_turu = "secim";
    onceki.secimler = d.secimler;
    onceki.varsayilan_sonraki_durak_id = null;
    def.duraklar = def.duraklar.filter((x) => x.id !== d.id);
    notlar.push(`Görevsiz "${d.isim}" seçimi "${onceki.isim}" durağına taşındı.`);
  }
}

// Başlangıçtan ulaşılamayan durak: dizideki bir önceki durak rotanın sonuysa ona bağlanır.
function kopuklariBagla(def: GameDefinition, notlar: string[]) {
  for (let i = 1; i < def.duraklar.length; i++) {
    const u = def.duraklar[i];
    const erisilen = reachableFrom(def.duraklar[0].id, edgesOf(def));
    if (erisilen.has(u.id)) continue;
    const p = def.duraklar[i - 1];
    if (!erisilen.has(p.id) || p.sahne_turu === "secim" || p.varsayilan_sonraki_durak_id !== null) continue;
    p.varsayilan_sonraki_durak_id = u.id;
    notlar.push(`"${p.isim}" durağı kopuk kalan "${u.isim}" durağına bağlandı; hikâye akışını gözden geçirin.`);
  }
}

// Final için gereken nesne hiç verilmiyor ya da bazı rotalarda kaçırılıyorsa, ödül her rotanın geçtiği son ödülsüz durağa taşınır.
// Hiç verilmeyen nesne için uygun durak yoksa nesne finalin gereksinimlerinden çıkarılır.
function nesneleriOrtakDuragaTasi(def: GameDefinition, notlar: string[]) {
  const start = def.duraklar[0].id;
  const edges = edgesOf(def);
  if (!reachableFrom(start, edges).has(FINAL)) return;
  const zorunlu = def.duraklar.filter((d) => d.id !== start && !reachableFrom(start, edges, new Set([d.id])).has(FINAL));
  const gerekliler = new Set([...def.final.gerekli_nesneler, ...def.envanter.filter((e) => e.final_icin_gerekli).map((e) => e.id)]);
  for (const id of gerekliler) {
    if (!def.envanter.some((e) => e.id === id)) continue;
    const verenler = def.duraklar.filter((d) => d.gorev.odul_id === id);
    const hicYok = verenler.length === 0;
    if (!hicYok && !reachableFrom(start, edges, new Set(verenler.map((d) => d.id))).has(FINAL)) continue;
    const hedef = [start, ...zorunlu.map((d) => d.id)]
      .map((x) => def.duraklar.find((d) => d.id === x)!)
      .filter((d) => d.gorev.odul_id === null)
      .pop();
    if (!hedef) {
      if (hicYok) finaldenCikar(def, id, notlar);
      continue;
    }
    verenler.forEach((d) => (d.gorev.odul_id = null));
    hedef.gorev.odul_id = id;
    notlar.push(
      hicYok
        ? `Final için gereken "${id}" hiçbir görevde verilmiyordu; artık her rotanın geçtiği "${hedef.isim}" durağında veriliyor. Hikâye metnini gözden geçirin.`
        : `Final için gereken "${id}" bazı rotalarda kaçırılıyordu; artık her rotanın geçtiği "${hedef.isim}" durağında veriliyor. Hikâye metnini gözden geçirin.`
    );
  }
}

function finaldenCikar(def: GameDefinition, id: string, notlar: string[]) {
  def.final.gerekli_nesneler = def.final.gerekli_nesneler.filter((n) => n !== id);
  def.envanter.forEach((e) => {
    if (e.id === id) e.final_icin_gerekli = false;
  });
  notlar.push(`Final için gereken "${id}" hiçbir görevde kazanılmıyordu ve verilecek uygun durak yoktu; finalin gereksinimlerinden çıkarıldı. Final metnini gözden geçirin.`);
}

// Fazla seçenek/öğe/çift, cevap tutarlılığı korunarak üst sınıra kırpılır. Eksik olan uydurulmaz.
const UST_SINIR: Record<string, number> = { coktan_secmeli: 5, gorsel_secim: 5, siralama: 6, surukle_birak: 6, eslestirme: 5 };

function kirp(tur: string, secenekler: string[], dogru: string): { secenekler: string[]; dogru: string } | null {
  const ust = UST_SINIR[tur];
  if (!ust || secenekler.length <= ust) return null;
  if (tur === "coktan_secmeli" || tur === "gorsel_secim") {
    const dogruSecenek = secenekler.find((s) => normalize(s) === normalize(dogru));
    if (!dogruSecenek) return null;
    const digerleri = secenekler.filter((s) => s !== dogruSecenek).slice(0, ust - 1);
    const i = Math.min(secenekler.indexOf(dogruSecenek), digerleri.length);
    return { secenekler: [...digerleri.slice(0, i), dogruSecenek, ...digerleri.slice(i)], dogru };
  }
  if (tur === "eslestirme") {
    const kalan = secenekler.slice(0, ust);
    return { secenekler: kalan, dogru: joinAnswer(kalan) };
  }
  // Sıralama: doğru sıranın ilk öğeleri tutulur; öğeler karışık sıralarını korur.
  const sira = splitAnswer(dogru).slice(0, ust);
  const tut = new Set(sira.map(normalize));
  return { secenekler: secenekler.filter((s) => tut.has(normalize(s))), dogru: joinAnswer(sira) };
}

function fazlalariKirp(def: GameDefinition, notlar: string[]) {
  for (const d of def.duraklar) {
    const r = kirp(d.gorev.tur, d.gorev.secenekler, d.gorev.dogru_cevap);
    if (!r) continue;
    notlar.push(`"${d.isim}" görevindeki fazla seçenekler ${r.secenekler.length} taneye indirildi.`);
    d.gorev.secenekler = r.secenekler;
    d.gorev.dogru_cevap = r.dogru;
  }
  const f = kirp(def.final.gorev_turu, def.final.secenekler, def.final.dogru_cevap);
  if (f) {
    notlar.push(`Final görevindeki fazla seçenekler ${f.secenekler.length} taneye indirildi.`);
    def.final.secenekler = f.secenekler;
    def.final.dogru_cevap = f.dogru;
  }
}

export function onar(input: GameDefinition): { definition: GameDefinition; notlar: string[] } {
  const def: GameDefinition = structuredClone(input);
  const notlar: string[] = [];
  if (def.duraklar.length === 0) return { definition: def, notlar };
  secimDuraginiBirlestir(def, notlar);
  kopuklariBagla(def, notlar);
  nesneleriOrtakDuragaTasi(def, notlar);
  fazlalariKirp(def, notlar);
  return { definition: def, notlar };
}

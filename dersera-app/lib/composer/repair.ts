import type { Durak, GameDefinition } from "@/lib/composer/definition";
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

// Final için gereken nesne bazı rotalarda kaçırılıyorsa, ödül her rotanın geçtiği son ödülsüz durağa taşınır.
function nesneleriOrtakDuragaTasi(def: GameDefinition, notlar: string[]) {
  const start = def.duraklar[0].id;
  const edges = edgesOf(def);
  if (!reachableFrom(start, edges).has(FINAL)) return;
  const zorunlu = def.duraklar.filter((d) => d.id !== start && !reachableFrom(start, edges, new Set([d.id])).has(FINAL));
  const gerekliler = new Set([...def.final.gerekli_nesneler, ...def.envanter.filter((e) => e.final_icin_gerekli).map((e) => e.id)]);
  for (const id of gerekliler) {
    const verenler = def.duraklar.filter((d) => d.gorev.odul_id === id);
    if (verenler.length === 0 || !reachableFrom(start, edges, new Set(verenler.map((d) => d.id))).has(FINAL)) continue;
    const hedef = [start, ...zorunlu.map((d) => d.id)]
      .map((x) => def.duraklar.find((d) => d.id === x)!)
      .filter((d) => d.gorev.odul_id === null)
      .pop();
    if (!hedef) continue;
    verenler.forEach((d) => (d.gorev.odul_id = null));
    hedef.gorev.odul_id = id;
    notlar.push(`Final için gereken "${id}" bazı rotalarda kaçırılıyordu; artık her rotanın geçtiği "${hedef.isim}" durağında veriliyor. Hikâye metnini gözden geçirin.`);
  }
}

export function onar(input: GameDefinition): { definition: GameDefinition; notlar: string[] } {
  const def: GameDefinition = structuredClone(input);
  const notlar: string[] = [];
  if (def.duraklar.length === 0) return { definition: def, notlar };
  secimDuraginiBirlestir(def, notlar);
  kopuklariBagla(def, notlar);
  nesneleriOrtakDuragaTasi(def, notlar);
  return { definition: def, notlar };
}

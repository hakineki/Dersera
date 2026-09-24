import { kutuphaneSahibi } from "@/lib/auth";
import { BENZERLIK, benzerlikOrani, dersleriOrtak, metinParcalari, type BenzerOyun } from "@/lib/benzerlik";
import type { GameDefinition } from "@/lib/composer/definition";
import type { Hesap } from "@/lib/authStore";
import { parseComposerDefinition } from "@/lib/composer/adapter";
import { checkLimit } from "@/lib/composer/rateLimit";
import { yonetisimDegerlendir, type YonetisimSonucu } from "@/lib/composer/yonetisim";
import { yzDenetle, yzOnbellektenOku } from "@/lib/composer/yzDenetimService";
import { kutuphaneIstatistikleri } from "@/lib/istatistikService";
import { toplulukOdulu } from "@/lib/krediService";
import type { LibraryStore } from "@/lib/libraryStore";
import { durumOf, TOPLULUK_KURALLARI as K, type Inceleme, type ToplulukDurumu, type ToplulukKaydi } from "@/lib/topluluk";
import { icerikOzetiOf, kullanimDetayi, yeniToplulukKaydi } from "@/lib/toplulukService";
import type { ToplulukStore } from "@/lib/toplulukStore";

// Topluluğa gönderim ve iki bağımsız öğretmen incelemesi (docs/URUN-BAGLAMI.md §8).
// Deterministiktir: eşikler TOPLULUK_KURALLARI'ndan, içerik denetimi yönetişimden gelir.

const GUN = 24 * 60 * 60 * 1000;
type Sonuc<T> = ({ ok: true } & T) | { ok: false; status: number; error: string; nedenler?: string[]; yonetisim?: YonetisimSonucu };

const hesapYeterliMi = (h: Hesap, now: number) => now - h.olusturma >= K.hesapYasiGun * GUN;
const HESAP_GENC = `Hesabın en az ${K.hesapYasiGun} günlük olmalı.`;

export interface PaylasimUygunlugu {
  uygun: boolean;
  // Oyuna ait eksikler (kısa); hesap yaşı kütüphane sayfasında bir kez gösterilir.
  nedenler: string[];
}

// Hesap yaşı koşulu oyuna değil hesaba aittir: kütüphane yanıtında bir kez döner.
export function hesapHazirligi(hesap: Hesap, now: number): { toplulukHazir: boolean; kalanGun: number } {
  const kalan = K.hesapYasiGun * GUN - (now - hesap.olusturma);
  return { toplulukHazir: kalan <= 0, kalanGun: Math.max(0, Math.ceil(kalan / GUN)) };
}

// Kütüphane kartındaki "Toplulukta paylaş" düğmesi bu sonuca göre açılır; gönderimde aynı kural sunucuda yeniden uygulanır.
export function paylasimUygunlugu(
  hesap: Hesap,
  ist: { ogrenci_sayisi: number; puan_ortalama: number | null },
  now: number
): PaylasimUygunlugu {
  const nedenler: string[] = [];
  if (ist.ogrenci_sayisi < K.enAzOgrenci) nedenler.push(`${K.enAzOgrenci} öğrenci bitirmeli (şu an ${ist.ogrenci_sayisi})`);
  if (ist.puan_ortalama === null || ist.puan_ortalama < K.enAzPuan) {
    const simdi = ist.puan_ortalama === null ? "henüz yok" : `şu an ${ist.puan_ortalama.toLocaleString("tr-TR")}`;
    nedenler.push(`öğrenci puanı en az ${K.enAzPuan.toLocaleString("tr-TR")} (${simdi})`);
  }
  return { uygun: nedenler.length === 0 && hesapYeterliMi(hesap, now), nedenler };
}

export interface ToplulukDurumOzeti {
  durum: ToplulukDurumu;
  kabul: number;
  ret: number;
  // Ret gerekçeleri öğretmene isimsiz gösterilir.
  retNotlari: string[];
  // Yeni sürüm incelemedeyken ya da reddedilince önceki sürüm toplulukta kalır.
  oncekiYayinda: boolean;
}

const say = (incelemeler: Inceleme[]) => ({
  kabul: incelemeler.filter((i) => i.karar === "kabul").length,
  ret: incelemeler.filter((i) => i.karar === "ret").length,
});

// Kimlik listesini (boşluklu) tek MGET ile kayıtlara çevirir; sıra korunur.
async function kayitlarOf(store: ToplulukStore, idler: (string | null | undefined)[]): Promise<(ToplulukKaydi | null)[]> {
  const dolu = idler.filter((id): id is string => !!id);
  const okunan = await store.getMany(dolu);
  const harita = new Map(dolu.map((id, i) => [id, okunan[i]]));
  return idler.map((id) => (id ? (harita.get(id) ?? null) : null));
}

// Kütüphane listesi için: her kaydın son topluluk gönderiminin durumu (hiç gönderilmediyse null). Toplu okunur:
// kaynaklar, kayıtlar ve önceki sürümler birer MGET; inceleme sayıları yalnız incelemedeki/reddedilen kayıtlar için.
// Okunamazsa liste yine gelir (hepsi null).
export async function toplulukDurumlari(store: ToplulukStore, kaynaklar: string[]): Promise<(ToplulukDurumOzeti | null)[]> {
  try {
    const kayitlar = await kayitlarOf(store, await store.kaynaklariOku(kaynaklar));
    const oncekiler = await kayitlarOf(store, kayitlar.map((k) => k?.onceki_id));
    return await Promise.all(
      kayitlar.map(async (kayit, i) => {
        if (!kayit) return null;
        const durum = durumOf(kayit);
        const incelemeler = durum === "inceleme" || durum === "reddedildi" ? await store.incelemeler(kayit.oyun_id) : [];
        const onceki = oncekiler[i];
        return {
          durum,
          ...say(incelemeler),
          retNotlari: incelemeler.filter((x) => x.karar === "ret").map((x) => x.not),
          oncekiYayinda: !!onceki && durumOf(onceki) === "yayinda",
        };
      })
    );
  } catch (err) {
    console.error("[topluluk] durum okunamadı", err instanceof Error ? err.message : err);
    return kaynaklar.map(() => null);
  }
}

// Başka öğretmenlerin topluluktaki (yayında ya da incelemede) aynı sınıf ve dersteki oyunlarından inceleme eşiğini
// aşan örtüşmeler, en benzer önce. Birebir aynı içerik burada sayılmaz: gönderimde ayrı (409) ele alınır.
// haric: incelenen kaydın kendisi. Bilinen sınır: en yeni taramaSiniri kayıt taranır; topluluk büyüyünce imza dizini gerekir.
export async function benzerOyunlar(store: ToplulukStore, def: GameDefinition, sahip: string, haric?: string): Promise<BenzerOyun[]> {
  const adaylar = new Set<string>();
  let imlec: number | null = null;
  const uygun = (o: { sinif: number; ders: string } | null) => !!o && o.sinif === def.meta.sinif && dersleriOrtak(o.ders, def.meta.ders);
  for (let taranan = 0; taranan < BENZERLIK.taramaSiniri; ) {
    const adet = Math.min(BENZERLIK.sayfa, BENZERLIK.taramaSiniri - taranan);
    const sayfa = await store.sirali(imlec, adet);
    for (const o of sayfa) if (uygun(o.ozet)) adaylar.add(o.ozet!.oyun_id);
    if (sayfa.length < adet) break;
    taranan += sayfa.length;
    imlec = sayfa[sayfa.length - 1].skor;
  }
  // İnceleme kuyruğu özetten süzülür: tam kayıt yalnız aynı sınıf ve dersteki adaylar için okunur.
  const kuyruk = await store.kuyruk(BENZERLIK.taramaSiniri);
  const ozetler = await store.ozetleriOku(kuyruk);
  kuyruk.forEach((id, i) => uygun(ozetler[i]) && adaylar.add(id));
  if (haric) adaylar.delete(haric);

  const benim = metinParcalari(def);
  const icerik = icerikOzetiOf(def);
  const sonuc: BenzerOyun[] = [];
  for (const k of await store.getMany([...adaylar])) {
    if (!k || k.olusturan === sahip || k.sinif !== def.meta.sinif || !dersleriOrtak(k.ders, def.meta.ders)) continue;
    const durum = durumOf(k);
    if ((durum !== "yayinda" && durum !== "inceleme") || icerikOzetiOf(k.definition) === icerik) continue;
    const oran = benzerlikOrani(benim, metinParcalari(k.definition));
    if (oran !== null && oran >= BENZERLIK.incelemeEsigi) sonuc.push({ id: k.oyun_id, baslik: durum === "yayinda" ? k.baslik : null, oran });
  }
  return sonuc.sort((a, b) => b.oran - a.oran).slice(0, BENZERLIK.enCokGosterim);
}

// Öğretmen kütüphanesindeki oyunu topluluğa gönderir: eşikler, içerik denetimi, tekrar ve günlük sınır denetlenir.
export async function topluluktaPaylas(
  store: ToplulukStore,
  library: LibraryStore,
  hesap: Hesap,
  kutuphaneId: string,
  now = Date.now()
): Promise<Sonuc<{ id: string; durum: ToplulukDurumu }>> {
  const sahip = kutuphaneSahibi(hesap);
  const kaynak = `${sahip}:${kutuphaneId}`;
  if (!hesapYeterliMi(hesap, now)) return { ok: false, status: 403, error: HESAP_GENC };
  const kutuphaneKaydi = await library.get(sahip, kutuphaneId);
  if (!kutuphaneKaydi) return { ok: false, status: 404, error: "Oyun kütüphanede bulunamadı" };

  const mevcutId = await store.kaynakOku(kaynak);
  const mevcut = mevcutId ? await store.get(mevcutId) : null;
  if (mevcut && durumOf(mevcut) === "inceleme") return { ok: false, status: 409, error: "Bu oyunun bir sürümü zaten incelemede." };

  const r = parseComposerDefinition(kutuphaneKaydi.definition, kutuphaneKaydi.dersler);
  if (!r.ok) return { ok: false, status: r.status, error: r.error };
  const ENGEL = "Oyun içerik denetiminden geçmedi; topluluğa gönderilemez.";
  const benzer = await benzerOyunlar(store, r.definition, sahip);
  // Kopya ya da geçersiz oyun için ücretli yapay zekâ denetimi yapılmaz.
  const onDenetim = yonetisimDegerlendir(r.definition, r.validation, undefined, benzer);
  if (onDenetim.karar === "BLOCK") return { ok: false, status: 422, error: ENGEL, yonetisim: onDenetim };
  const yonetisim = yonetisimDegerlendir(r.definition, r.validation, await yzDenetle(r.definition, { sinirAnahtari: `hesap:${sahip}` }), benzer);
  if (yonetisim.karar === "BLOCK") return { ok: false, status: 422, error: ENGEL, yonetisim };

  const [ist] = await kutuphaneIstatistikleri([kaynak]);
  const uygunluk = paylasimUygunlugu(hesap, ist, now);
  if (!uygunluk.uygun) return { ok: false, status: 422, error: "Oyun henüz topluluk eşiğini geçmedi.", nedenler: uygunluk.nedenler };

  const icerik = icerikOzetiOf(r.definition);
  const ayniId = await store.icerikId(icerik);
  if (ayniId) {
    const ayni = await store.get(ayniId);
    if (!ayni || ayni.olusturan !== sahip) return { ok: false, status: 409, error: "Bu oyunun aynısı toplulukta zaten var." };
    const d = durumOf(ayni);
    if (d === "yayinda") return { ok: false, status: 409, error: "Bu oyun zaten toplulukta." };
    if (d === "reddedildi") return { ok: false, status: 409, error: "Reddedilen oyun değiştirilmeden yeniden gönderilemez." };
    // Sahibinin geri çektiği aynı içerik: daha önce onaylandıysa doğrudan yayına, değilse incelemeye döner.
    const onaylanmis = say(await store.incelemeler(ayniId)).kabul >= K.gerekliKabul;
    const yeni: ToplulukDurumu = onaylanmis ? "yayinda" : "inceleme";
    if (!(await store.durumGecis(ayniId, ["geri-cekildi"], yeni, d, onaylanmis ? now : undefined))) {
      return { ok: false, status: 409, error: "Oyunun topluluk durumu az önce değişti; sayfayı yenileyip tekrar dene." };
    }
    if (!onaylanmis) await store.kuyrugaEkle(ayniId, now);
    await store.kaynakGuncelle(kaynak, ayniId);
    return { ok: true, id: ayniId, durum: yeni };
  }

  // Tüm denetimlerden sonra, kayıt açılmadan hemen önce: atomik sayaç (eşzamanlı iki gönderim sınırı delemez).
  // Bilinen sınır: aynı içerik tam bu anda başkasınca eklenirse (aşağıdaki 409) o günün hakkı harcanmış olur.
  if (!(await checkLimit(`dersera:topluluk:gonderim:${sahip}`, GUN, K.gunlukGonderim))) {
    return { ok: false, status: 429, error: `Günde en fazla ${K.gunlukGonderim} oyun gönderebilirsin. Yarın tekrar dene.` };
  }
  // Onaylanınca yerini alacağı, o an yayındaki kendi önceki sürümü.
  const oncekiId = mevcut && mevcut.olusturan === sahip && durumOf(mevcut) === "yayinda" ? mevcutId : null;
  const kayit = yeniToplulukKaydi(r.definition, r.dersler, sahip, now, { durum: "inceleme", aktif: false, kaynak, onceki_id: oncekiId });
  const id = await store.ekle(kayit, icerik);
  // Yarışta aynı içerik başka biri tarafından eklendiyse ekle mevcut kimliği döner.
  if (id !== kayit.oyun_id) return { ok: false, status: 409, error: "Bu oyunun aynısı toplulukta zaten var." };
  await store.kuyrugaEkle(id, now);
  await store.kaynakGuncelle(kaynak, id);
  return { ok: true, id, durum: "inceleme" };
}

// Sahibi oyunu topluluktan tamamen kaldırır: incelemedeki ya da yayındaki son gönderim ve (varsa) hâlâ yayındaki
// önceki sürüm. Yalnız kendi kayıtlarına dokunur.
export async function topluluktanGeriCek(store: ToplulukStore, hesap: Hesap, kutuphaneId: string): Promise<Sonuc<{ kaldirilan: number }>> {
  const sahip = kutuphaneSahibi(hesap);
  const id = await store.kaynakOku(`${sahip}:${kutuphaneId}`);
  const son = id ? await store.get(id) : null;
  if (!son || son.olusturan !== sahip) return { ok: false, status: 404, error: "Bu oyun toplulukta değil." };
  const onceki = son.onceki_id ? await store.get(son.onceki_id) : null;
  const kaldirilacak = [son, onceki].filter(
    (k): k is ToplulukKaydi => !!k && k.olusturan === sahip && (durumOf(k) === "inceleme" || durumOf(k) === "yayinda")
  );
  let kaldirilan = 0;
  for (const k of kaldirilacak) {
    // Atomik: bu arada onaylanan ya da reddedilen kayıt için geçiş olmaz; eşzamanlı onay geri çekmeyi ezemez.
    if (await store.durumGecis(k.oyun_id, ["inceleme", "yayinda"], "geri-cekildi", durumOf(k))) {
      await store.kuyruktanCikar(k.oyun_id);
      kaldirilan++;
    }
  }
  if (kaldirilan === 0) return { ok: false, status: 409, error: "Bu oyun toplulukta değil." };
  return { ok: true, kaldirilan };
}

export interface IncelemeOgesi {
  oyun_id: string;
  baslik: string;
  ders: string;
  konu: string;
  sinif: number;
  sure_dk: number;
  alan: ToplulukKaydi["alan"];
  deneyim: ToplulukKaydi["deneyim"];
  gonderim_tarihi: number;
  kabul: number;
  ret: number;
}

const KUYRUK_TARAMA = 100;
const KUYRUK_SAYFA = 20;

// İnceleme bekleyen oyunlar: kendi oyunları ve daha önce incelediği oyunlar hariç, en eski gönderim önce.
export async function incelemeKuyrugu(store: ToplulukStore, hesap: Hesap, now = Date.now()): Promise<{ inceleyebilir: boolean; neden?: string; oyunlar: IncelemeOgesi[] }> {
  if (!hesapYeterliMi(hesap, now)) return { inceleyebilir: false, neden: HESAP_GENC, oyunlar: [] };
  const sahip = kutuphaneSahibi(hesap);
  // Kayıtlar tek MGET ile, incelemeler paralel okunur.
  const adaylar = (await kayitlarOf(store, await store.kuyruk(KUYRUK_TARAMA))).filter(
    (k): k is ToplulukKaydi => !!k && durumOf(k) === "inceleme" && k.olusturan !== sahip
  );
  const incelemeler = await Promise.all(adaylar.map((k) => store.incelemeler(k.oyun_id)));
  const oyunlar: IncelemeOgesi[] = adaylar
    .map((k, i) => ({ k, inc: incelemeler[i] }))
    .filter(({ inc }) => !inc.some((x) => x.inceleyen === sahip))
    .slice(0, KUYRUK_SAYFA)
    .map(({ k, inc }) => {
      const { oyun_id, baslik, ders, konu, sinif, sure_dk, alan, deneyim } = k;
      return { oyun_id, baslik, ders, konu, sinif, sure_dk, alan, deneyim, gonderim_tarihi: k.gonderim_tarihi ?? k.yayin_tarihi, ...say(inc) };
    });
  return { inceleyebilir: true, oyunlar };
}

async function incelenebilirKayit(store: ToplulukStore, hesap: Hesap, id: string, now: number): Promise<Sonuc<{ kayit: ToplulukKaydi; incelemeler: Inceleme[] }>> {
  if (!hesapYeterliMi(hesap, now)) return { ok: false, status: 403, error: HESAP_GENC };
  const kayit = await store.get(id);
  if (!kayit || durumOf(kayit) !== "inceleme") return { ok: false, status: 404, error: "İnceleme bekleyen böyle bir oyun yok." };
  if (kayit.olusturan === kutuphaneSahibi(hesap)) return { ok: false, status: 403, error: "Kendi oyununu inceleyemezsin." };
  const incelemeler = await store.incelemeler(id);
  if (incelemeler.some((i) => i.inceleyen === kutuphaneSahibi(hesap))) return { ok: false, status: 409, error: "Bu oyunu zaten inceledin." };
  return { ok: true, kayit, incelemeler };
}

// İnceleyenin göreceği tam oyun ve içerik denetimi sonucu. Gönderen ve diğer inceleyenler gizlidir.
export async function incelemeDetayi(store: ToplulukStore, hesap: Hesap, id: string, now = Date.now()) {
  const r = await incelenebilirKayit(store, hesap, id, now);
  if (!r.ok) return r;
  const detay = kullanimDetayi(r.kayit);
  // İnceleme ekranı model çağırmaz: gönderimde yapılan denetim önbellekten okunur.
  // İnceleyen, oyunun başka öğretmenlerin topluluktaki oyunlarına benzerliğini de görür.
  if (!detay.validation) return { ok: true as const, ...detay, yonetisim: null, ...say(r.incelemeler) };
  const [yz, benzer] = await Promise.all([yzOnbellektenOku(r.kayit.definition), benzerOyunlar(store, r.kayit.definition, r.kayit.olusturan, r.kayit.oyun_id)]);
  return { ok: true as const, ...detay, yonetisim: yonetisimDegerlendir(r.kayit.definition, detay.validation, yz, benzer), ...say(r.incelemeler) };
}

// Hesap başına tek oy. Gerekli kabul sayısına ulaşınca yayına girer (önceki sürüm listeden çıkar); ret eşiğinde reddedilir.
export async function incele(
  store: ToplulukStore,
  hesap: Hesap,
  id: string,
  body: unknown,
  now = Date.now()
): Promise<Sonuc<{ durum: ToplulukDurumu; kabul: number; ret: number }>> {
  const b = body as { karar?: unknown; not?: unknown } | null;
  const karar = b?.karar;
  const not = typeof b?.not === "string" ? b.not.trim() : "";
  if (karar !== "kabul" && karar !== "ret") return { ok: false, status: 422, error: "Karar kabul ya da ret olmalı." };
  if (not.length > K.notEnCok) return { ok: false, status: 422, error: `Not en fazla ${K.notEnCok} karakter olabilir.` };
  if (karar === "ret" && not.length < K.notEnAz) return { ok: false, status: 422, error: `Ret için öğretmene en az ${K.notEnAz} karakterlik bir gerekçe yaz.` };

  const r = await incelenebilirKayit(store, hesap, id, now);
  if (!r.ok) return r;
  if (!(await store.incelemeEkle(id, { inceleyen: kutuphaneSahibi(hesap), karar, not, tarih: now }))) {
    return { ok: false, status: 409, error: "Bu oyunu zaten inceledin." };
  }
  // Eşik kararı güncel incelemelerle verilir. Geçiş atomiktir ve yalnız "inceleme"den yapılır: bu arada sahibi geri
  // çektiyse ya da eşzamanlı son oy geçişi zaten yaptıysa yazılmaz, kaydın güncel durumu döner.
  const sayim = say(await store.incelemeler(id));
  const hedef: ToplulukDurumu | null = sayim.kabul >= K.gerekliKabul ? "yayinda" : sayim.ret >= K.redEsigi ? "reddedildi" : null;
  if (!hedef) return { ok: true, durum: "inceleme", ...sayim };
  if (!(await store.durumGecis(id, ["inceleme"], hedef, "inceleme", hedef === "yayinda" ? now : undefined))) {
    const guncel = await store.get(id);
    return { ok: true, durum: guncel ? durumOf(guncel) : hedef, ...sayim };
  }
  await store.kuyruktanCikar(id);
  if (hedef === "yayinda") {
    const onceki = r.kayit.onceki_id ? await store.get(r.kayit.onceki_id) : null;
    if (onceki && onceki.olusturan === r.kayit.olusturan) await store.durumGecis(onceki.oyun_id, ["yayinda"], "geri-cekildi", durumOf(onceki));
    // Ödül yalnız bu atomik geçişi yapan oyda verilir: aynı kayıt için bir kez.
    await toplulukOdulu(r.kayit.olusturan, r.kayit.baslik, now);
  }
  return { ok: true, durum: hedef, ...sayim };
}

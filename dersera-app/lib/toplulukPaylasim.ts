import { kutuphaneSahibi } from "@/lib/auth";
import type { Hesap } from "@/lib/authStore";
import { parseComposerDefinition } from "@/lib/composer/adapter";
import { limitAsildi, limitKaydet } from "@/lib/composer/rateLimit";
import { yonetisimDegerlendir, type YonetisimSonucu } from "@/lib/composer/yonetisim";
import { kutuphaneIstatistikleri } from "@/lib/istatistikService";
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
  nedenler: string[];
}

// Kütüphane kartındaki "Toplulukta paylaş" düğmesi bu sonuca göre açılır; gönderimde aynı kural sunucuda yeniden uygulanır.
export function paylasimUygunlugu(
  hesap: Hesap,
  ist: { ogrenci_sayisi: number; puan_ortalama: number | null },
  now: number
): PaylasimUygunlugu {
  const nedenler: string[] = [];
  if (!hesapYeterliMi(hesap, now)) nedenler.push(HESAP_GENC);
  if (ist.ogrenci_sayisi < K.enAzOgrenci) nedenler.push(`En az ${K.enAzOgrenci} öğrencinin oyunu bitirmesi gerekir (şu an ${ist.ogrenci_sayisi}).`);
  if (ist.puan_ortalama === null || ist.puan_ortalama < K.enAzPuan) {
    const simdi = ist.puan_ortalama === null ? "henüz yeterli puan yok" : `şu an ${ist.puan_ortalama.toLocaleString("tr-TR")}`;
    nedenler.push(`Öğrenci puanı en az ${K.enAzPuan.toLocaleString("tr-TR")} olmalı (${simdi}).`);
  }
  return { uygun: nedenler.length === 0, nedenler };
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

// Kütüphane listesi için: her kaydın son topluluk gönderiminin durumu (hiç gönderilmediyse null). Okunamazsa null.
export async function toplulukDurumlari(store: ToplulukStore, kaynaklar: string[]): Promise<(ToplulukDurumOzeti | null)[]> {
  return Promise.all(
    kaynaklar.map(async (kaynak) => {
      try {
        const id = await store.kaynakOku(kaynak);
        const kayit = id ? await store.get(id) : null;
        if (!id || !kayit) return null;
        const incelemeler = await store.incelemeler(id);
        const onceki = kayit.onceki_id ? await store.get(kayit.onceki_id) : null;
        return {
          durum: durumOf(kayit),
          ...say(incelemeler),
          retNotlari: incelemeler.filter((i) => i.karar === "ret").map((i) => i.not),
          oncekiYayinda: !!onceki && durumOf(onceki) === "yayinda" && onceki.aktif,
        };
      } catch (err) {
        console.error("[topluluk] durum okunamadı", err instanceof Error ? err.message : err);
        return null;
      }
    })
  );
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
  const yonetisim = yonetisimDegerlendir(r.definition, r.validation);
  if (yonetisim.karar === "BLOCK") return { ok: false, status: 422, error: "Oyun içerik denetiminden geçmedi; topluluğa gönderilemez.", yonetisim };

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
    if (onaylanmis) await store.durumYaz(ayniId, "yayinda", now);
    else {
      await store.durumYaz(ayniId, "inceleme");
      await store.kuyrugaEkle(ayniId, now);
    }
    await store.kaynakGuncelle(kaynak, ayniId);
    return { ok: true, id: ayniId, durum: onaylanmis ? "yayinda" : "inceleme" };
  }

  const gunlukAnahtar = `dersera:topluluk:gonderim:${sahip}`;
  if (await limitAsildi(gunlukAnahtar, GUN, K.gunlukGonderim)) {
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
  await limitKaydet(gunlukAnahtar, GUN);
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
  if (kaldirilacak.length === 0) return { ok: false, status: 409, error: "Bu oyun toplulukta değil." };
  for (const k of kaldirilacak) {
    await store.kuyruktanCikar(k.oyun_id);
    await store.durumYaz(k.oyun_id, "geri-cekildi");
  }
  return { ok: true, kaldirilan: kaldirilacak.length };
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
  const oyunlar: IncelemeOgesi[] = [];
  for (const id of await store.kuyruk(KUYRUK_TARAMA)) {
    if (oyunlar.length === KUYRUK_SAYFA) break;
    const k = await store.get(id);
    if (!k || durumOf(k) !== "inceleme" || k.olusturan === sahip) continue;
    const incelemeler = await store.incelemeler(id);
    if (incelemeler.some((i) => i.inceleyen === sahip)) continue;
    const { oyun_id, baslik, ders, konu, sinif, sure_dk, alan, deneyim } = k;
    oyunlar.push({ oyun_id, baslik, ders, konu, sinif, sure_dk, alan, deneyim, gonderim_tarihi: k.gonderim_tarihi ?? k.yayin_tarihi, ...say(incelemeler) });
  }
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
  return { ok: true as const, ...detay, yonetisim: detay.validation ? yonetisimDegerlendir(r.kayit.definition, detay.validation) : null, ...say(r.incelemeler) };
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
  // Eşik kararı güncel incelemelerle verilir; aynı anda gelen iki son oy aynı durumu yazar (işlem tekrarlanabilir).
  const sayim = say(await store.incelemeler(id));
  let durum: ToplulukDurumu = "inceleme";
  if (sayim.kabul >= K.gerekliKabul) {
    durum = "yayinda";
    await store.durumYaz(id, "yayinda", now);
    await store.kuyruktanCikar(id);
    const onceki = r.kayit.onceki_id ? await store.get(r.kayit.onceki_id) : null;
    if (onceki && onceki.olusturan === r.kayit.olusturan && durumOf(onceki) === "yayinda") await store.durumYaz(onceki.oyun_id, "geri-cekildi");
  } else if (sayim.ret >= K.redEsigi) {
    durum = "reddedildi";
    await store.durumYaz(id, "reddedildi");
    await store.kuyruktanCikar(id);
  }
  return { ok: true, durum, ...sayim };
}

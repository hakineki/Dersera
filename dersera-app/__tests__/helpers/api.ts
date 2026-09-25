import { defaultGameStop } from "@/lib/games";
import type { GameDefinition } from "@/lib/composer/definition";
import type { DersKonu } from "@/lib/composer/input";
import { icerikOzetiOf, yeniToplulukKaydi } from "@/lib/toplulukService";

// Route modülleri ve depo tekilleri aynı izole kayıtta yüklenir; her test temiz bellek deposuyla başlar.
export async function buildApi() {
  let mods!: {
    games: typeof import("@/app/api/games/route");
    game: typeof import("@/app/api/games/[code]/route");
    end: typeof import("@/app/api/games/[code]/end/route");
    join: typeof import("@/app/api/games/[code]/join/route");
    results: typeof import("@/app/api/results/route");
    library: typeof import("@/app/api/library/route");
    libraryItem: typeof import("@/app/api/library/[id]/route");
    libraryPublish: typeof import("@/app/api/library/[id]/publish/route");
    libraryStore: typeof import("@/lib/libraryStore");
    gamesStore: typeof import("@/lib/gamesStore");
    libraryService: typeof import("@/lib/libraryService");
    libraryTasi: typeof import("@/app/api/library/tasi/route");
    kayit: typeof import("@/app/api/auth/kayit/route");
    giris: typeof import("@/app/api/auth/giris/route");
    cikis: typeof import("@/app/api/auth/cikis/route");
    ben: typeof import("@/app/api/auth/ben/route");
    sifre: typeof import("@/app/api/auth/sifre/route");
    ad: typeof import("@/app/api/auth/ad/route");
    authStore: typeof import("@/lib/authStore");
    topluluk: typeof import("@/app/api/topluluk/route");
    toplulukOyun: typeof import("@/app/api/topluluk/[id]/route");
    toplulukStore: typeof import("@/lib/toplulukStore");
    puan: typeof import("@/app/api/games/[code]/puan/route");
    libraryTopluluk: typeof import("@/app/api/library/[id]/topluluk/route");
    kredi: typeof import("@/app/api/kredi/route");
    toplulukOgretmenPuani: typeof import("@/app/api/topluluk/[id]/ogretmen-puani/route");
    krediStore: typeof import("@/lib/krediStore");
    inceleme: typeof import("@/app/api/topluluk/inceleme/route");
    incelemeOyun: typeof import("@/app/api/topluluk/inceleme/[id]/route");
    istatistikStore: typeof import("@/lib/istatistikStore");
    yzDenetim: typeof import("@/lib/composer/yzDenetimService");
    moderasyon: typeof import("@/app/api/moderasyon/route");
    moderasyonOge: typeof import("@/app/api/moderasyon/[id]/route");
    moderasyonStore: typeof import("@/lib/moderasyonStore");
    okul: typeof import("@/app/api/okul/route");
    okulKatil: typeof import("@/app/api/okul/katil/route");
    okulAyril: typeof import("@/app/api/okul/ayril/route");
    okulDavet: typeof import("@/app/api/okul/davet/route");
    okulPano: typeof import("@/app/api/okul/pano/route");
    okulUye: typeof import("@/app/api/okul/uyeler/[hesapId]/route");
    okulPaylasim: typeof import("@/app/api/okul/paylasim/route");
    okulPaylasimOge: typeof import("@/app/api/okul/paylasim/[id]/route");
    kopyaKaydi: typeof import("@/app/api/yonetim/kopya-kaydi/route");
    denetimKaydi: typeof import("@/lib/denetimKaydi");
    compose: typeof import("@/app/api/compose/route");
    composeGuncelle: typeof import("@/app/api/compose/guncelle/route");
    anthropic: typeof import("@/lib/composer/anthropic");
    composerService: typeof import("@/lib/composer/service");
    ogrenmeRapor: typeof import("@/app/api/yonetim/ogrenme/route");
    ogrenmeOneri: typeof import("@/app/api/yonetim/ogrenme/oneri/route");
    ogrenmeKarar: typeof import("@/app/api/yonetim/ogrenme/oneri/[id]/route");
    ogrenmeStore: typeof import("@/lib/ogrenmeStore");
    ogrenmeService: typeof import("@/lib/ogrenmeService");
    okulStore: typeof import("@/lib/okulStore");
    okulKredi: typeof import("@/app/api/okul/kredi/route");
    yonetimHavuzu: typeof import("@/app/api/yonetim/okul-havuzu/route");
    krediService: typeof import("@/lib/krediService");
    ogrenmeTakibi: typeof import("@/app/api/ogrenme-takibi/route");
    ogrenmeTakibiStore: typeof import("@/lib/ogrenmeTakibiStore");
  };
  await jest.isolateModulesAsync(async () => {
    mods = {
      games: await import("@/app/api/games/route"),
      game: await import("@/app/api/games/[code]/route"),
      end: await import("@/app/api/games/[code]/end/route"),
      join: await import("@/app/api/games/[code]/join/route"),
      results: await import("@/app/api/results/route"),
      library: await import("@/app/api/library/route"),
      libraryItem: await import("@/app/api/library/[id]/route"),
      libraryPublish: await import("@/app/api/library/[id]/publish/route"),
      libraryStore: await import("@/lib/libraryStore"),
      gamesStore: await import("@/lib/gamesStore"),
      libraryService: await import("@/lib/libraryService"),
      libraryTasi: await import("@/app/api/library/tasi/route"),
      kayit: await import("@/app/api/auth/kayit/route"),
      giris: await import("@/app/api/auth/giris/route"),
      cikis: await import("@/app/api/auth/cikis/route"),
      ben: await import("@/app/api/auth/ben/route"),
      sifre: await import("@/app/api/auth/sifre/route"),
      ad: await import("@/app/api/auth/ad/route"),
      authStore: await import("@/lib/authStore"),
      topluluk: await import("@/app/api/topluluk/route"),
      toplulukOyun: await import("@/app/api/topluluk/[id]/route"),
      toplulukStore: await import("@/lib/toplulukStore"),
      puan: await import("@/app/api/games/[code]/puan/route"),
      libraryTopluluk: await import("@/app/api/library/[id]/topluluk/route"),
      kredi: await import("@/app/api/kredi/route"),
      toplulukOgretmenPuani: await import("@/app/api/topluluk/[id]/ogretmen-puani/route"),
      krediStore: await import("@/lib/krediStore"),
      inceleme: await import("@/app/api/topluluk/inceleme/route"),
      incelemeOyun: await import("@/app/api/topluluk/inceleme/[id]/route"),
      istatistikStore: await import("@/lib/istatistikStore"),
      yzDenetim: await import("@/lib/composer/yzDenetimService"),
      moderasyon: await import("@/app/api/moderasyon/route"),
      moderasyonOge: await import("@/app/api/moderasyon/[id]/route"),
      moderasyonStore: await import("@/lib/moderasyonStore"),
      okul: await import("@/app/api/okul/route"),
      okulKatil: await import("@/app/api/okul/katil/route"),
      okulAyril: await import("@/app/api/okul/ayril/route"),
      okulDavet: await import("@/app/api/okul/davet/route"),
      okulPano: await import("@/app/api/okul/pano/route"),
      okulUye: await import("@/app/api/okul/uyeler/[hesapId]/route"),
      okulPaylasim: await import("@/app/api/okul/paylasim/route"),
      okulPaylasimOge: await import("@/app/api/okul/paylasim/[id]/route"),
      kopyaKaydi: await import("@/app/api/yonetim/kopya-kaydi/route"),
      denetimKaydi: await import("@/lib/denetimKaydi"),
      compose: await import("@/app/api/compose/route"),
      composeGuncelle: await import("@/app/api/compose/guncelle/route"),
      anthropic: await import("@/lib/composer/anthropic"),
      composerService: await import("@/lib/composer/service"),
      ogrenmeRapor: await import("@/app/api/yonetim/ogrenme/route"),
      ogrenmeOneri: await import("@/app/api/yonetim/ogrenme/oneri/route"),
      ogrenmeKarar: await import("@/app/api/yonetim/ogrenme/oneri/[id]/route"),
      ogrenmeStore: await import("@/lib/ogrenmeStore"),
      ogrenmeService: await import("@/lib/ogrenmeService"),
      okulStore: await import("@/lib/okulStore"),
      okulKredi: await import("@/app/api/okul/kredi/route"),
      yonetimHavuzu: await import("@/app/api/yonetim/okul-havuzu/route"),
      krediService: await import("@/lib/krediService"),
      ogrenmeTakibi: await import("@/app/api/ogrenme-takibi/route"),
      ogrenmeTakibiStore: await import("@/lib/ogrenmeTakibiStore"),
    };
  });
  return {
    ...mods,
    params: (code: string) => ({ params: Promise.resolve({ code }) }),
    idParams: (id: string) => ({ params: Promise.resolve({ id }) }),
  };
}

export function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function samplePublish(overrides: Record<string, unknown> = {}) {
  return {
    durationMinutes: 60,
    aylar: ["eylul"],
    stops: [0, 1, 2].map((i) => defaultGameStop(i)),
    ...overrides,
  };
}

// Set-Cookie başlığından "ad=değer" çifti (Cookie başlığında gönderilecek biçim).
export function oturumCerezi(res: Response): string | null {
  const c = res.headers.get("set-cookie");
  return c ? c.split(";")[0] : null;
}

export function cerezli(req: Request, cerez: string | null): Request {
  if (cerez) req.headers.set("cookie", cerez);
  return req;
}

// Yeni hesap açar ve oturum çerezini döndürür.
export async function hesapAc(api: Awaited<ReturnType<typeof buildApi>>, kullaniciAdi: string, sifre = "gizli-sifre-1"): Promise<string> {
  const res = await api.kayit.POST(jsonRequest("/api/auth/kayit", { kullaniciAdi, sifre, kosulOnayi: true }));
  if (res.status !== 201) throw new Error(`hesap açılamadı: ${res.status}`);
  return oturumCerezi(res)!;
}

// Öğrenci oyuna katılır ve oyunu bitirip sonucunu gönderir; oyuncu anahtarını döndürür.
// cerez verilirse sonuç o oturumla gönderilir (ör. öğretmenin kendi oyununu oynaması).
export async function katilVeBitir(api: Awaited<ReturnType<typeof buildApi>>, kod: string, nickname: string, cerez: string | null = null): Promise<string> {
  const katil = await api.join.POST(jsonRequest("/join", { nickname }), api.params(kod));
  if (katil.status !== 201) throw new Error(`katılım başarısız: ${katil.status}`);
  const playerToken = (await katil.json()).playerToken as string;
  const sonuc = { nickname, netSeconds: 540, penaltySeconds: 0, hintsUsed: 0, completedAt: 1_790_000_000_000 };
  const res = await api.results.POST(cerezli(jsonRequest("/api/results", { gameCode: kod, playerToken, result: sonuc }), cerez));
  if (res.status !== 201) throw new Error(`sonuç kaydedilemedi: ${res.status}`);
  return playerToken;
}

// Topluluğa doğrudan yayında bir kayıt koyar (paylaşım ve inceleme akışını beklemeden liste/filtre testleri için).
export async function toplulugaKoy(
  api: Awaited<ReturnType<typeof buildApi>>,
  definition: GameDefinition,
  dersler: { ders: string; konuId: string }[],
  { olusturan = "hesap:ornek", yayinTarihi = Date.now() }: { olusturan?: string; yayinTarihi?: number } = {}
): Promise<string> {
  const kayit = yeniToplulukKaydi(definition, dersler as DersKonu[], olusturan, yayinTarihi, { durum: "yayinda", aktif: true });
  return api.toplulukStore.getToplulukStore().ekle(kayit, icerikOzetiOf(definition));
}

// Topluluk listesi yalnız öğretmene açık: testler listeyi ayrı bir izleyici öğretmen hesabıyla okur (api başına bir kez açılır).
const izleyiciler = new WeakMap<object, string>();
export async function toplulukListesi(api: Awaited<ReturnType<typeof buildApi>>, qs = ""): Promise<Response> {
  let c = izleyiciler.get(api);
  if (!c) {
    c = await hesapAc(api, "liste_izleyici");
    izleyiciler.set(api, c);
  }
  return api.topluluk.GET(cerezli(new Request(`http://localhost/api/topluluk${qs ? "?" + qs : ""}`), c));
}

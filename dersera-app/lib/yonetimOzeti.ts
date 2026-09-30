import type { AuthStore } from "@/lib/authStore";
import { ayOf } from "@/lib/kredi";
import type { ModerasyonStore } from "@/lib/moderasyonStore";
import { raporHesapla } from "@/lib/ogrenme";
import type { OgrenmeStore } from "@/lib/ogrenmeStore";
import type { OkulStore } from "@/lib/okulStore";
import type { ToplulukStore } from "@/lib/toplulukStore";

// Platform yöneticisinin genel bakışı: özet sayılar ve yapılandırma sağlığı. Yalnız okur; sayılar taramayla bulunur
// (sayfa açıldığında bir kez). Ortam değişkenlerinin değeri değil yalnız tanımlı olup olmadığı döner.

export interface YonetimDeps {
  auth: AuthStore;
  okul: OkulStore;
  topluluk: ToplulukStore;
  moderasyon: ModerasyonStore;
  ogrenme: OgrenmeStore;
}

// Kuyruk sınırlarından büyük sayılır: tam sayı gerekmez, "çok" görünmesi yeter.
const KUYRUK_OKUMA = 1000;

export const SAGLIK_DEGISKENLERI = {
  yapayZeka: ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"],
  gorselDepo: ["BLOB_READ_WRITE_TOKEN"],
  yedekAnahtari: ["YEDEK_ANAHTARI"],
  zamanlayici: ["CRON_SECRET"],
  davetKodu: ["KAYIT_DAVET_KODU"],
  epostaAnahtari: ["RESEND_API_KEY"],
  epostaGonderen: ["EPOSTA_GONDEREN"],
  siteAdresi: ["DERSERA_SITE_ADRESI"],
} as const;

export type Saglik = { kaliciDepo: boolean } & Record<keyof typeof SAGLIK_DEGISKENLERI, boolean>;

export function saglikOf(env: Record<string, string | undefined>, kaliciDepo: boolean): Saglik {
  const tanimli = (adlar: readonly string[]) => adlar.some((a) => !!env[a]?.trim());
  const out = { kaliciDepo } as Saglik;
  for (const [k, adlar] of Object.entries(SAGLIK_DEGISKENLERI)) out[k as keyof typeof SAGLIK_DEGISKENLERI] = tanimli(adlar);
  return out;
}

export async function yonetimOzeti(d: YonetimDeps, env: Record<string, string | undefined>, now = Date.now()) {
  const ay = ayOf(now);
  const [ogretmen, okul, toplulukYayinda, inceleme, moderasyon, sayaclar] = await Promise.all([
    d.auth.hesapSayisi(),
    d.okul.okulSayisi(),
    d.topluluk.yayindaSayisi(),
    d.topluluk.kuyruk(KUYRUK_OKUMA),
    d.moderasyon.liste("bekliyor", KUYRUK_OKUMA),
    d.ogrenme.sayaclar(ay),
  ]);
  const rapor = raporHesapla(ay, sayaclar);
  return {
    ay,
    sayilar: {
      ogretmen,
      okul,
      toplulukYayinda,
      toplulukInceleme: inceleme.length,
      moderasyonBekleyen: moderasyon.length,
      buAyUretim: rapor.toplam.uretim,
      buAyDeneme: rapor.toplam.deneme,
    },
    saglik: saglikOf(env, d.auth.persistent),
  };
}

export type YonetimOzeti = Awaited<ReturnType<typeof yonetimOzeti>>;

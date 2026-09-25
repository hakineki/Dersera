import { NextResponse } from "next/server";
import { parseComposerDefinition } from "@/lib/composer/adapter";
import { ComposeError } from "@/lib/composer/errors";
import { GuncellemeIstegiSchema } from "@/lib/composer/guncelleme";
import { parseComposeInput } from "@/lib/composer/input";
import { checkComposeLimit, clientIp, LimiterUnavailableError } from "@/lib/composer/rateLimit";
import { GUNCELLEME_SURE_MS, yapayZekaylaGuncelle } from "@/lib/composer/service";
import type { YzDenetim } from "@/lib/composer/yzDenetim";
import { YZ_DENETIM, yzDenetle } from "@/lib/composer/yzDenetimService";
import { istekHesabi, kokenReddi, oturumGerekli } from "@/lib/authRequest";
import { KREDI_KURALLARI } from "@/lib/kredi";
import { krediDurumu, krediHarca, krediIade, krediTamamla, type Harcama } from "@/lib/krediService";
import { yzGuncellemeSinyali } from "@/lib/ogrenmeService";

// Güncelleme en çok ~100 sn, ardından kalan süreyle çocuk güvenliği denetimi.
export const maxDuration = 150;

const GENEL_HATA = "Oyun şu anda güncellenemedi. Tekrar deneyin.";
const DENETIM_SONU_MS = (maxDuration - 8) * 1000;
const DENETIM_EN_AZ_MS = 8_000;

// Yapay zekâyla güncelleme (lib/composer/guncelleme.ts): oturum, oran sınırı ve 1 kredi. Kredi çağrıdan önce atomik
// olarak düşer; güncelleme yapılamazsa iade edilir.
export async function POST(req: Request) {
  const basla = Date.now();
  const koken = kokenReddi(req);
  if (koken) return koken;
  const hesap = await istekHesabi(req);
  if (!hesap) return oturumGerekli();

  const body = await req.json().catch(() => null);
  const istek = GuncellemeIstegiSchema.safeParse(body);
  if (!istek.success) return NextResponse.json({ error: "Geçersiz istek: 1-3 durak seçin ve talimatı yazın." }, { status: 422 });
  const { dersler, talimat } = istek.data;
  const idler = [...new Set(istek.data.duraklar)];

  const tanim = parseComposerDefinition(istek.data.definition, dersler);
  if (!tanim.ok) return NextResponse.json({ error: tanim.error }, { status: tanim.status });
  const def = tanim.definition;
  if (idler.some((id) => !def.duraklar.some((d) => d.id === id))) return NextResponse.json({ error: "Seçilen durak oyunda yok." }, { status: 422 });
  const girdi = parseComposeInput({ sinif: def.meta.sinif, dersler, sure: def.meta.sure_dk, deneyim: def.meta.deneyim, alan: def.meta.alan });
  if (!girdi.ok) return NextResponse.json({ error: girdi.error }, { status: 422 });

  try {
    if (!(await checkComposeLimit(clientIp(req)))) {
      return NextResponse.json({ error: "Bu saat için yapay zekâ kullanım sınırına ulaşıldı. Bir sonraki saat başında tekrar deneyin." }, { status: 429 });
    }
  } catch (err) {
    console.error("[guncelle] oran sınırı denetlenemedi", err instanceof Error ? err.message : err);
    if (err instanceof LimiterUnavailableError) return NextResponse.json({ error: "Oyun oluşturucu yapılandırılmamış. Yöneticinize bildirin." }, { status: 503 });
    return NextResponse.json({ error: GENEL_HATA }, { status: 503 });
  }

  let harcama: Harcama | null;
  try {
    harcama = await krediHarca(hesap.id, KREDI_KURALLARI.guncelleme, `Oyun güncelleme: ${def.meta.baslik.slice(0, 60)}`);
  } catch (err) {
    console.error("[guncelle] kredi okunamadı", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: GENEL_HATA }, { status: 503 });
  }
  if (!harcama) {
    const kredi = await krediDurumu(hesap.id).catch(() => null);
    return NextResponse.json({ error: `Güncelleme ${KREDI_KURALLARI.guncelleme} kredi; bakiyen yetmiyor. Aylık hakkın ay başında yenilenir.`, kredi }, { status: 402 });
  }

  try {
    const { definition, validation, guncellenen } = await yapayZekaylaGuncelle(def, girdi.input, idler, talimat, undefined, GUNCELLEME_SURE_MS);
    await krediTamamla(hesap.id, harcama);
    const kalan = Math.min(DENETIM_SONU_MS - (Date.now() - basla), YZ_DENETIM.sureMs);
    const guvenlik: YzDenetim = !validation.gecerli || kalan < DENETIM_EN_AZ_MS ? { durum: "bekliyor" } : await yzDenetle(definition, { timeoutMs: kalan });
    // Sayaç güncellenmiş tanımdaki görev türüne yazılır (model türü değiştirebilir).
    await yzGuncellemeSinyali(definition, guncellenen, talimat);
    return NextResponse.json({ kredi: await krediDurumu(hesap.id).catch(() => null), definition, validation, guvenlik, guncellenen });
  } catch (err) {
    const iadeEdildi = await krediIade(hesap.id, harcama, "Oyun güncellenemedi: kredi iadesi");
    const ek = iadeEdildi ? {} : { krediNotu: "Kredin birkaç dakika içinde otomatik olarak iade edilecek." };
    const hata = (mesaj: string) => (iadeEdildi ? mesaj : `${mesaj} ${ek.krediNotu}`);
    if (err instanceof ComposeError) {
      console.error(`[guncelle] ${err.reason}: ${err.message}`);
      if (err.reason === "config") return NextResponse.json({ error: hata("Oyun oluşturucu yapılandırılmamış. Yöneticinize bildirin."), ...ek }, { status: 503 });
      if (err.reason === "timeout") return NextResponse.json({ error: hata(GENEL_HATA), timeout: true, ...ek }, { status: 504 });
    } else {
      console.error("[guncelle] beklenmeyen hata", err instanceof Error ? err.message : err);
    }
    return NextResponse.json({ error: hata(GENEL_HATA), kredi: await krediDurumu(hesap.id).catch(() => null), ...ek }, { status: 502 });
  }
}

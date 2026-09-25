import { NextResponse } from "next/server";
import { parseComposerPublish } from "@/lib/composer/adapter";
import { parsePublishRequest, type PublishRequest } from "@/lib/games";
import { getGamesStore } from "@/lib/gamesStore";
import { publishGame } from "@/lib/gamesService";
import { istekSahibi } from "@/lib/libraryService";
import { isKutuphaneId } from "@/lib/library";
import { getLibraryStore } from "@/lib/libraryStore";
import { toplulukKodunuBagla } from "@/lib/toplulukService";
import { kodKaynagaBagla } from "@/lib/istatistikService";
import type { DersKonu } from "@/lib/composer/input";
import { klasikDurakEngelleri, type YonetisimSonucu } from "@/lib/composer/yonetisim";
import { clientIp } from "@/lib/composer/rateLimit";
import { yzDenetle } from "@/lib/composer/yzDenetimService";
import { moderasyonaEkle } from "@/lib/moderasyonService";

// Önbellekte olmayan içerik için yapay zekâ denetimi (en çok ~25 sn) yayından önce yapılır.
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  let request: PublishRequest | null;
  let dersler: DersKonu[] | null = null;
  let yonetisim: YonetisimSonucu | undefined;
  if (body && typeof body === "object" && "composer" in body) {
    // Uç nokta oturumsuzdur: önbellekte olmayan içeriğin ücretli denetimi IP ve günlük sınırla korunur.
    const composed = await parseComposerPublish(body, (def) => yzDenetle(def, { sinirAnahtari: `ip:${clientIp(req)}` }));
    if (!composed.ok) {
      // İçerik kapısı engeli yöneticinin kuyruğuna (bilgi); doğrulama hatası (bozuk oyun) girmez.
      if (composed.yonetisim && composed.definition) {
        await moderasyonaEkle({ tur: "engellenen", yonetisim: composed.yonetisim, definition: composed.definition, sahip: await istekSahibi(req).catch(() => null), ip: clientIp(req) });
      }
      return NextResponse.json(
        { error: composed.error, validation: composed.validation, yonetisim: composed.yonetisim, ...(composed.guvenlik && { guvenlik: composed.guvenlik }) },
        { status: composed.status }
      );
    }
    request = composed.request;
    dersler = composed.dersler;
    yonetisim = composed.yonetisim;
  } else {
    request = parsePublishRequest(body);
  }
  if (!request) {
    return NextResponse.json({ error: "Geçersiz oyun ayarları" }, { status: 422 });
  }
  // Klasik oyunda da öğrenciye gösterilen serbest metinler yönetişimi atlayamaz.
  if (!request.definition) {
    const engeller = klasikDurakEngelleri(request.stops);
    if (engeller.length) {
      await moderasyonaEkle({ tur: "engellenen", klasik: { stops: request.stops, bulgular: engeller }, sahip: null, ip: clientIp(req) });
      return NextResponse.json({ error: "Oyun içerik denetiminden geçmedi; yayınlanamaz", bulgular: engeller }, { status: 422 });
    }
  }

  try {
    const store = getGamesStore();
    // Composer oyununu oturumla yayınlayan öğretmen: kütüphane, topluluk ve öğrenme takibi bağları.
    const sahip = request.definition && dersler ? await istekSahibi(req) : null;
    const published = await publishGame(store, { ...request, sahip, dersler });
    if (!published) {
      return NextResponse.json({ error: "Benzersiz oyun kodu üretilemedi" }, { status: 503 });
    }
    if (request.definition && dersler) {
      const kaynak = await kutuphaneKaynagi(body, sahip);
      await kodKaynagaBagla(published.game.code, kaynak, published.game.expiresAt);
      await toplulukKodunuBagla(request.definition, published.game.code, published.game.expiresAt, Date.now(), sahip);
      if (yonetisim) await moderasyonaEkle({ tur: "sinif-yayini", yonetisim, definition: request.definition, kod: published.game.code, sahip, ip: clientIp(req) });
    }
    return NextResponse.json({ ...published, persistent: store.persistent, ...(yonetisim && { yonetisim }) }, { status: 201 });
  } catch (err) {
    console.error("[games] yayınlama hatası", err);
    return NextResponse.json({ error: "Oyun yayınlanamadı" }, { status: 503 });
  }
}

// Composer'da kütüphane oyunu yayınlanıyorsa (düzenleme sonrası) topluluktaki eski sürümü değiştirmek için kaynak.
// Kütüphane kaydı yalnız istekteki oturumun sahibine aitse kabul edilir.
async function kutuphaneKaynagi(body: unknown, sahip: string | null): Promise<string | undefined> {
  const id = (body as { kutuphaneId?: unknown }).kutuphaneId;
  if (!sahip || !isKutuphaneId(id)) return undefined;
  try {
    return (await getLibraryStore().get(sahip, id)) ? `${sahip}:${id}` : undefined;
  } catch {
    return undefined;
  }
}

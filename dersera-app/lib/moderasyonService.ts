import { createHash, randomUUID } from "crypto";
import type { GameDefinition } from "@/lib/composer/definition";
import type { Bulgu, YonetisimSonucu } from "@/lib/composer/yonetisim";
import { checkLimit } from "@/lib/composer/rateLimit";
import type { GamesStore } from "@/lib/gamesStore";
import {
  bulgulariOf,
  klasikBulgulari,
  MODERASYON,
  moderasyonGerekli,
  type ModerasyonKarari,
  type ModerasyonKaydi,
  type ModerasyonTuru,
} from "@/lib/moderasyon";
import { getModerasyonStore, type ModerasyonStore } from "@/lib/moderasyonStore";
import { durumOf } from "@/lib/topluluk";
import { icerikOzetiOf } from "@/lib/toplulukService";
import type { ToplulukStore } from "@/lib/toplulukStore";

export type ModerasyonGirdisi = {
  tur: ModerasyonTuru;
  sahip: string | null;
  // Oturumsuz yayın uç noktasında IP sınırı için.
  ip?: string;
  kod?: string;
  toplulukId?: string;
  now?: number;
} & ({ yonetisim: YonetisimSonucu; definition: GameDefinition } | { klasik: { stops: { name: string; hikaye: string }[]; bulgular: Bulgu[] } });

// Yayın akışını hiçbir zaman durdurmaz: yazılamazsa loglanır. Tekillik: aynı sınıf oyunu (kod), aynı topluluk kaydı
// ya da (engellenen için) aynı içerik kuyruğa bir kez girer.
export async function moderasyonaEkle(g: ModerasyonGirdisi, store: ModerasyonStore = getModerasyonStore()): Promise<boolean> {
  try {
    const now = g.now ?? Date.now();
    let ozet: string;
    let kayit: Omit<ModerasyonKaydi, "id" | "tur" | "tarih" | "sahip" | "durum">;
    if ("yonetisim" in g) {
      if (!moderasyonGerekli(g.yonetisim)) return false;
      const m = g.definition.meta;
      ozet = icerikOzetiOf(g.definition);
      kayit = { karar: g.yonetisim.karar === "BLOCK" ? "BLOCK" : "REVIEW", baslik: m.baslik, sinif: m.sinif, ders: m.ders, bulgular: bulgulariOf(g.yonetisim), definition: g.definition };
    } else {
      if (g.klasik.bulgular.length === 0) return false;
      ozet = createHash("sha256").update(JSON.stringify(g.klasik.stops.map((s) => [s.name, s.hikaye]))).digest("hex");
      kayit = { karar: "BLOCK", baslik: g.klasik.stops[0]?.name ?? "Klasik oyun", sinif: null, ders: "Klasik oyun", bulgular: klasikBulgulari(g.klasik.bulgular) };
    }
    const tekil = g.tur === "sinif-yayini" ? `kod:${g.kod}` : g.tur === "topluluk" ? `topluluk:${g.toplulukId}` : `icerik:${ozet}`;
    if (g.ip && !(await checkLimit(`moderasyon:ip:${g.ip}`, 60 * 60 * 1000, MODERASYON.ipSaatlik))) return false;
    return await store.ekle(
      { id: randomUUID(), tur: g.tur, tarih: now, sahip: g.sahip, durum: "bekliyor", ...(g.kod && { kod: g.kod }), ...(g.toplulukId && { toplulukId: g.toplulukId }), ...kayit },
      `${g.tur}:${tekil}`
    );
  } catch (err) {
    console.error("[moderasyon] kuyruğa yazılamadı", err instanceof Error ? err.message : err);
    return false;
  }
}

type KararSonucu = { ok: true; kayit: ModerasyonKaydi } | { ok: false; status: number; error: string };

// Önce eylem (tekrarlanabilir: oyunu bitirme, topluluktan reddetme), sonra kayıt atomik olarak kapatılır.
// İki yönetici aynı anda karar verirse eylem yine bir kez etkili olur, ikinci karar 409 alır.
export async function moderasyonKarari(
  id: string,
  karar: ModerasyonKarari,
  not: string,
  yonetici: string,
  deps: { store?: ModerasyonStore; games: GamesStore; topluluk: ToplulukStore },
  now = Date.now()
): Promise<KararSonucu> {
  const store = deps.store ?? getModerasyonStore();
  const kayit = await store.get(id);
  if (!kayit) return { ok: false, status: 404, error: "Kayıt bulunamadı." };
  if (kayit.durum !== "bekliyor") return { ok: false, status: 409, error: "Bu kayıt için zaten karar verilmiş." };
  if (karar === "kaldir") {
    if (kayit.tur === "engellenen") return { ok: false, status: 422, error: "Engellenen içerik zaten yayında değil." };
    if (kayit.tur === "sinif-yayini" && kayit.kod) {
      const oyun = await deps.games.get(kayit.kod);
      if (oyun && oyun.endedAt === null) await deps.games.put({ ...oyun, endedAt: now }, now);
    }
    if (kayit.tur === "topluluk" && kayit.toplulukId) {
      const t = await deps.topluluk.get(kayit.toplulukId);
      if (t) {
        const d = durumOf(t);
        if (d === "inceleme" || d === "yayinda") await deps.topluluk.durumGecis(t.oyun_id, ["inceleme", "yayinda"], "reddedildi", d);
        await deps.topluluk.kuyruktanCikar(t.oyun_id);
      }
    }
  }
  const kapali = await store.kapat(id, { karar, not: not.trim().slice(0, MODERASYON.notEnCok), yonetici, tarih: now });
  if (!kapali) return { ok: false, status: 409, error: "Bu kayıt için zaten karar verilmiş." };
  return { ok: true, kayit: kapali };
}

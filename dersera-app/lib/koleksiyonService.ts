import { randomUUID } from "crypto";
import type { Hesap } from "@/lib/authStore";
import { KOLEKSIYON, KOLEKSIYON_ID, koleksiyonAdi, type Koleksiyon } from "@/lib/koleksiyon";
import type { KoleksiyonStore } from "@/lib/koleksiyonStore";
import type { ToplulukOzeti } from "@/lib/topluluk";
import type { ToplulukStore } from "@/lib/toplulukStore";

// Öğretmen koleksiyonları (kurallar lib/koleksiyon.ts). Yalnız hesabın kendi koleksiyonlarına erişilir.

export type KoleksiyonSonucu<T extends object = object> = ({ ok: true } & T) | { ok: false; status: number; error: string };
export interface KoleksiyonDeps {
  koleksiyon: KoleksiyonStore;
  topluluk: ToplulukStore;
}

const YOK = { ok: false as const, status: 404, error: "Koleksiyon bulunamadı." };
const AD_HATASI = { ok: false as const, status: 422, error: `Koleksiyon adı ${KOLEKSIYON.adEnAz}–${KOLEKSIYON.adEnCok} karakter olmalı.` };
const OYUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function koleksiyonlarim(d: KoleksiyonDeps, hesap: Hesap): Promise<KoleksiyonSonucu<{ koleksiyonlar: Koleksiyon[] }>> {
  return { ok: true, koleksiyonlar: await d.koleksiyon.listele(hesap.id) };
}

// Koleksiyonun oyunları özetleriyle; topluluktan kalkmış oyun kaldirildi: true ile döner (öğretmen çıkarabilsin).
export async function koleksiyonDetayi(
  d: KoleksiyonDeps,
  hesap: Hesap,
  id: string
): Promise<KoleksiyonSonucu<{ koleksiyon: Koleksiyon; oyunlar: (ToplulukOzeti | { oyun_id: string; kaldirildi: true })[] }>> {
  const k = KOLEKSIYON_ID.test(id) ? (await d.koleksiyon.listele(hesap.id)).find((x) => x.id === id) : undefined;
  if (!k) return YOK;
  const ozetler = await d.topluluk.ozetleriOku(k.oyunlar);
  const oyunlar = k.oyunlar.map((oyunId, i) => {
    const o = ozetler.at(i);
    return o && o.aktif ? o : { oyun_id: oyunId, kaldirildi: true as const };
  });
  return { ok: true, koleksiyon: k, oyunlar };
}

export async function koleksiyonOlustur(d: KoleksiyonDeps, hesap: Hesap, body: unknown, now = Date.now()): Promise<KoleksiyonSonucu<{ koleksiyon: Koleksiyon }>> {
  const ad = koleksiyonAdi((body as { ad?: unknown } | null)?.ad);
  if (!ad) return AD_HATASI;
  const bilgi = { id: randomUUID(), ad, olusturma: now };
  if (!(await d.koleksiyon.olustur(hesap.id, bilgi))) return { ok: false, status: 409, error: `En çok ${KOLEKSIYON.enCok} koleksiyon oluşturabilirsin.` };
  return { ok: true, koleksiyon: { ...bilgi, oyunlar: [] } };
}

export async function koleksiyonAdDegistir(d: KoleksiyonDeps, hesap: Hesap, id: string, body: unknown): Promise<KoleksiyonSonucu> {
  if (!KOLEKSIYON_ID.test(id)) return YOK;
  const ad = koleksiyonAdi((body as { ad?: unknown } | null)?.ad);
  if (!ad) return AD_HATASI;
  return (await d.koleksiyon.adDegistir(hesap.id, id, ad)) ? { ok: true } : YOK;
}

// Yalnız öğretmenin listesi silinir; oyunlar toplulukta kalır.
export async function koleksiyonSil(d: KoleksiyonDeps, hesap: Hesap, id: string): Promise<KoleksiyonSonucu> {
  if (!KOLEKSIYON_ID.test(id)) return YOK;
  return (await d.koleksiyon.sil(hesap.id, id)) ? { ok: true } : YOK;
}

// Yalnız toplulukta yayındaki oyun eklenir.
export async function koleksiyonaEkle(d: KoleksiyonDeps, hesap: Hesap, id: string, body: unknown, now = Date.now()): Promise<KoleksiyonSonucu> {
  if (!KOLEKSIYON_ID.test(id)) return YOK;
  const oyunId = (body as { oyunId?: unknown } | null)?.oyunId;
  if (typeof oyunId !== "string" || !OYUN_ID.test(oyunId)) return { ok: false, status: 422, error: "Geçersiz oyun." };
  const [ozet] = await d.topluluk.ozetleriOku([oyunId]);
  if (!ozet?.aktif) return { ok: false, status: 404, error: "Oyun toplulukta bulunamadı." };
  const r = await d.koleksiyon.oyunEkle(hesap.id, id, oyunId, now);
  if (r === "yok") return YOK;
  if (r === "dolu") return { ok: false, status: 409, error: `Bir koleksiyonda en çok ${KOLEKSIYON.oyunEnCok} oyun olabilir.` };
  return { ok: true };
}

export async function koleksiyondanCikar(d: KoleksiyonDeps, hesap: Hesap, id: string, oyunId: string): Promise<KoleksiyonSonucu> {
  if (!KOLEKSIYON_ID.test(id) || !OYUN_ID.test(oyunId)) return YOK;
  return (await d.koleksiyon.oyunCikar(hesap.id, id, oyunId)) ? { ok: true } : YOK;
}

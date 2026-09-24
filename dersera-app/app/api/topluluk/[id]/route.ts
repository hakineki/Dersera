import { NextResponse } from "next/server";
import { istekHesabi, oturumGerekli } from "@/lib/authRequest";
import { getToplulukStore } from "@/lib/toplulukStore";
import { kullanimDetayi } from "@/lib/toplulukService";
import { cocukGuvenligiTara } from "@/lib/composer/cocukGuvenligi";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// "Oyunu Kullan": tam oyun (cevaplar dahil) yalnız öğretmen oturumuyla verilir; öğrenci cevapları buradan göremez.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await istekHesabi(req))) return oturumGerekli();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Oyun bulunamadı" }, { status: 404 });
  try {
    const store = getToplulukStore();
    const kayit = await store.get(id);
    if (!kayit || !kayit.aktif) return NextResponse.json({ error: "Oyun bulunamadı" }, { status: 404 });
    // Yönetişimden önce eklenmiş (ya da engelleme listesi sonradan genişlemiş) kayıt engelleyen ifade içeriyorsa
    // verilmez ve listeden kaldırılır. Kasıtlı yan etki: pasife alma sahibinin yeni sürüm yayınıyla geri açılabilir.
    if (cocukGuvenligiTara(kayit.definition).some((e) => e.engel)) {
      await store.pasiflestir(id).catch((err) => console.error("[topluluk] pasife alınamadı", err instanceof Error ? err.message : err));
      return NextResponse.json({ error: "Oyun bulunamadı" }, { status: 404 });
    }
    return NextResponse.json(kullanimDetayi(kayit), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[topluluk] okunamadı", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Oyun okunamadı" }, { status: 503 });
  }
}

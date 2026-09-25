import { okulIslemi } from "@/lib/okulIstek";
import { okulPaylasimDetayi, okulPaylasimKaldir } from "@/lib/okulService";
import { kopyaKaydet } from "@/lib/denetimKaydi";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// "Kullan": tam oyun yalnız aynı okulun üyesine (composer'da kopya olarak açılır).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return okulIslemi(req, async (hesap, d) => {
    if (!UUID.test(id)) return { ok: false as const, status: 404, error: "Oyun bulunamadı." };
    const r = await okulPaylasimDetayi(d, hesap, id);
    if (!r.ok) return r;
    // Başkasının paylaştığı oyunun tam içeriğinin açılması kayda geçer (sızan içeriğin kaynağı bulunabilsin).
    const { kendiPaylasimi, ...cevap } = r;
    if (!kendiPaylasimi) await kopyaKaydet({ tarih: Date.now(), hesapId: hesap.id, kullaniciAdi: hesap.kullaniciAdi, tur: "okul", oyunId: id, baslik: r.oyun.baslik });
    return cevap;
  });
}

// Paylaşımı kaldır: paylaşan öğretmen ya da okul yöneticisi.
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return okulIslemi(req, async (hesap, d) => (UUID.test(id) ? okulPaylasimKaldir(d, hesap, id) : { ok: false as const, status: 404, error: "Oyun bulunamadı." }), { yazma: true, govdesiz: true });
}

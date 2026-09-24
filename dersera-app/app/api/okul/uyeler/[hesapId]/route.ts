import { okulIslemi } from "@/lib/okulIstek";
import { uyeCikar } from "@/lib/okulService";

const HESAP_ID = /^[0-9a-f]{24}$/;

// Okul yöneticisi öğretmeni okuldan çıkarır.
export async function DELETE(req: Request, ctx: { params: Promise<{ hesapId: string }> }) {
  const { hesapId } = await ctx.params;
  return okulIslemi(
    req,
    async (hesap, d) => (HESAP_ID.test(hesapId) ? uyeCikar(d, hesap, hesapId) : { ok: false as const, status: 404, error: "Bu öğretmen okulun üyesi değil." }),
    { yazma: true, govdesiz: true }
  );
}

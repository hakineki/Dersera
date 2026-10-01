"use client";

import type { GameDefinition } from "@/lib/composer/definition";

// Mekân rotası: öğretmenin QR kartlarını okulda nereye yapıştıracağı. Sıra QR numarasıdır; takımlar farklı kartlardan
// başladığı için dolaşma sırası değildir.
export default function YerlesimListesi({ def }: { def: GameDefinition }) {
  const satirlar = def.duraklar.flatMap((d) => (d.mekan.yer && d.mekan.qr_durak_id ? [{ id: d.id, qr: d.mekan.qr_durak_id.replace("qr-", ""), yer: d.mekan.yer }] : []));
  if (satirlar.length === 0) return null;
  return (
    <section aria-label="QR yerleşim listesi" className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-600">QR yerleşim listesi · oyun başlamadan kartları bu noktalara yapıştır</p>
        <button type="button" onClick={() => window.print()} className="text-xs font-semibold text-indigo-600 hover:underline print:hidden">
          Yazdır
        </button>
      </div>
      <ol>
        {satirlar.map((s) => (
          <li key={s.id} className="flex items-start gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0 text-sm">
            <span className="bg-[#3B2F9E] text-white text-xs font-bold rounded-md px-2 py-0.5 shrink-0">QR {s.qr}</span>
            <span className="flex-1">
              <span className="font-semibold text-gray-900">{s.yer.mekan_adi}</span>
              <span className="text-gray-600"> — {s.yer.nokta}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="px-4 py-2 text-[11px] text-gray-500 bg-gray-50">
        Okulunda bu nokta yoksa QR&apos;ı mekânın benzer ve kolay bulunur bir yerine yapıştır; öğrenci bilmeceden sonra iki ipucuyla yönlendirilir. Kartlar göz hizasında, kuru ve güvenli bir yerde olsun.
      </p>
    </section>
  );
}

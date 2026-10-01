"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import type { GameDefinition } from "@/lib/composer/definition";
import { yerlesimSatirlari } from "@/lib/composer/mekanRotasi";

// Baskı görünümü QR çizimini (qrcode) içerir; yalnız "Yazdır" basılınca yüklenir.
const YerlesimBaskisi = dynamic(() => import("./YerlesimBaskisi"), { ssr: false });

// Baskıda sayfanın yerine yalnız baskı görünümü basılsın (app/globals.css).
const BASKI_SINIFI = "yerlesim-baskida";

// Mekân rotası: öğretmenin QR kartlarını okulda nereye yapıştıracağı. Sıra QR numarasıdır; takımlar farklı kartlardan
// başladığı için dolaşma sırası değildir. "Yazdır" yerleşim listesini ve oyunun kartlarını (kesilecek yer şeridiyle) basar.
export default function YerlesimListesi({ def, kod }: { def: GameDefinition; kod?: string }) {
  const satirlar = yerlesimSatirlari(def);
  // Her "Yazdır" baskı görünümünü yeniden açar (çizilince yazdırma penceresi açılır); baskı bitince kapanır.
  const [baski, setBaski] = useState(0);
  const yazdir = useCallback(() => {
    document.documentElement.classList.add(BASKI_SINIFI);
    window.print();
  }, []);
  useEffect(() => {
    if (!baski) return;
    const bitti = () => {
      document.documentElement.classList.remove(BASKI_SINIFI);
      setBaski(0);
    };
    window.addEventListener("afterprint", bitti);
    return () => window.removeEventListener("afterprint", bitti);
  }, [baski]);
  useEffect(() => () => document.documentElement.classList.remove(BASKI_SINIFI), []);

  if (satirlar.length === 0) return null;
  return (
    <section aria-label="QR yerleşim listesi" className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-600">QR yerleşim listesi · oyun başlamadan kartları bu noktalara yapıştır</p>
        <button
          type="button"
          onClick={() => setBaski((n) => n + 1)}
          title="Yerleşim listesi ve bu oyunun QR kartları (A4)"
          className="shrink-0 text-xs font-semibold text-indigo-600 hover:underline print:hidden"
        >
          🖨 Yazdır
        </button>
      </div>
      <ol>
        {satirlar.map((s) => (
          <li key={s.durakId} className="flex items-start gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0 text-sm">
            <span className="bg-[#3B2F9E] text-white text-xs font-bold rounded-md px-2 py-0.5 shrink-0">QR {s.qr}</span>
            <span className="flex-1">
              <span className="font-semibold text-gray-900">{s.mekan}</span>
              <span className="text-gray-600"> — {s.nokta}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="px-4 py-2 text-[11px] text-gray-500 bg-gray-50">
        Okulunda bu nokta yoksa QR&apos;ı mekânın benzer ve kolay bulunur bir yerine yapıştır; öğrenci bilmeceden sonra iki ipucuyla yönlendirilir. Kartlar göz hizasında, kuru ve güvenli bir yerde olsun. &quot;Yazdır&quot; listeyi ve bu oyunun kartlarını (yapıştırma yeriyle) basar.
      </p>
      {baski > 0 && createPortal(<YerlesimBaskisi key={baski} baslik={def.meta.baslik} kod={kod} satirlar={satirlar} onHazir={yazdir} />, document.body)}
    </section>
  );
}

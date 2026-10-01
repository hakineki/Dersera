"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GameDefinition } from "@/lib/composer/definition";
import { yerlesimSatirlari } from "@/lib/composer/mekanRotasi";
import { sayfayiBas } from "@/lib/baski";

type BaskiBileseni = (typeof import("./YerlesimBaskisi"))["default"];

// Baskıda sayfanın yerine yalnız baskı görünümü basılsın (app/globals.css).
const BASKI_SINIFI = "yerlesim-baskida";

// Mekân rotası: öğretmenin QR kartlarını okulda nereye yapıştıracağı. Sıra QR numarasıdır; takımlar farklı kartlardan
// başladığı için dolaşma sırası değildir. "Yazdır" yerleşim listesini ve oyunun kartlarını (kesilecek yer şeridiyle) basar.
export default function YerlesimListesi({ def, kod }: { def: GameDefinition; kod?: string }) {
  const satirlar = yerlesimSatirlari(def);
  // Baskı görünümü QR çizimini (qrcode) içerir; ilk "Yazdır"da yüklenir. Yüklenemezse sayfa çökmez, uyarı görünür.
  const [Baski, setBaski] = useState<BaskiBileseni | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  // Her "Yazdır" baskı görünümünü yeniden açar (çizilince yazdırma penceresi açılır); baskı bitince kapanır.
  const [baskiNo, setBaskiNo] = useState(0);
  const iptal = useRef<(() => void) | null>(null);

  const yazdir = useCallback(() => {
    iptal.current?.();
    iptal.current = sayfayiBas(document.documentElement.classList, window, BASKI_SINIFI, () => setBaskiNo(0));
  }, []);
  useEffect(
    () => () => {
      iptal.current?.();
      document.documentElement.classList.remove(BASKI_SINIFI);
    },
    []
  );

  async function yazdirTikla() {
    setHata(null);
    if (!Baski) {
      setYukleniyor(true);
      try {
        const m = await import("./YerlesimBaskisi");
        setBaski(() => m.default);
      } catch {
        setHata("Yazdırma görünümü yüklenemedi; sayfayı yenileyip tekrar deneyin.");
        return;
      } finally {
        setYukleniyor(false);
      }
    }
    setBaskiNo((n) => n + 1);
  }

  if (satirlar.length === 0) return null;
  return (
    <section aria-label="QR yerleşim listesi" className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-600">QR yerleşim listesi · oyun başlamadan kartları bu noktalara yapıştır</p>
        <button
          type="button"
          onClick={yazdirTikla}
          disabled={yukleniyor}
          title="Yerleşim listesi ve bu oyunun QR kartları (A4)"
          className="shrink-0 text-xs font-semibold text-indigo-600 hover:underline disabled:text-gray-400 print:hidden"
        >
          <span aria-hidden="true">🖨 </span>
          {yukleniyor ? "Hazırlanıyor…" : "Yazdır"}
        </button>
      </div>
      {hata && (
        <p role="alert" className="px-4 py-2 text-xs text-red-600 border-b border-gray-100">
          {hata}
        </p>
      )}
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
      {baskiNo > 0 && Baski && createPortal(<Baski key={baskiNo} baslik={def.meta.baslik} kod={kod} satirlar={satirlar} onHazir={yazdir} />, document.body)}
    </section>
  );
}

"use client";

import { useEffect, useRef } from "react";
import QrCard from "@/components/QrCard";
import type { YerlesimSatiri } from "@/lib/composer/mekanRotasi";

const KART_SAYFA = 4;

export function sayfalaraBol<T>(liste: T[], boyut = KART_SAYFA): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < liste.length; i += boyut) out.push(liste.slice(i, i + boyut));
  return out;
}

// Mekân rotasının basılı çıktısı (A4): 1. sayfa yerleşim listesi, ardından oyunun QR kartları (sayfa başına 4, açık
// tasarım). Her kartın altında öğretmenin kesip atacağı "Buraya yapıştır" şeridi vardır; kart dağıtılırken karışmaz.
// Yalnız baskıda görünür (app/globals.css); çizildiğinde onHazir çağrılır ve yazdırma penceresi açılır.
export default function YerlesimBaskisi({ baslik, kod, satirlar, onHazir }: { baslik: string; kod?: string; satirlar: YerlesimSatiri[]; onHazir?: () => void }) {
  // Yazdırma penceresi bir kez açılır (StrictMode efekti iki kez çalıştırsa da).
  const acildi = useRef(false);
  useEffect(() => {
    if (acildi.current) return;
    acildi.current = true;
    onHazir?.();
  }, [onHazir]);

  return (
    <div id="yerlesim-baski" className="bg-white text-gray-900 [print-color-adjust:exact]">
      <section className="break-after-page">
        <p className="text-[10pt] font-bold tracking-widest text-[#3B2F9E]">DERSERA · QR YERLEŞİM LİSTESİ</p>
        <h1 className="text-[18pt] font-bold mt-1">{baslik}</h1>
        {kod && (
          <p className="text-[11pt] mt-1">
            Oyun kodu: <span className="font-bold tracking-wider">{kod}</span>
          </p>
        )}
        <p className="text-[10pt] text-gray-700 mt-3">
          Kartları oyundan önce aşağıdaki noktalara yapıştır. Numara sırası dolaşma sırası değildir: takımlar farklı kartlardan başlar. Kartlar göz
          hizasında ya da daha aşağıda, kuru ve güvenli bir yerde olsun. Okulunda nokta yoksa mekânın benzer, kolay bulunur bir yerini seç.
        </p>
        <table className="w-full mt-4 border-collapse text-[11pt]">
          <thead>
            <tr className="text-left text-[9pt] uppercase tracking-wide text-gray-600">
              <th scope="col" className="border border-gray-400 px-2 py-1.5 w-[16mm]">QR</th>
              <th scope="col" className="border border-gray-400 px-2 py-1.5">Mekân</th>
              <th scope="col" className="border border-gray-400 px-2 py-1.5">Nokta</th>
              <th scope="col" className="border border-gray-400 px-2 py-1.5 w-[24mm]">Yapıştırıldı</th>
            </tr>
          </thead>
          <tbody>
            {satirlar.map((s) => (
              <tr key={s.durakId} className="break-inside-avoid">
                <td className="border border-gray-400 px-2 py-2 font-bold">{s.qr}</td>
                <td className="border border-gray-400 px-2 py-2 font-semibold">{s.mekan}</td>
                <td className="border border-gray-400 px-2 py-2">{s.nokta}</td>
                <td className="border border-gray-400 px-2 py-2 text-center" aria-label="Yapıştırıldı kutusu">
                  <span className="inline-block w-[5mm] h-[5mm] border border-gray-600" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[9pt] text-gray-600 mt-3">Kartlar sonraki sayfalarda. Kartı yapıştırmadan önce altındaki şeridi kesip at.</p>
      </section>
      {sayfalaraBol(satirlar).map((grup, i) => (
        <section key={i} className="break-after-page last:break-after-auto grid grid-cols-2 gap-x-[8mm] gap-y-[6mm] justify-items-center content-start">
          {grup.map((s) => (
            <div key={s.durakId} className="break-inside-avoid w-[70mm] flex flex-col items-center">
              <div className="[&_svg]:w-[64mm] [&_svg]:h-auto">
                <QrCard n={s.qr} design="acik" />
              </div>
              <div className="w-full mt-[3mm] pt-[2mm] border-t-2 border-dashed border-gray-400 text-[9pt] leading-snug">
                <p className="text-gray-500">
                  <span aria-hidden="true">✂ </span>Kesip at · Buraya yapıştır (QR {s.qr}):
                </p>
                <p>
                  <span className="font-bold">{s.mekan}</span> — {s.nokta}
                </p>
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

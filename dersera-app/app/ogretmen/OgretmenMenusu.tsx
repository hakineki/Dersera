"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Ikon, { type IkonAdi } from "@/components/Ikon";

interface MenuSekmesi<T extends string> {
  id: T;
  label: string;
  icon: IkonAdi;
}

export interface MenuBaglantisi {
  href: string;
  label: string;
  icon: IkonAdi;
}

const OGE = "w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors";
// Marka zeminli ikon karesi: panel sekmeleri mor, sayfa dışı bağlantılar yeşil, çıkış kırmızı.
const KUTU = "w-8 h-8 shrink-0 rounded-lg flex items-center justify-center";

// Telefonda başlıktaki ⋮ düğmesi: alt çubukta olmayan sekmeler, sayfa dışı bağlantılar ve çıkış.
// Dışarı dokunma, Escape ya da odağın menü dışına geçmesi (Tab) kapatır; sekme seçilince odak ⋮ düğmesine döner.
export default function OgretmenMenusu<T extends string>({
  sekmeler,
  aktif,
  onSekme,
  baglantilar,
  onCikis,
}: {
  sekmeler: MenuSekmesi<T>[];
  aktif: T;
  onSekme: (id: T) => void;
  baglantilar: MenuBaglantisi[];
  onCikis: () => void;
}) {
  const [acik, setAcik] = useState(false);
  const kapsayici = useRef<HTMLDivElement>(null);
  const dugme = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!acik) return;
    panel.current?.querySelector<HTMLElement>("button, a")?.focus();
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAcik(false);
      dugme.current?.focus();
    };
    // blur yerine focusin: Safari dokunulan düğmeye odak vermez, blur menüyü tıklama gelmeden kapatırdı.
    const disari = (e: FocusEvent) => {
      if (!kapsayici.current?.contains(e.target as Node)) setAcik(false);
    };
    document.addEventListener("keydown", escape);
    document.addEventListener("focusin", disari);
    return () => {
      document.removeEventListener("keydown", escape);
      document.removeEventListener("focusin", disari);
    };
  }, [acik]);

  return (
    <div ref={kapsayici} className="relative shrink-0 sm:hidden">
      <button
        ref={dugme}
        type="button"
        aria-label="Menü"
        aria-expanded={acik}
        aria-controls="ogretmen-menu"
        onClick={() => setAcik((a) => !a)}
        className="w-10 h-10 flex items-center justify-center rounded-lg text-white bg-white/10 hover:bg-white/20 transition-colors"
      >
        <Ikon ad="menu" className="w-6 h-6" />
      </button>
      {acik && (
        <>
          <div className="fixed inset-0 z-30" aria-hidden="true" onClick={() => setAcik(false)} />
          <div
            ref={panel}
            id="ogretmen-menu"
            className="absolute right-0 top-full mt-2 z-40 w-60 bg-white text-gray-700 rounded-xl shadow-lg border border-gray-200 py-2"
          >
            {sekmeler.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-current={aktif === s.id ? "page" : undefined}
                onClick={() => {
                  onSekme(s.id);
                  setAcik(false);
                  dugme.current?.focus();
                }}
                className={`${OGE} ${aktif === s.id ? "bg-indigo-50 text-indigo-700 font-semibold" : "hover:bg-gray-50"}`}
              >
                <span className={`${KUTU} ${aktif === s.id ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-700"}`}>
                  <Ikon ad={s.icon} />
                </span>
                <span>{s.label}</span>
              </button>
            ))}
            <div className="my-2 border-t border-gray-100" />
            {baglantilar.map((b) => (
              <Link key={b.href} href={b.href} onClick={() => setAcik(false)} className={`${OGE} hover:bg-gray-50`}>
                <span className={`${KUTU} bg-teal-50 text-teal-700`}>
                  <Ikon ad={b.icon} />
                </span>
                <span>{b.label}</span>
              </Link>
            ))}
            <div className="my-2 border-t border-gray-100" />
            <button
              type="button"
              onClick={() => {
                setAcik(false);
                onCikis();
              }}
              className={`${OGE} text-red-700 hover:bg-red-50`}
            >
              <span className={`${KUTU} bg-red-50 text-red-700`}>
                <Ikon ad="cikis" />
              </span>
              <span>Çıkış yap</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

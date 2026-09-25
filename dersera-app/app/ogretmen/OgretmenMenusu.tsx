"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export interface MenuSekmesi<T extends string> {
  id: T;
  label: string;
  icon: string;
}

export interface MenuBaglantisi {
  href: string;
  label: string;
  icon: string;
}

const OGE = "w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors";

// Telefonda başlıktaki ⋮ düğmesi: alt çubukta olmayan sekmeler ve sayfa dışı bağlantılar. Dışarı dokunma ya da Escape kapatır.
export default function OgretmenMenusu<T extends string>({
  sekmeler,
  aktif,
  onSekme,
  baglantilar,
}: {
  sekmeler: MenuSekmesi<T>[];
  aktif: T;
  onSekme: (id: T) => void;
  baglantilar: MenuBaglantisi[];
}) {
  const [acik, setAcik] = useState(false);
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
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [acik]);

  return (
    <div className="relative shrink-0 sm:hidden">
      <button
        ref={dugme}
        type="button"
        aria-label="Menü"
        aria-expanded={acik}
        aria-controls="ogretmen-menu"
        onClick={() => setAcik((a) => !a)}
        className="w-10 h-10 flex items-center justify-center rounded-lg text-2xl leading-none text-white bg-white/10 hover:bg-white/20 transition-colors"
      >
        ⋮
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
                }}
                className={`${OGE} ${aktif === s.id ? "bg-indigo-50 text-indigo-700 font-semibold" : "hover:bg-gray-50"}`}
              >
                <span>{s.icon}</span>
                <span>{s.label}</span>
              </button>
            ))}
            <div className="my-2 border-t border-gray-100" />
            {baglantilar.map((b) => (
              <Link key={b.href} href={b.href} onClick={() => setAcik(false)} className={`${OGE} hover:bg-gray-50`}>
                <span>{b.icon}</span>
                <span>{b.label}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

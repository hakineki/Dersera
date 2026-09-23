"use client";

import { useState } from "react";
import type { Durak, Final } from "@/lib/composer/definition";
import { CEVAP_BICIMI } from "./labels";

export type Duzenlenen = { tur: "durak"; durak: Durak } | { tur: "final"; final: Final };

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

function Alan({ etiket, children }: { etiket: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1">{etiket}</span>
      {children}
    </label>
  );
}

const input = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export default function DurakEditor({
  value,
  onSave,
  onClose,
}: {
  value: Duzenlenen;
  onSave: (v: Duzenlenen) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState<Duzenlenen>(value);
  const isDurak = v.tur === "durak";
  const tur = isDurak ? v.durak.gorev.tur : v.final.gorev_turu;
  const soru = isDurak ? v.durak.gorev.soru : v.final.soru;
  const secenekler = isDurak ? v.durak.gorev.secenekler : v.final.secenekler;
  const dogru = isDurak ? v.durak.gorev.dogru_cevap : v.final.dogru_cevap;

  const setGorev = (patch: Partial<{ soru: string; secenekler: string[]; dogru_cevap: string }>) =>
    setV((cur) =>
      cur.tur === "durak"
        ? { ...cur, durak: { ...cur.durak, gorev: { ...cur.durak.gorev, ...patch } } }
        : { ...cur, final: { ...cur.final, ...patch } }
    );

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="editor-baslik" className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="editor-baslik" className="font-bold text-gray-900">
            {isDurak ? "Durağı düzenle" : "Finali düzenle"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm" aria-label="Kapat">
            ✕
          </button>
        </div>

        {v.tur === "durak" && (
          <>
            <Alan etiket="Durak adı">
              <input className={input} value={v.durak.isim} onChange={(e) => setV({ ...v, durak: { ...v.durak, isim: e.target.value } })} />
            </Alan>
            <Alan etiket="Hikâye metni">
              <textarea className={input} rows={3} value={v.durak.hikaye_metni} onChange={(e) => setV({ ...v, durak: { ...v.durak, hikaye_metni: e.target.value } })} />
            </Alan>
          </>
        )}
        {v.tur === "final" && (
          <Alan etiket="Final hikâyesi">
            <textarea className={input} rows={3} value={v.final.hikaye_metni} onChange={(e) => setV({ ...v, final: { ...v.final, hikaye_metni: e.target.value } })} />
          </Alan>
        )}

        <Alan etiket="Soru">
          <textarea className={input} rows={2} value={soru} onChange={(e) => setGorev({ soru: e.target.value })} />
        </Alan>
        {tur !== "sayisal" && (
          <Alan etiket="Seçenekler (her satıra bir tane)">
            <textarea className={input} rows={4} defaultValue={secenekler.join("\n")} onChange={(e) => setGorev({ secenekler: lines(e.target.value) })} />
          </Alan>
        )}
        <Alan etiket="Doğru cevap">
          <input className={input} value={dogru} onChange={(e) => setGorev({ dogru_cevap: e.target.value })} />
          <span className="block text-[11px] text-gray-400 mt-1">{CEVAP_BICIMI[tur]}</span>
        </Alan>

        {v.tur === "durak" && (
          <>
            <Alan etiket="İpucu 1">
              <input className={input} value={v.durak.gorev.ipucu_1} onChange={(e) => setV({ ...v, durak: { ...v.durak, gorev: { ...v.durak.gorev, ipucu_1: e.target.value } } })} />
            </Alan>
            <Alan etiket="İpucu 2">
              <input className={input} value={v.durak.gorev.ipucu_2} onChange={(e) => setV({ ...v, durak: { ...v.durak, gorev: { ...v.durak.gorev, ipucu_2: e.target.value } } })} />
            </Alan>
            <fieldset className="border border-gray-200 rounded-xl p-3 space-y-3">
              <legend className="text-xs font-semibold text-gray-600 px-1">Destek görevi</legend>
              {(["soru", "dogru_cevap", "aciklama"] as const).map((k) => (
                <Alan key={k} etiket={k === "soru" ? "Soru" : k === "dogru_cevap" ? "Doğru cevap" : "Açıklama"}>
                  <input
                    className={input}
                    value={v.durak.gorev.destek_gorevi[k]}
                    onChange={(e) => setV({ ...v, durak: { ...v.durak, gorev: { ...v.durak.gorev, destek_gorevi: { ...v.durak.gorev.destek_gorevi, [k]: e.target.value } } } })}
                  />
                </Alan>
              ))}
              <Alan etiket="Seçenekler (her satıra bir tane)">
                <textarea
                  className={input}
                  rows={3}
                  defaultValue={v.durak.gorev.destek_gorevi.secenekler.join("\n")}
                  onChange={(e) => setV({ ...v, durak: { ...v.durak, gorev: { ...v.durak.gorev, destek_gorevi: { ...v.durak.gorev.destek_gorevi, secenekler: lines(e.target.value) } } } })}
                />
              </Alan>
            </fieldset>
          </>
        )}

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-lg">
            Vazgeç
          </button>
          <button onClick={() => onSave(v)} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg">
            Kaydet ve doğrula
          </button>
        </div>
      </div>
    </div>
  );
}

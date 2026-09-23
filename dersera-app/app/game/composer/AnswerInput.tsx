"use client";

import { useState } from "react";
import { joinAnswer, splitPair } from "@/lib/composer/answers";
import { ESLESTIRME_AYRACI, type GorevTuru } from "@/lib/composer/definition";

const btn = "w-full text-left bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl px-4 py-3 text-white text-sm transition-colors";
const submit = "w-full bg-white text-indigo-900 font-bold py-3 rounded-xl disabled:opacity-40";

function Secenekler({ secenekler, gorsel, onSubmit }: { secenekler: string[]; gorsel: boolean; onSubmit: (v: string) => void }) {
  return (
    <div className={gorsel ? "grid grid-cols-2 gap-2" : "space-y-2"}>
      {secenekler.map((s, i) => (
        <button key={s} onClick={() => onSubmit(s)} className={gorsel ? `${btn} text-center text-lg py-5` : btn}>
          {!gorsel && <span className="font-bold text-purple-300 mr-2">{String.fromCharCode(65 + i)})</span>}
          {s}
        </button>
      ))}
    </div>
  );
}

function Sayisal({ onSubmit }: { onSubmit: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) onSubmit(v);
      }}
    >
      <label htmlFor="sayisal-cevap" className="sr-only">
        Cevabın
      </label>
      <input
        id="sayisal-cevap"
        inputMode="decimal"
        value={v}
        onChange={(e) => setV(e.target.value)}
        className="w-full bg-white/10 border border-white/20 text-white text-center text-2xl font-mono rounded-xl px-4 py-3"
        placeholder="?"
      />
      <button type="submit" disabled={!v.trim()} className={submit}>
        Gönder
      </button>
    </form>
  );
}

function Siralama({ secenekler, onSubmit }: { secenekler: string[]; onSubmit: (v: string) => void }) {
  const [sira, setSira] = useState<string[]>([]);
  const kalan = secenekler.filter((s) => !sira.includes(s));
  return (
    <div className="space-y-3">
      <ol className="space-y-1.5 min-h-12 bg-black/20 rounded-xl p-2" aria-label="Senin sıran">
        {sira.length === 0 && <li className="text-white/40 text-xs text-center py-2">Öğelere doğru sırayla dokun</li>}
        {sira.map((s, i) => (
          <li key={s}>
            <button onClick={() => setSira(sira.filter((x) => x !== s))} className="w-full text-left bg-indigo-500/40 rounded-lg px-3 py-2 text-white text-sm">
              <span className="font-bold mr-2">{i + 1}.</span>
              {s} <span className="sr-only">(çıkar)</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="space-y-1.5">
        {kalan.map((s) => (
          <button key={s} onClick={() => setSira([...sira, s])} className={btn}>
            {s}
          </button>
        ))}
      </div>
      <button onClick={() => onSubmit(joinAnswer(sira))} disabled={kalan.length > 0} className={submit}>
        Gönder
      </button>
    </div>
  );
}

function Eslestirme({ secenekler, onSubmit }: { secenekler: string[]; onSubmit: (v: string) => void }) {
  const ciftler = secenekler.map(splitPair).filter((p): p is [string, string] => p !== null);
  const sollar = ciftler.map((c) => c[0]);
  const saglar = ciftler.map((c) => c[1]).sort((a, b) => a.localeCompare(b, "tr"));
  const [secim, setSecim] = useState<Record<string, string>>({});
  const tamam = sollar.every((s) => secim[s]);
  return (
    <div className="space-y-2">
      {sollar.map((sol, i) => (
        <label key={sol} className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2">
          <span className="flex-1 text-white text-sm">{sol}</span>
          <select
            aria-label={`${i + 1}. eşleştirme: ${sol}`}
            value={secim[sol] ?? ""}
            onChange={(e) => setSecim({ ...secim, [sol]: e.target.value })}
            className="bg-white text-gray-900 rounded-lg px-2 py-1.5 text-sm max-w-[55%]"
          >
            <option value="">Seç…</option>
            {saglar.map((sag) => (
              <option key={sag} value={sag}>
                {sag}
              </option>
            ))}
          </select>
        </label>
      ))}
      <button onClick={() => onSubmit(joinAnswer(sollar.map((s) => `${s}${ESLESTIRME_AYRACI}${secim[s]}`)))} disabled={!tamam} className={submit}>
        Gönder
      </button>
    </div>
  );
}

export default function AnswerInput({ tur, secenekler, onSubmit }: { tur: GorevTuru; secenekler: string[]; onSubmit: (v: string) => void }) {
  switch (tur) {
    case "sayisal":
      return <Sayisal onSubmit={onSubmit} />;
    case "siralama":
    case "surukle_birak":
      return <Siralama secenekler={secenekler} onSubmit={onSubmit} />;
    case "eslestirme":
      return <Eslestirme secenekler={secenekler} onSubmit={onSubmit} />;
    default:
      return <Secenekler secenekler={secenekler} gorsel={tur === "gorsel_secim"} onSubmit={onSubmit} />;
  }
}

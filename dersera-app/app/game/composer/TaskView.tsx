"use client";

import { useState } from "react";
import { isCorrect } from "@/lib/composer/answers";
import type { GorevTuru } from "@/lib/composer/definition";
import AnswerInput from "./AnswerInput";

export interface TaskData {
  tur: GorevTuru;
  soru: string;
  secenekler: string[];
  dogru_cevap: string;
  ipucu_1?: string;
  ipucu_2?: string;
  destek?: { soru: string; secenekler: string[]; dogru_cevap: string; aciklama: string };
}

type Faz = "soru" | "dogru" | "destek" | "destek-sonuc" | "cozum";

// Yanlış cevap oyunu bitirmez: 1. yanlış → ipucu 1, 2. yanlış → ipucu 2, 3. yanlış → destek görevi.
// Destek görevi olmayan (final) görevde üçüncü yanlıştan sonra doğru cevap gösterilir ve oyun sürer.
export default function TaskView({
  gorev,
  onWrong,
  onDone,
}: {
  gorev: TaskData;
  onWrong: () => void;
  onDone: (yanlisSayisi: number) => void;
}) {
  const [yanlis, setYanlis] = useState(0);
  const [faz, setFaz] = useState<Faz>("soru");
  const [destekDogru, setDestekDogru] = useState(false);
  const [sonYanlis, setSonYanlis] = useState(false);

  function cevapla(v: string) {
    if (isCorrect(gorev.tur, gorev.dogru_cevap, v)) {
      setFaz("dogru");
      return;
    }
    onWrong();
    const n = yanlis + 1;
    setYanlis(n);
    setSonYanlis(true);
    if (n >= 3) setFaz(gorev.destek ? "destek" : "cozum");
  }

  const ipucu = yanlis >= 2 ? gorev.ipucu_2 : yanlis === 1 ? gorev.ipucu_1 : undefined;

  if (faz === "dogru") {
    return (
      <div className="bg-green-500/20 border border-green-400/40 rounded-2xl p-5 text-center" role="status">
        <p className="text-3xl mb-2" aria-hidden="true">✅</p>
        <p className="text-green-100 font-bold mb-4">Doğru!</p>
        <button onClick={() => onDone(yanlis)} className="w-full bg-white text-indigo-900 font-bold py-3 rounded-xl">
          Devam
        </button>
      </div>
    );
  }

  if (faz === "cozum") {
    return (
      <div className="bg-amber-400/20 border border-amber-300/40 rounded-2xl p-5" role="status">
        <p className="text-amber-100 text-sm mb-2">Bu seferlik doğru cevap:</p>
        <p className="text-white font-bold mb-4">{gorev.dogru_cevap}</p>
        <button onClick={() => onDone(yanlis)} className="w-full bg-white text-indigo-900 font-bold py-3 rounded-xl">
          Devam
        </button>
      </div>
    );
  }

  if (faz === "destek" && gorev.destek) {
    const d = gorev.destek;
    return (
      <div className="space-y-3">
        <div className="bg-sky-500/20 border border-sky-400/40 rounded-2xl p-4">
          <p className="text-sky-200 text-xs font-semibold uppercase tracking-wide mb-1">Destek görevi</p>
          <p className="text-white text-sm">Birlikte küçük bir adımla ilerleyelim.</p>
        </div>
        <p className="text-white font-medium leading-relaxed">{d.soru}</p>
        <AnswerInput
          tur="coktan_secmeli"
          secenekler={d.secenekler}
          onSubmit={(v) => {
            setDestekDogru(isCorrect("coktan_secmeli", d.dogru_cevap, v));
            setFaz("destek-sonuc");
          }}
        />
      </div>
    );
  }

  if (faz === "destek-sonuc" && gorev.destek) {
    return (
      <div className={`${destekDogru ? "bg-green-500/20 border-green-400/40" : "bg-sky-500/20 border-sky-400/40"} border rounded-2xl p-5`} role="status">
        <p className="text-white font-bold mb-2">{destekDogru ? "✅ Harika, işte bu!" : `Doğru cevap: ${gorev.destek.dogru_cevap}`}</p>
        <p className="text-white/80 text-sm leading-relaxed mb-4">{gorev.destek.aciklama}</p>
        <button onClick={() => onDone(yanlis)} className="w-full bg-white text-indigo-900 font-bold py-3 rounded-xl">
          Devam
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-white font-medium leading-relaxed">{gorev.soru}</p>
      {sonYanlis && (
        <p role="alert" className="text-red-200 text-sm">
          ❌ Olmadı, bir daha dene. (+15 sn)
        </p>
      )}
      {ipucu && (
        <div className="bg-amber-400/20 border border-amber-300/40 rounded-xl px-4 py-3">
          <p className="text-amber-100 text-xs font-semibold mb-0.5">💡 İpucu {yanlis >= 2 ? 2 : 1}</p>
          <p className="text-white text-sm">{ipucu}</p>
        </div>
      )}
      <AnswerInput key={yanlis} tur={gorev.tur} secenekler={gorev.secenekler} onSubmit={cevapla} />
    </div>
  );
}

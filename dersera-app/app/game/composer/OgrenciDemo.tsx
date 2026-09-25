"use client";

import { useState } from "react";
import type { GameDefinition } from "@/lib/composer/definition";
import { bellekOyunKaydi } from "@/lib/oyunKaydi";
import ComposerPlayer from "./ComposerPlayer";

// Öğretmen oyunu öğrencinin göreceği ekranla oynar: bellek deposu, sonuç ve puan gönderilmez, öğrencinin bu cihazdaki
// oyun durumu yazılmaz. "Baştan" oynatıcıyı yeni bir bellek deposuyla sıfırdan kurar.
export default function OgrenciDemo({ def, onCik }: { def: GameDefinition; onCik: () => void }) {
  const [oturum, setOturum] = useState(() => ({ no: 0, kayit: bellekOyunKaydi(), basla: Date.now() }));
  const bastan = () => setOturum((o) => ({ no: o.no + 1, kayit: bellekOyunKaydi(), basla: Date.now() }));
  return (
    <ComposerPlayer
      key={oturum.no}
      def={def}
      gameCode="DEMO"
      nickname="Öğretmen"
      startTime={oturum.basla}
      qr={null}
      kayit={oturum.kayit}
      demo={{ bastan, cik: onCik }}
    />
  );
}

"use client";

import { useEffect, useState } from "react";

// E-postadaki bağlantının belirteci (#t=…; sunucuya gitmez): bir kez okunur ve adres çubuğundan silinir (geçmişte, ekran
// görüntüsünde ya da paylaşılan adreste kalmasın). undefined: henüz okunmadı; null: bağlantıda belirteç yok.
export function useBaglantiBelirteci(): string | null | undefined {
  const [t, setT] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const zaman = setTimeout(() => {
      const t = new URLSearchParams(window.location.hash.slice(1)).get("t");
      setT(t);
      if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    });
    return () => clearTimeout(zaman);
  }, []);
  return t;
}

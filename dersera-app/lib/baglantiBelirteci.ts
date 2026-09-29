"use client";

import { useEffect, useState } from "react";

// E-postadaki bağlantının belirteci (?t=…): bir kez okunur ve adres çubuğundan silinir (geçmişte, ekran görüntüsünde ya
// da paylaşılan adreste kalmasın). undefined: henüz okunmadı; null: bağlantıda belirteç yok.
export function useBaglantiBelirteci(): string | null | undefined {
  const [t, setT] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const zaman = setTimeout(() => {
      const url = new URL(window.location.href);
      setT(url.searchParams.get("t"));
      if (url.searchParams.has("t")) {
        url.searchParams.delete("t");
        window.history.replaceState(null, "", url.pathname + url.search);
      }
    });
    return () => clearTimeout(zaman);
  }, []);
  return t;
}

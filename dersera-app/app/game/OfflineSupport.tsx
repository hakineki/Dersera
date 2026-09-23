"use client";

import { useEffect } from "react";

// Sayfa yüklendikten sonra kullanılan statik dosyaları service worker'a önbelleğe aldırır:
// ilk ziyaret service worker kontrolü başlamadan önce gerçekleştiği için bu dosyalar kendiliğinden yakalanmaz.
export default function OfflineSupport() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        const urls = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((u) => new URL(u).pathname.startsWith("/_next/static/"));
        reg.active?.postMessage({ type: "cache", urls: ["/game", ...urls] });
      })
      .catch(() => {
        /* service worker desteklenmiyorsa oyun yine çevrimiçi çalışır */
      });
  }, []);
  return null;
}

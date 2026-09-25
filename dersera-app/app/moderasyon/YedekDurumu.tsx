"use client";

import { useEffect, useState } from "react";

// Son gece yedeğinin durumu (lib/yedekDepo.ts). Başarısız, eksik ya da 36 saatten eski yedek kırmızı gösterilir:
// yedek sessizce bozulmasın.
const GECIKME_MS = 36 * 60 * 60 * 1000;

interface Durum {
  tarih: number;
  basarili: boolean;
  anahtarSayisi: number;
  atlanan: number;
  hata?: string;
}

export default function YedekDurumu() {
  // simdi: yanıt anındaki zaman (render sırasında saat okunmaz).
  const [d, setD] = useState<{ durum: Durum | null; yapilandirilmamis?: boolean; simdi: number } | null>(null);
  useEffect(() => {
    fetch("/api/yonetim/yedek/durum", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setD(j ? { ...j, simdi: Date.now() } : null), () => setD(null));
  }, []);
  if (!d) return null;
  const s = d.durum;
  const zaman = (ms: number) => new Date(ms).toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const sorun = !s || !s.basarili || d.simdi - s.tarih > GECIKME_MS;
  const metin = d.yapilandirilmamis
    ? "Yedek: Redis tanımlı değil (yerel ortam)."
    : !s
      ? "Yedek: henüz hiç alınmadı. YEDEK_ANAHTARI, CRON_SECRET ve BLOB_READ_WRITE_TOKEN tanımlı mı?"
      : s.basarili
        ? `Son yedek: ${zaman(s.tarih)} · ${s.anahtarSayisi.toLocaleString("tr-TR")} kayıt${d.simdi - s.tarih > GECIKME_MS ? " · 36 saatten eski!" : ""}`
        : `Son yedek BAŞARISIZ: ${zaman(s.tarih)}${s.atlanan ? ` · ${s.atlanan} kayıt okunamadı` : ""}${s.hata ? ` · ${s.hata}` : ""}`;
  return (
    <p role={sorun ? "alert" : "status"} className={`text-xs rounded-lg px-3 py-2 border ${sorun ? "bg-red-50 border-red-200 text-red-800" : "bg-green-50 border-green-200 text-green-800"}`}>
      <span aria-hidden="true">{sorun ? "⚠️ " : "🗄 "}</span>
      {metin}
    </p>
  );
}

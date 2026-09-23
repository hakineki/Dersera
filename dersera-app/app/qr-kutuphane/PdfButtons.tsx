"use client";

import { useState } from "react";
import type { QrDesignId } from "@/lib/qr";
import type { PaperSize } from "@/lib/qrPdf";

const SIZES: PaperSize[] = ["a5", "a4", "a3"];

// jsPDF büyük bir paket; yalnızca indirme istendiğinde yüklenir.
async function loadPdf() {
  return import("@/lib/qrPdf");
}

export default function PdfButtons({ n, design }: { n?: number; design?: QrDesignId }) {
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: (pdf: Awaited<ReturnType<typeof loadPdf>>) => void) {
    setBusy(key);
    try {
      fn(await loadPdf());
    } finally {
      setBusy(null);
    }
  }

  if (n === undefined || design === undefined) {
    return (
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={() => run("koyu", (p) => p.downloadAllPdf("koyu"))}
          disabled={busy !== null}
          className="bg-[#3B2F9E] hover:bg-[#2f257f] text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-60 transition-colors"
        >
          {busy === "koyu" ? "Hazırlanıyor…" : "⬇ Koyu PDF indir"}
        </button>
        <button
          onClick={() => run("acik", (p) => p.downloadAllPdf("acik"))}
          disabled={busy !== null}
          className="bg-white border border-[#3B2F9E] text-[#3B2F9E] hover:bg-indigo-50 text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-60 transition-colors"
        >
          {busy === "acik" ? "Hazırlanıyor…" : "⬇ Açık PDF indir"}
        </button>
        <p className="text-xs text-gray-400 self-center">20 QR · A4 · sayfa başına 4 kart</p>
      </div>
    );
  }

  return (
    <div className="flex gap-1" role="group" aria-label={`QR ${n} PDF indir`}>
      {SIZES.map((size) => (
        <button
          key={size}
          onClick={() => run(size, (p) => p.downloadSinglePdf(n, design, size))}
          disabled={busy !== null}
          aria-label={`QR ${n} ${design === "koyu" ? "koyu" : "açık"} tasarım ${size.toUpperCase()} PDF indir`}
          className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded disabled:opacity-60 transition-colors"
        >
          {size.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

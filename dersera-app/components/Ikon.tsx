// Dersera ikon paketi. Çizimler Tabler Icons 3.48.0 "outline" setinden alınmıştır (24×24, 2px çizgi): https://tabler.io/icons
//
// MIT License
//
// Copyright (c) 2020-2026 Paweł Kuna
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

const CIZIMLER = {
  oyun: [
    "M12 5h3.5a5 5 0 0 1 0 10h-5.5l-4.015 4.227a2.3 2.3 0 0 1 -3.923 -2.035l1.634 -8.173a5 5 0 0 1 4.904 -4.019h3.4",
    "M14 15l4.07 4.284a2.3 2.3 0 0 0 3.925 -2.023l-1.6 -8.232",
    "M8 9v2",
    "M7 10h2",
    "M14 10h2",
  ], // device-gamepad-2
  kutuphane: [
    "M5 5a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -14",
    "M9 5a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -14",
    "M5 8h4",
    "M9 16h4",
    "M13.803 4.56l2.184 -.53c.562 -.135 1.133 .19 1.282 .732l3.695 13.418a1.02 1.02 0 0 1 -.634 1.219l-.133 .041l-2.184 .53c-.562 .135 -1.133 -.19 -1.282 -.732l-3.695 -13.418a1.02 1.02 0 0 1 .634 -1.219l.133 -.041",
    "M14 9l4 -1",
    "M16 16l3.923 -.98",
  ], // books
  sinif: [
    "M8 21l8 0",
    "M12 17l0 4",
    "M7 4l10 0",
    "M17 4v8a5 5 0 0 1 -10 0v-8",
    "M3 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
    "M17 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  ], // trophy
  ogrenme: [
    "M4 19l16 0",
    "M4 15l4 -6l4 2l4 -5l4 4",
  ], // chart-line
  okul: [
    "M22 9l-10 -4l-10 4l10 4l10 -4v6",
    "M6 10.6v5.4a6 3 0 0 0 12 0v-5.4",
  ], // school
  ayarlar: [
    "M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065",
    "M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0",
  ], // settings
  topluluk: [
    "M10 13a2 2 0 1 0 4 0a2 2 0 0 0 -4 0",
    "M8 21v-1a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v1",
    "M15 5a2 2 0 1 0 4 0a2 2 0 0 0 -4 0",
    "M17 10h2a2 2 0 0 1 2 2v1",
    "M5 5a2 2 0 1 0 4 0a2 2 0 0 0 -4 0",
    "M3 13v-1a2 2 0 0 1 2 -2h2",
  ], // users-group
  qr: [
    "M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4",
    "M7 17l0 .01",
    "M14 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4",
    "M7 7l0 .01",
    "M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4",
    "M17 7l0 .01",
    "M14 14l3 0",
    "M20 14l0 .01",
    "M14 14l0 3",
    "M14 20l3 0",
    "M17 17l3 0",
    "M20 17l0 3",
  ], // qrcode
  moderasyon: [
    "M11.46 20.846a12 12 0 0 1 -7.96 -14.846a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.09 7.06",
    "M15 19l2 2l4 -4",
  ], // shield-check
  "ana-sayfa": [
    "M5 12l-2 0l9 -9l9 9l-2 0",
    "M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7",
    "M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6",
  ], // home
  cikis: [
    "M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2",
    "M9 12h12l-3 -3",
    "M18 15l3 -3",
  ], // logout
  menu: [
    "M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
    "M11 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
    "M11 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  ], // dots-vertical
  guncelle: [
    "M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4",
    "M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4",
  ], // refresh
} as const;

export type IkonAdi = keyof typeof CIZIMLER;

// Renk "currentColor"dan gelir; boyut className ile verilir. Yanındaki metin adı taşıdığı için ekran okuyucudan gizlenir.
export default function Ikon({ ad, className = "w-5 h-5" }: { ad: IkonAdi; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {CIZIMLER[ad].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

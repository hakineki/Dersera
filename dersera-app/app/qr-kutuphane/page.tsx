import Link from "next/link";
import DerseraLogo from "@/components/DerseraLogo";
import QrCard from "@/components/QrCard";
import { QR_DESIGNS, QR_NUMBERS, qrUrl } from "@/lib/qr";
import PdfButtons from "./PdfButtons";
import OgretmenGerekli from "@/components/OgretmenGerekli";
import { sayfaHesabi } from "@/lib/sayfaOturumu";

export const metadata = {
  title: "QR Kütüphanesi — Dersera",
  description: "1–20 numaralı sabit durak QR kodları; koyu ve açık tasarım, PDF indirme.",
};

// Öğrenci QR'ları ekrandan tarayıp durakları dolaşmadan geçemesin: yalnız öğretmene.
export default async function QrKutuphanePage() {
  if (!(await sayfaHesabi())) return <OgretmenGerekli baslik="QR Kütüphanesi" />;
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-900 text-white px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <DerseraLogo />
            <p className="text-xs font-semibold text-indigo-200 border-l border-indigo-700 pl-3">QR Kütüphanesi</p>
          </div>
          <Link href="/ogretmen" className="text-indigo-300 hover:text-white text-sm transition-colors whitespace-nowrap">
            ← Panel
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Sabit QR Kodlar</h1>
        <p className="text-sm text-gray-500 mb-5 max-w-2xl">
          Bu 20 QR kod hiç değişmez; bir kez basıp okula asın. Hangi QR&apos;ın hangi durak olacağını
          her oyunda öğretmen paneli belirler. Adres biçimi: <code className="text-indigo-700">{qrUrl(1)}</code>
        </p>

        <PdfButtons />

        <div className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(332px,1fr))]">
          {QR_NUMBERS.map((n) => (
            <section key={n} aria-label={`QR ${n}`} className="flex gap-3 justify-center">
              {(Object.keys(QR_DESIGNS) as (keyof typeof QR_DESIGNS)[]).map((design) => (
                <div key={design} className="flex flex-col items-center gap-2">
                  <QrCard n={n} design={design} />
                  <PdfButtons n={n} design={design} />
                </div>
              ))}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}

import Link from "next/link";
import DerseraLogo from "@/components/DerseraLogo";
import { KOSUL_BOLUMLERI, KOSUL_SURUMU } from "@/lib/kosullar";

export const metadata = {
  title: "Kullanım Koşulları — Dersera",
  description: "Dersera öğretmen hesabı kullanım koşulları.",
};

export default function KosullarPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-900 text-white px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <DerseraLogo />
          <Link href="/ogretmen" className="text-indigo-300 hover:text-white text-sm whitespace-nowrap">
            ← Öğretmen girişi
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kullanım Koşulları</h1>
          <p className="text-sm text-gray-500 mt-1">Sürüm {KOSUL_SURUMU}. Öğretmen hesabı açarken bu koşulları onaylarsın.</p>
        </div>
        <ol className="space-y-4">
          {KOSUL_BOLUMLERI.map((b, i) => (
            <li key={b.baslik} className="bg-white border border-gray-200 rounded-2xl p-4">
              <h2 className="font-semibold text-gray-900">
                {i + 1}. {b.baslik}
              </h2>
              <p className="text-sm text-gray-700 leading-relaxed mt-1">{b.metin}</p>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}

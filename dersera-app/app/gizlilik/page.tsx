import Link from "next/link";
import DerseraLogo from "@/components/DerseraLogo";
import { GIZLILIK_BOLUMLERI, GIZLILIK_SURUMU } from "@/lib/gizlilik";

export const metadata = {
  title: "Gizlilik ve KVKK Aydınlatma Metni — Dersera",
  description: "Dersera'da hangi kişisel verilerin, hangi amaçla ve ne kadar süre işlendiği.",
};

export default function GizlilikPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-900 text-white px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <DerseraLogo />
          <Link href="/" className="text-indigo-300 hover:text-white text-sm whitespace-nowrap">
            ← Ana sayfa
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gizlilik ve KVKK Aydınlatma Metni</h1>
          <p className="text-sm text-gray-500 mt-1">
            Sürüm {GIZLILIK_SURUMU}. Ayrıca bkz.{" "}
            <Link href="/kosullar" className="underline text-indigo-700">
              Kullanım Koşulları
            </Link>
            .
          </p>
        </div>
        <ol className="space-y-4">
          {GIZLILIK_BOLUMLERI.map((b, i) => (
            <li key={b.baslik} className="bg-white border border-gray-200 rounded-2xl p-4">
              <h2 className="font-semibold text-gray-900">
                {i + 1}. {b.baslik}
              </h2>
              {b.metin && <p className="text-sm text-gray-700 leading-relaxed mt-1">{b.metin}</p>}
              {b.liste && (
                <ul className="list-disc pl-5 mt-2 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                  {b.liste.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}

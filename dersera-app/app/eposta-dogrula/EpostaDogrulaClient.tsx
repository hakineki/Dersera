"use client";

import Link from "next/link";
import { useState } from "react";
import DerseraLogo from "@/components/DerseraLogo";
import { epostaDogrula } from "@/lib/authClient";
import { useBaglantiBelirteci } from "@/lib/baglantiBelirteci";

// E-postadaki doğrulama bağlantısı. Bağlantıyı açmak doğrulamaz (e-posta tarayıcıları bağlantıları önceden açabilir);
// öğretmen düğmeye basınca doğrulanır.
export default function EpostaDogrulaClient() {
  const t = useBaglantiBelirteci();
  const [durum, setDurum] = useState<{ tur: "tamam" | "hata"; metin: string } | null>(null);
  const [bekliyor, setBekliyor] = useState(false);

  async function dogrula() {
    if (!t) return;
    setBekliyor(true);
    const r = await epostaDogrula(t);
    setBekliyor(false);
    setDurum("error" in r ? { tur: "hata", metin: r.error } : { tur: "tamam", metin: `${r.adres} doğrulandı. Şifreni unutursan bu adrese sıfırlama bağlantısı gönderilebilir.` });
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center px-6">
      <div className="w-full max-w-sm text-center space-y-5">
        <div className="flex justify-center">
          <DerseraLogo />
        </div>
        <h1 className="text-xl font-bold text-white">E-posta doğrulama</h1>
        {t === null && <p className="text-sm text-purple-200">Bağlantı eksik. E-postadaki bağlantıyı tam olarak aç.</p>}
        {t && !durum && (
          <button type="button" onClick={dogrula} disabled={bekliyor} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-semibold py-3 rounded-xl text-sm">
            {bekliyor ? "Doğrulanıyor…" : "E-postamı doğrula"}
          </button>
        )}
        {durum && (
          <p role={durum.tur === "hata" ? "alert" : "status"} className={`text-sm rounded-lg px-4 py-3 ${durum.tur === "hata" ? "bg-red-500/20 text-red-100" : "bg-green-500/20 text-green-100"}`}>
            {durum.metin}
          </p>
        )}
        <Link href="/ogretmen" className="block text-purple-300 text-sm hover:text-white">
          Öğretmen paneline git
        </Link>
      </div>
    </main>
  );
}

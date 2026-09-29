"use client";

import Link from "next/link";
import { useState } from "react";
import DerseraLogo from "@/components/DerseraLogo";
import { sifreSifirla } from "@/lib/authClient";
import { useBaglantiBelirteci } from "@/lib/baglantiBelirteci";

// Şifre sıfırlama bağlantısı: yeni şifre iki kez girilir. Başarıda bütün oturumlar kapanır; öğretmen yeni şifreyle girer.
export default function SifreSifirlaClient() {
  const t = useBaglantiBelirteci();
  const [sifre, setSifre] = useState("");
  const [sifre2, setSifre2] = useState("");
  const [hata, setHata] = useState("");
  const [tamam, setTamam] = useState(false);
  const [bekliyor, setBekliyor] = useState(false);
  const alan = "w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400";

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    if (!t) return;
    setHata("");
    if (sifre !== sifre2) return setHata("Şifreler eşleşmiyor.");
    setBekliyor(true);
    const r = await sifreSifirla(t, sifre);
    setBekliyor(false);
    if ("error" in r) return setHata(r.error);
    setTamam(true);
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex justify-center">
          <DerseraLogo />
        </div>
        <h1 className="text-xl font-bold text-white text-center">Yeni şifre</h1>
        {t === null && <p className="text-sm text-purple-200 text-center">Bağlantı eksik. E-postadaki ya da sana iletilen bağlantıyı tam olarak aç.</p>}
        {tamam ? (
          <p role="status" className="text-sm rounded-lg px-4 py-3 bg-green-500/20 text-green-100 text-center">
            Şifren değişti; bütün oturumların kapatıldı. Yeni şifrenle giriş yapabilirsin (hesabın askıya alınmışsa giriş, askı kalkınca açılır).
          </p>
        ) : (
          t && (
            <form onSubmit={gonder} className="space-y-4">
              <div>
                <label htmlFor="yeni-sifre" className="block text-sm text-purple-200 mb-1.5">
                  Yeni şifre
                </label>
                <input id="yeni-sifre" type="password" value={sifre} onChange={(e) => setSifre(e.target.value)} autoComplete="new-password" className={alan} />
              </div>
              <div>
                <label htmlFor="yeni-sifre2" className="block text-sm text-purple-200 mb-1.5">
                  Yeni şifre (tekrar)
                </label>
                <input id="yeni-sifre2" type="password" value={sifre2} onChange={(e) => setSifre2(e.target.value)} autoComplete="new-password" className={alan} />
              </div>
              {hata && (
                <p role="alert" className="text-sm rounded-lg px-4 py-2 bg-red-500/20 text-red-100">
                  {hata}
                </p>
              )}
              <button type="submit" disabled={bekliyor || !sifre || !sifre2} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:text-white/40 text-white font-semibold py-3 rounded-xl text-sm">
                {bekliyor ? "Kaydediliyor…" : "Şifremi değiştir"}
              </button>
            </form>
          )
        )}
        <Link href="/ogretmen" className="block text-center text-purple-300 text-sm hover:text-white">
          Giriş ekranına git
        </Link>
      </div>
    </main>
  );
}

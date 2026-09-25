"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DerseraLogo from "@/components/DerseraLogo";
import type { KopyaKaydi } from "@/lib/denetimKaydi";

const zaman = (ms: number) => new Date(ms).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const TUR_ADI = { topluluk: "Topluluk", okul: "Okul" } as const;

// Sızan içeriğin kaynağını bulmak için: başka öğretmenlere ait oyunların tam içeriğinin açılma kaydı.
export default function KopyaKaydiClient() {
  const [ogretmen, setOgretmen] = useState("");
  const [liste, setListe] = useState<KopyaKaydi[] | { error: string; status: number } | null>(null);

  const yukle = useCallback(async (ad: string) => {
    setListe(null);
    try {
      const res = await fetch(`/api/yonetim/kopya-kaydi${ad ? `?ogretmen=${encodeURIComponent(ad)}` : ""}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      setListe(res.ok ? (json.kayitlar as KopyaKaydi[]) : { error: json.error ?? "Kayıt okunamadı.", status: res.status });
    } catch {
      setListe({ error: "Bağlantı kurulamadı.", status: 0 });
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => yukle(""));
    return () => clearTimeout(t);
  }, [yukle]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-900 text-white px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <DerseraLogo />
            <p className="text-xs font-semibold text-indigo-200 border-l border-indigo-700 pl-3">Kopya kaydı</p>
          </div>
          <nav className="flex gap-4 text-sm whitespace-nowrap">
            <Link href="/moderasyon" className="text-indigo-300 hover:text-white">
              Moderasyon
            </Link>
            <Link href="/ogretmen" className="text-indigo-300 hover:text-white">
              ← Panel
            </Link>
          </nav>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Kopya kaydı</h1>
          <p className="text-sm text-gray-500">
            Öğretmenlerin başka öğretmenlere ait topluluk ve okul oyunlarının tam içeriğini (sorular ve cevaplar) açtığı anlar. Bir oyun dışarı sızarsa onu kimlerin
            açtığını buradan görebilirsin. Topluluktan günde en çok 20 oyun açılabilir.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            yukle(ogretmen.trim());
          }}
          className="flex flex-wrap gap-2"
        >
          <label htmlFor="kopya-ogretmen" className="sr-only">
            Öğretmen adına göre süz
          </label>
          <input
            id="kopya-ogretmen"
            value={ogretmen}
            onChange={(e) => setOgretmen(e.target.value)}
            placeholder="öğretmen adı (boş: hepsi)"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button type="submit" className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg">
            Süz
          </button>
        </form>
        {liste === null && <p className="text-sm text-gray-400">Yükleniyor…</p>}
        {liste && "error" in liste && (
          <p role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            {liste.status === 401 ? "Giriş yap; bu sayfa yöneticilere açık." : liste.error}
          </p>
        )}
        {Array.isArray(liste) && liste.length === 0 && (
          <p className="bg-white border border-dashed border-gray-300 rounded-2xl p-6 text-center text-sm text-gray-500">Kayıt yok.</p>
        )}
        {Array.isArray(liste) && liste.length > 0 && (
          <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
            <table className="w-full text-sm">
              <caption className="sr-only">Oyun açma kaydı, en yeni önce</caption>
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th scope="col" className="px-3 py-2 font-medium">Zaman</th>
                  <th scope="col" className="px-3 py-2 font-medium">Öğretmen</th>
                  <th scope="col" className="px-3 py-2 font-medium">Kaynak</th>
                  <th scope="col" className="px-3 py-2 font-medium">Oyun</th>
                </tr>
              </thead>
              <tbody>
                {liste.map((k, i) => (
                  <tr key={`${k.tarih}-${i}`} className="border-b border-gray-50 last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{zaman(k.tarih)}</td>
                    <th scope="row" className="px-3 py-2 font-medium text-gray-900 text-left">
                      {k.kullaniciAdi}
                    </th>
                    <td className="px-3 py-2">{TUR_ADI[k.tur]}</td>
                    <td className="px-3 py-2">{k.baslik}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import YonetimBasligi from "@/components/YonetimBasligi";
import { YZ_TURU_ADI, type Olculer } from "@/lib/yzMaliyet";
import type { YzMaliyetYaniti } from "@/lib/yzMaliyetRaporu";

const sayi = (n: number) => n.toLocaleString("tr-TR");
const dolar = (mikro: number) => (mikro / 1_000_000).toLocaleString("tr-TR", { style: "currency", currency: "USD", maximumFractionDigits: 4 });
const tl = (mikro: number, kur: number) => ((mikro / 1_000_000) * kur).toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 });
const ayAdi = (ay: string) => new Date(`${ay}-15T12:00:00Z`).toLocaleDateString("tr-TR", { month: "long", year: "numeric" });

function Tutar({ o, kur }: { o: Olculer; kur: number }) {
  return (
    <>
      <span className="tabular-nums">{tl(o.mikrodolar, kur)}</span>
      <span className="block text-xs text-gray-400 tabular-nums">{dolar(o.mikrodolar)}</span>
      {o.fiyatsiz > 0 && <span className="block text-xs text-amber-700">{sayi(o.fiyatsiz)} çağrı fiyatsız</span>}
    </>
  );
}

// Ücretli yapay zekâ çağrılarının aylık kullanımı; tutarlar koddaki fiyat varsayımlarıyla TAHMİNDİR.
export default function YzMaliyetClient() {
  const [ay, setAy] = useState<string | null>(null);
  const [r, setR] = useState<YzMaliyetYaniti | { error: string; status: number } | null>(null);

  const yukle = useCallback(async (secilen: string | null) => {
    setR(null);
    try {
      const res = await fetch(`/api/yonetim/yz-maliyet${secilen ? `?ay=${secilen}` : ""}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      setR(res.ok ? (j as YzMaliyetYaniti) : { error: j.error ?? "Rapor okunamadı.", status: res.status });
    } catch {
      setR({ error: "Bağlantı kurulamadı.", status: 0 });
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => yukle(ay));
    return () => clearTimeout(t);
  }, [ay, yukle]);

  const hazir = r && !("error" in r) ? r : null;
  const kur = hazir?.varsayimlar.dolarKuru.tl ?? 0;
  const fiyatMetni = (n: number | undefined) => (n ?? 0).toLocaleString("tr-TR");

  return (
    <div className="min-h-screen bg-gray-50">
      <YonetimBasligi baslik="Yapay zekâ maliyeti" genislik="max-w-5xl" />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Yapay zekâ maliyeti</h1>
            <p className="text-sm text-gray-500">Ücretli çağrıların sayısı, tokenları ve tahmini tutarı. Tutarlar fiyat varsayımlarıyla hesaplanır; sağlayıcının faturası esastır.</p>
          </div>
          {hazir && (
            <div>
              <label htmlFor="maliyet-ay" className="block text-xs font-semibold text-gray-600 mb-1">
                Ay
              </label>
              <select id="maliyet-ay" value={hazir.ay} onChange={(e) => setAy(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                {hazir.aylar.map((a) => (
                  <option key={a} value={a}>
                    {ayAdi(a)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {r && "error" in r && (
          <p role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            {r.status === 401 ? "Giriş yap; bu sayfa yöneticilere açık." : r.error}
          </p>
        )}
        {!r && <p className="text-sm text-gray-400">Yükleniyor…</p>}

        {hazir && (
          <>
            <section aria-label="Toplam" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white border border-gray-200 rounded-2xl p-4">
                <p className="text-2xl font-bold text-gray-900">
                  <Tutar o={hazir.toplam} kur={kur} />
                </p>
                <p className="text-xs text-gray-500 mt-1">Tahmini toplam</p>
              </div>
              {(
                [
                  ["Çağrı", hazir.toplam.cagri],
                  ["Giriş + önbellek token", hazir.toplam.giris + hazir.toplam.onbellek],
                  ["Çıkış token", hazir.toplam.cikis],
                ] as const
              ).map(([ad, n]) => (
                <div key={ad} className="bg-white border border-gray-200 rounded-2xl p-4">
                  <p className="text-2xl font-bold text-gray-900 tabular-nums">{sayi(n)}</p>
                  <p className="text-xs text-gray-500 mt-1">{ad}</p>
                </div>
              ))}
            </section>

            {hazir.toplam.cagri === 0 ? (
              <p className="text-sm text-gray-500 bg-white border border-dashed border-gray-300 rounded-2xl p-6 text-center">Bu ay kayıtlı yapay zekâ çağrısı yok.</p>
            ) : (
              <>
                <section aria-label="Tür ve model" className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="text-left text-sm font-bold text-gray-900 px-4 pt-3">Tür ve modele göre</caption>
                    <thead>
                      <tr className="text-left text-xs text-gray-500">
                        <th className="px-4 py-2">Tür</th>
                        <th className="px-4 py-2">Model</th>
                        <th className="px-4 py-2 text-right">Çağrı</th>
                        <th className="px-4 py-2 text-right">Giriş / çıkış token</th>
                        <th className="px-4 py-2 text-right">Görsel</th>
                        <th className="px-4 py-2 text-right">Tahmini</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {hazir.turler.map((t) => (
                        <tr key={`${t.tur}|${t.model}`}>
                          <td className="px-4 py-2">{YZ_TURU_ADI[t.tur]}</td>
                          <td className="px-4 py-2 font-mono text-xs">{t.model}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{sayi(t.olculer.cagri)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {sayi(t.olculer.giris + t.olculer.onbellek)} / {sayi(t.olculer.cikis)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{t.olculer.gorsel ? sayi(t.olculer.gorsel) : "—"}</td>
                          <td className="px-4 py-2 text-right">
                            <Tutar o={t.olculer} kur={kur} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                <section aria-label="Okul" className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="text-left text-sm font-bold text-gray-900 px-4 pt-3">Okula göre</caption>
                    <thead>
                      <tr className="text-left text-xs text-gray-500">
                        <th className="px-4 py-2">Okul</th>
                        <th className="px-4 py-2 text-right">Çağrı</th>
                        <th className="px-4 py-2 text-right">Görsel</th>
                        <th className="px-4 py-2 text-right">Tahmini</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {hazir.okullar.map((o) => (
                        <tr key={o.okulId ?? "yok"}>
                          <td className="px-4 py-2">{o.okulId ? (o.okulAdi ?? "Kapatılmış okul") : "Okulsuz öğretmen ve platform"}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{sayi(o.olculer.cagri)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{o.olculer.gorsel ? sayi(o.olculer.gorsel) : "—"}</td>
                          <td className="px-4 py-2 text-right">
                            <Tutar o={o.olculer} kur={kur} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </>
            )}

            <section aria-label="Varsayımlar" className="text-xs text-gray-600 bg-white border border-gray-200 rounded-2xl p-4 space-y-1">
              <p className="font-semibold text-gray-900">Fiyat varsayımları</p>
              <p>
                Kur: 1 $ = {fiyatMetni(hazir.varsayimlar.dolarKuru.tl)} TL ({hazir.varsayimlar.dolarKuru.tarih}; {hazir.varsayimlar.dolarKuru.kaynak}).
              </p>
              {Object.entries(hazir.varsayimlar.token).map(([model, f]) => (
                <p key={model}>
                  <span className="font-mono">{model}</span>: 1 milyon token {fiyatMetni(f.giris)} $ giriş, {fiyatMetni(f.cikis)} $ çıkış, {fiyatMetni(f.onbellek)} $ önbellek. {f.kaynak}.
                </p>
              ))}
              {Object.entries(hazir.varsayimlar.gorsel).map(([model, f]) => (
                <p key={model}>
                  <span className="font-mono">{model}</span>:{" "}
                  {Object.entries(f.fiyat)
                    .map(([k, v]) => `${k} kalite görsel başı ${fiyatMetni(v)} dolar`)
                    .join(", ")}
                  . {f.kaynak}.
                </p>
              ))}
              <p>Fiyatı bilinmeyen modelin çağrıları &quot;fiyatsız&quot; sayılır; tutara eklenmez. Kişi bazında kayıt tutulmaz.</p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

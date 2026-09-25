"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DerseraLogo from "@/components/DerseraLogo";
import { GOREV_TUR_ADI } from "@/app/composer/labels";
import { OGRENME, type Oneri, type OgrenmeRaporuOzeti } from "@/lib/ogrenme";

type Veri = { rapor: OgrenmeRaporuOzeti; talimatlar: string[]; oneriler: Oneri[] };

const yuzde = (o: number | null) => (o === null ? "—" : `%${Math.round(o * 100)}`);
const zaman = (ms: number) => new Date(ms).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const turAdi = (t: string) => (GOREV_TUR_ADI as Record<string, string>)[t] ?? t;
const ayAdi = (ay: string) => new Date(`${ay}-15T12:00:00Z`).toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
const buAy = () => new Date().toISOString().slice(0, 7);
const oncekiAy = (ay: string) => {
  const [y, m] = ay.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};
const DURUM_ADI: Record<Oneri["durum"], { ad: string; sinif: string }> = {
  bekliyor: { ad: "Karar bekliyor", sinif: "bg-amber-50 text-amber-800 border-amber-200" },
  aktif: { ad: "Onaylı · istemde", sinif: "bg-green-50 text-green-800 border-green-200" },
  reddedildi: { ad: "Reddedildi", sinif: "bg-gray-50 text-gray-600 border-gray-200" },
  pasif: { ad: "Geri alındı", sinif: "bg-gray-50 text-gray-600 border-gray-200" },
};

function Tablo({ baslik, basliklar, satirlar, bos }: { baslik: string; basliklar: string[]; satirlar: (string | number)[][]; bos: string }) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold text-gray-900">{baslik}</h2>
      {satirlar.length === 0 ? (
        <p className="bg-white border border-dashed border-gray-300 rounded-xl p-4 text-sm text-gray-500">{bos}</p>
      ) : (
        <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
          <table className="w-full text-sm">
            <caption className="sr-only">{baslik}</caption>
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                {basliklar.map((b) => (
                  <th key={b} scope="col" className="px-3 py-2 font-medium">
                    {b}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {satirlar.map((s, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  {s.map((h, j) =>
                    j === 0 ? (
                      <th key={j} scope="row" className="px-3 py-2 font-medium text-gray-900 text-left">
                        {h}
                      </th>
                    ) : (
                      <td key={j} className="px-3 py-2">
                        {h}
                      </td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Öğrenme döngüsü: kural tabanlı rapor → yapay zekâ önerisi → yönetici onayı → oluşturma istemine ek kural (geri alınabilir).
export default function OgrenmeClient() {
  const [ay, setAy] = useState(buAy);
  const [veri, setVeri] = useState<Veri | { error: string; status: number } | null>(null);
  const [calisiyor, setCalisiyor] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<{ tur: "hata" | "tamam"; metin: string } | null>(null);

  const yukle = useCallback(async (a: string) => {
    try {
      const res = await fetch(`/api/yonetim/ogrenme?ay=${a}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      setVeri(res.ok ? (json as Veri) : { error: json.error ?? "Rapor okunamadı.", status: res.status });
    } catch {
      setVeri({ error: "Bağlantı kurulamadı.", status: 0 });
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => yukle(ay));
    return () => clearTimeout(t);
  }, [yukle, ay]);

  async function oneriIste() {
    setCalisiyor("oneri");
    setMesaj(null);
    const res = await fetch("/api/yonetim/ogrenme/oneri", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ay }) }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setCalisiyor(null);
    if (!res?.ok) setMesaj({ tur: "hata", metin: json.error ?? "Öneri üretilemedi." });
    else setMesaj({ tur: "tamam", metin: json.oneriler.length ? `${json.oneriler.length} öneri geldi; aşağıda karar ver.` : "Yapay zekâ bu veriden öneri çıkarmadı." });
    yukle(ay);
  }

  async function karar(o: Oneri, k: "onayla" | "reddet" | "geri-al") {
    if (k === "onayla" && !window.confirm(`Bu kural bundan sonra oluşturulan oyunların istemine eklenecek:\n\n"${o.kural}"\n\nOnaylıyor musun?`)) return;
    setCalisiyor(o.id);
    setMesaj(null);
    const res = await fetch(`/api/yonetim/ogrenme/oneri/${o.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ karar: k }) }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setCalisiyor(null);
    if (!res?.ok) setMesaj({ tur: "hata", metin: json.error ?? "Karar kaydedilemedi." });
    yukle(ay);
  }

  const r = veri && "rapor" in veri ? veri.rapor : null;
  const yeterli = !!r && (r.toplam.uretim >= OGRENME.enAzUretim || r.toplam.deneme >= OGRENME.enAzDeneme);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-900 text-white px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <DerseraLogo />
            <p className="text-xs font-semibold text-indigo-200 border-l border-indigo-700 pl-3">Öğrenme döngüsü</p>
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
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Öğrenme döngüsü</h1>
            <p className="text-sm text-gray-500 max-w-2xl">
              Oyun üretiminin toplu ve kimliksiz sinyalleri: öğrencilerin ilk denemede doğru ve destek oranları, öğretmenlerin düzelttiği görev türleri, doğrulama ve
              içerik denetimi. Yapay zekâ bu rapordan öneri yazar; yalnız senin onayladığın öneri oluşturma istemine eklenir ve istediğin an geri alınır.
            </p>
          </div>
          <div role="group" aria-label="Ay" className="flex gap-2">
            {[buAy(), oncekiAy(buAy())].map((a) => (
              <button
                key={a}
                onClick={() => setAy(a)}
                aria-pressed={ay === a}
                className={`text-sm font-semibold px-3 py-1.5 rounded-lg border ${ay === a ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700 border-gray-300"}`}
              >
                {ayAdi(a)}
              </button>
            ))}
          </div>
        </div>

        {veri === null && <p className="text-sm text-gray-400">Yükleniyor…</p>}
        {veri && "error" in veri && (
          <p role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            {veri.status === 401 ? "Giriş yap; bu sayfa yöneticilere açık." : veri.error}
          </p>
        )}
        {mesaj && (
          <p role={mesaj.tur === "hata" ? "alert" : "status"} className={`rounded-xl p-3 text-sm border ${mesaj.tur === "hata" ? "bg-red-50 border-red-200 text-red-700" : "bg-green-50 border-green-200 text-green-800"}`}>
            {mesaj.metin}
          </p>
        )}

        {r && veri && "rapor" in veri && (
          <>
            <p className="text-sm text-gray-700">
              {ayAdi(r.ay)}: <strong>{r.toplam.uretim}</strong> oyun üretimi, <strong>{r.toplam.deneme}</strong> öğrenci durak denemesi. Oranlar en az {OGRENME.enAzOrnek} örnekle gösterilir.
            </p>
            <Tablo
              baslik="Görev türleri"
              basliklar={["Görev türü", "Üretilen", "Düzenlenen", "Düzenlenme oranı", "YZ ile güncellenen", "Öğrenci denemesi", "İlk denemede doğru", "Destek görevi açılan"]}
              satirlar={r.turler.map((t) => [turAdi(t.tur), t.uretilen, t.duzenlenen, yuzde(t.duzenlenmeOrani), t.yzGuncellenen, t.deneme, yuzde(t.ilkDenemeOrani), yuzde(t.destekOrani)])}
              bos="Bu ay veri yok."
            />
            <Tablo
              baslik="Ders ve sınıf"
              basliklar={["Ders", "Sınıf", "Üretim", "Geçersiz çıkan", "Bitiren öğrenci", "Öğrenci denemesi", "İlk denemede doğru"]}
              satirlar={r.dersler.map((d) => [d.ders, d.sinif, d.uretim, yuzde(d.gecersizOrani), d.bitiren, d.deneme, yuzde(d.ilkDenemeOrani)])}
              bos="Bu ay veri yok."
            />
            <div className="grid md:grid-cols-2 gap-6">
              <Tablo baslik="Sık doğrulama bulguları" basliklar={["Kod", "Sayı"]} satirlar={r.kodlar.map((k) => [k.kod, k.sayi])} bos="Doğrulama bulgusu yok." />
              <Tablo baslik="İçerik denetimi" basliklar={["Kategori", "Ağırlık", "Sayı"]} satirlar={r.denetim.map((d) => [d.kategori, d.agirlik, d.sayi])} bos="Denetim bulgusu yok." />
            </div>
            <section className="space-y-2">
              <h2 className="font-semibold text-gray-900">Son yapay zekâ güncelleme talimatları</h2>
              {veri.talimatlar.length === 0 ? (
                <p className="bg-white border border-dashed border-gray-300 rounded-xl p-4 text-sm text-gray-500">Talimat yok.</p>
              ) : (
                <ul className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 text-sm">
                  {veri.talimatlar.map((t, i) => (
                    <li key={i} className="px-3 py-2 text-gray-700">
                      {t}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-gray-900">Öneriler ve onaylı kurallar</h2>
                <button
                  onClick={oneriIste}
                  disabled={calisiyor !== null || !yeterli}
                  className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40"
                >
                  {calisiyor === "oneri" ? "Öneriler hazırlanıyor…" : "✨ Yapay zekâdan öneri iste"}
                </button>
              </div>
              {!yeterli && (
                <p className="text-xs text-gray-500">
                  Öneri için bu ay en az {OGRENME.enAzUretim} oyun üretimi ya da {OGRENME.enAzDeneme} öğrenci denemesi gerekir.
                </p>
              )}
              {veri.oneriler.length === 0 ? (
                <p className="bg-white border border-dashed border-gray-300 rounded-xl p-4 text-sm text-gray-500">Henüz öneri yok.</p>
              ) : (
                <ul className="space-y-2">
                  {veri.oneriler.map((o) => (
                    <li key={o.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-xs border rounded-full px-2 py-0.5 ${DURUM_ADI[o.durum].sinif}`}>{DURUM_ADI[o.durum].ad}</span>
                        <h3 className="font-semibold text-gray-900">{o.baslik}</h3>
                        <span className="text-xs text-gray-500">
                          {o.kapsam.ders ?? "Tüm dersler"} · {o.kapsam.sinif ? `${o.kapsam.sinif}. sınıf` : "tüm sınıflar"} · {zaman(o.tarih)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">“{o.kural}”</p>
                      <p className="text-xs text-gray-600">Gerekçe: {o.gerekce}</p>
                      {o.karar && (
                        <p className="text-xs text-gray-500">
                          Karar: {o.karar.yonetici} · {zaman(o.karar.tarih)}
                        </p>
                      )}
                      <div className="flex gap-2">
                        {o.durum === "bekliyor" && (
                          <>
                            <button onClick={() => karar(o, "onayla")} disabled={calisiyor !== null} className="text-sm bg-green-600 text-white font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40">
                              Onayla (isteme ekle)
                            </button>
                            <button onClick={() => karar(o, "reddet")} disabled={calisiyor !== null} className="text-sm border border-gray-300 text-gray-700 font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40">
                              Reddet
                            </button>
                          </>
                        )}
                        {o.durum === "aktif" && (
                          <button onClick={() => karar(o, "geri-al")} disabled={calisiyor !== null} className="text-sm border border-red-300 text-red-700 font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40">
                            Geri al (istemden çıkar)
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

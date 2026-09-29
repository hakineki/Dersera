"use client";

import { useCallback, useEffect, useState } from "react";
import YonetimBasligi from "@/components/YonetimBasligi";
import YonetimIslemListesi from "@/components/YonetimIslemListesi";
import type { okulAyrintisi, okulListesi } from "@/lib/okulYonetimi";

type Liste = Awaited<ReturnType<typeof okulListesi>>;
type Ayrinti = Extract<Awaited<ReturnType<typeof okulAyrintisi>>, { ok: true }>["value"];
type Hata = { error: string; status: number };

const tarih = (t: number) => new Date(t).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
const sayi = (n: number) => n.toLocaleString("tr-TR");

async function istek<T>(url: string, govde?: unknown): Promise<T | Hata> {
  try {
    const res = await fetch(url, govde === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(govde) });
    const j = await res.json().catch(() => ({}));
    return res.ok ? (j as T) : { error: j.error ?? "İşlem yapılamadı.", status: res.status };
  } catch {
    return { error: "Bağlantı kurulamadı.", status: 0 };
  }
}
const hataMi = (r: unknown): r is Hata => !!r && typeof r === "object" && "error" in r;

// Platform yöneticisi: okul listesi, üyeler, yöneticiliği devretme ve okulu kapatma.
export default function OkullarClient() {
  const [liste, setListe] = useState<Liste | Hata | null>(null);
  const [secili, setSecili] = useState<string | null>(null);
  const [bildirim, setBildirim] = useState<string | null>(null);

  const listele = useCallback(async () => setListe(await istek<Liste>("/api/yonetim/okullar")), []);
  useEffect(() => {
    const t = setTimeout(listele);
    return () => clearTimeout(t);
  }, [listele]);

  const hazir = liste && !hataMi(liste) ? liste : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <YonetimBasligi baslik="Okullar" genislik="max-w-5xl" />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Okullar</h1>
          <p className="text-sm text-gray-500">Bir okulu seçip üyelerini gör, yöneticiliği başka bir öğretmene devret ya da okulu kapat.</p>
        </div>

        {hataMi(liste) && (
          <p role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            {liste.status === 401 ? "Giriş yap; bu sayfa yöneticilere açık." : liste.error}
          </p>
        )}
        {!liste && <p className="text-sm text-gray-400">Yükleniyor…</p>}

        {hazir && (
          <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
            <section aria-label="Okul listesi" className="bg-white border border-gray-200 rounded-2xl overflow-x-auto self-start">
              {hazir.okullar.length === 0 ? (
                <p className="text-sm text-gray-500 p-6 text-center">Henüz okul yok.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500">
                      <th className="px-4 py-2">Okul</th>
                      <th className="px-4 py-2">Yönetici</th>
                      <th className="px-4 py-2 text-right">Üye</th>
                      <th className="px-4 py-2 text-right">Paylaşım</th>
                      <th className="px-4 py-2 text-right">Havuz (bu ay)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {hazir.okullar.map((o) => (
                      <tr key={o.id} className={secili === o.id ? "bg-indigo-50" : undefined}>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSecili(o.id);
                              setBildirim(null);
                            }}
                            aria-pressed={secili === o.id}
                            className="font-semibold text-indigo-700 hover:underline text-left"
                          >
                            {o.ad}
                          </button>
                          {o.kapaniyor && <span className="ml-2 text-xs font-semibold text-amber-800 bg-amber-100 rounded-full px-2 py-0.5">Kapatılıyor</span>}
                        </td>
                        <td className="px-4 py-2 text-gray-600">{o.yonetici ?? "—"}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{sayi(o.uyeSayisi)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{sayi(o.paylasimSayisi)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{o.havuz.hak > 0 ? `${sayi(o.havuz.kullanilan)} / ${sayi(o.havuz.hak)}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <div className="space-y-6">
              {secili ? (
                <OkulAyrintisi
                  key={secili}
                  id={secili}
                  degisti={(kapanan) => {
                    if (kapanan) {
                      setSecili(null);
                      setBildirim(kapanan);
                    }
                    listele();
                  }}
                />
              ) : (
                <>
                  {bildirim && (
                    <p role="status" className="text-sm rounded-lg p-2 bg-green-50 text-green-800">
                      {bildirim}
                    </p>
                  )}
                  <p className="text-sm text-gray-500 bg-white border border-dashed border-gray-300 rounded-2xl p-6 text-center">Ayrıntı için listeden bir okul seç.</p>
                </>
              )}
              <YonetimIslemListesi islemler={hazir.islemler} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// degisti: devredince null, kapatınca bildirim metni.
function OkulAyrintisi({ id, degisti }: { id: string; degisti: (kapanan: string | null) => void }) {
  const [a, setA] = useState<Ayrinti | Hata | null>(null);
  const [yeni, setYeni] = useState("");
  const [devirNeden, setDevirNeden] = useState("");
  const [kapatNeden, setKapatNeden] = useState("");
  const [onayAdi, setOnayAdi] = useState("");
  const [sifre, setSifre] = useState("");
  const [mesaj, setMesaj] = useState<{ tur: "hata" | "tamam"; metin: string } | null>(null);
  const [calisiyor, setCalisiyor] = useState(false);

  const yukle = useCallback(async () => setA(await istek<Ayrinti>(`/api/yonetim/okullar/${id}`)), [id]);
  useEffect(() => {
    const t = setTimeout(yukle);
    return () => clearTimeout(t);
  }, [yukle]);

  if (!a) return <p className="text-sm text-gray-400">Yükleniyor…</p>;
  if (hataMi(a))
    return (
      <p role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
        {a.error}
      </p>
    );

  const ogretmenler = a.uyeler.filter((u) => u.rol === "ogretmen");

  async function devret() {
    setCalisiyor(true);
    setMesaj(null);
    const r = await istek<{ yonetici: string | null }>(`/api/yonetim/okullar/${id}/devret`, { hesapId: yeni, neden: devirNeden });
    setCalisiyor(false);
    if (hataMi(r)) return setMesaj({ tur: "hata", metin: r.error });
    setYeni("");
    setDevirNeden("");
    setMesaj({ tur: "tamam", metin: `Yöneticilik ${r.yonetici ?? "seçilen öğretmene"} devredildi.` });
    await yukle();
    degisti(null);
  }

  async function kapat() {
    setCalisiyor(true);
    setMesaj(null);
    const r = await istek<{ uye: number; paylasim: number }>(`/api/yonetim/okullar/${id}/kapat`, { okulAdi: onayAdi, sifre, neden: kapatNeden });
    setCalisiyor(false);
    setSifre("");
    if (hataMi(r)) return setMesaj({ tur: "hata", metin: r.error });
    degisti(`${a && !hataMi(a) ? a.ad : "Okul"} kapatıldı: ${r.uye} üyelik ve ${r.paylasim} paylaşım kaldırıldı.`);
  }

  return (
    <section aria-label="Okul ayrıntısı" className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 break-words">{a.ad}</h2>
        <p className="text-xs text-gray-500">Açılış: {tarih(a.olusturma)}</p>
        {a.kapaniyor && <p className="text-xs font-semibold text-amber-800 mt-1">Kapatma yarım kaldı; aşağıdan yeniden çalıştır.</p>}
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <dt className="text-gray-500">Paylaşılan oyun</dt>
        <dd>{sayi(a.paylasimSayisi)}</dd>
        <dt className="text-gray-500">Kredi havuzu (bu ay)</dt>
        <dd>{a.havuz.hak > 0 ? `${sayi(a.havuz.kullanilan)} / ${sayi(a.havuz.hak)}${a.havuz.sinir ? ` (öğretmen başı ${sayi(a.havuz.sinir)})` : ""}` : "Yok"}</dd>
      </dl>

      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-1">Üyeler ({a.uyeler.length})</h3>
        <ul className="text-sm divide-y divide-gray-100">
          {a.uyeler.map((u) => (
            <li key={u.hesapId} className="py-1 flex justify-between gap-2">
              <span className="break-all">{u.kullaniciAdi ?? "silinmiş hesap"}</span>
              <span className="text-xs text-gray-500 whitespace-nowrap">{u.rol === "yonetici" ? "Okul yöneticisi" : "Öğretmen"}</span>
            </li>
          ))}
        </ul>
      </div>

      {mesaj && (
        <p role={mesaj.tur === "hata" ? "alert" : "status"} className={`text-sm rounded-lg p-2 ${mesaj.tur === "hata" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}>
          {mesaj.metin}
        </p>
      )}

      {!a.kapaniyor && (
        <div className="border-t border-gray-100 pt-4 space-y-2">
          <h3 className="text-sm font-bold text-gray-900">Yöneticiliği devret</h3>
          {ogretmenler.length === 0 ? (
            <p className="text-xs text-gray-500">Okulda devredilecek başka öğretmen yok. Okulu kapatabilirsin.</p>
          ) : (
            <>
              <p className="text-xs text-gray-500">Eski yönetici okulda öğretmen olarak kalır; davet kodunu ve okul panosunu artık yeni yönetici görür.</p>
              <label htmlFor="devir-yeni" className="block text-xs font-semibold text-gray-600">
                Yeni yönetici
              </label>
              <select id="devir-yeni" value={yeni} onChange={(e) => setYeni(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">Seç…</option>
                {ogretmenler.map((u) => (
                  <option key={u.hesapId} value={u.hesapId}>
                    {u.kullaniciAdi ?? "silinmiş hesap"}
                  </option>
                ))}
              </select>
              <label htmlFor="devir-neden" className="block text-xs font-semibold text-gray-600">
                Gerekçe
              </label>
              <p className="text-xs text-gray-400">Gerekçe işlem kaydında kalır; kişisel bilgi yazma.</p>
              <input id="devir-neden" value={devirNeden} onChange={(e) => setDevirNeden(e.target.value)} maxLength={300} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <button type="button" disabled={calisiyor || !yeni || devirNeden.trim().length < 3} onClick={devret} className="text-sm font-semibold rounded-lg px-3 py-2 text-white bg-indigo-600 disabled:opacity-50">
                Yöneticiliği devret
              </button>
            </>
          )}
        </div>
      )}

      <div className="border-t border-gray-100 pt-4 space-y-2">
        <h3 className="text-sm font-bold text-red-700">Okulu kapat</h3>
        <p className="text-xs text-gray-500">Davet kodu, bütün üyelikler, okul kütüphanesindeki paylaşımlar ve kredi havuzu silinir. Öğretmen hesapları ve kişisel kütüphaneleri kalır. Geri alınamaz.</p>
        <label htmlFor="kapat-neden" className="block text-xs font-semibold text-gray-600">
          Gerekçe
        </label>
        <p className="text-xs text-gray-400">Gerekçe işlem kaydında kalır; kişisel bilgi yazma.</p>
        <input id="kapat-neden" value={kapatNeden} onChange={(e) => setKapatNeden(e.target.value)} maxLength={300} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <label htmlFor="kapat-onay" className="block text-xs font-semibold text-gray-600">
          Onay için okulun adını yaz: <span className="font-mono">{a.ad}</span>
        </label>
        <input id="kapat-onay" value={onayAdi} onChange={(e) => setOnayAdi(e.target.value)} autoComplete="off" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <label htmlFor="kapat-sifre" className="block text-xs font-semibold text-gray-600">
          Kendi şifren
        </label>
        <input id="kapat-sifre" type="password" value={sifre} onChange={(e) => setSifre(e.target.value)} autoComplete="current-password" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <button
          type="button"
          disabled={calisiyor || onayAdi.trim().toLocaleLowerCase("tr-TR") !== a.ad.toLocaleLowerCase("tr-TR") || !sifre || kapatNeden.trim().length < 3}
          onClick={kapat}
          className="text-sm font-semibold rounded-lg px-3 py-2 text-white bg-red-600 disabled:opacity-50"
        >
          {a.kapaniyor ? "Kapatmayı tamamla" : "Okulu kapat"}
        </button>
      </div>
    </section>
  );
}

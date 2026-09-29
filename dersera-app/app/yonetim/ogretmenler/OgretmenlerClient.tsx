"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import YonetimBasligi from "@/components/YonetimBasligi";
import YonetimIslemListesi from "@/components/YonetimIslemListesi";
import type { ogretmenAyrintisi, ogretmenListesi } from "@/lib/ogretmenYonetimi";

type Liste = Awaited<ReturnType<typeof ogretmenListesi>>;
type Ayrinti = Extract<Awaited<ReturnType<typeof ogretmenAyrintisi>>, { ok: true }>["value"];
type Hata = { error: string; status: number };

const tarih = (t: number) => new Date(t).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
const zaman = (t: number) => new Date(t).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

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

// Platform yöneticisi: öğretmen arama, ayrıntı, askıya alma / geri açma ve hesabı silme.
export default function OgretmenlerClient() {
  const [q, setQ] = useState("");
  const [liste, setListe] = useState<Liste | Hata | null>(null);
  const [secili, setSecili] = useState<string | null>(null);
  const [bildirim, setBildirim] = useState<string | null>(null);

  const listele = useCallback(async (sorgu: string) => {
    setListe(await istek<Liste>(`/api/yonetim/ogretmenler${sorgu ? `?q=${encodeURIComponent(sorgu)}` : ""}`));
  }, []);
  useEffect(() => {
    const t = setTimeout(() => listele(q.trim()), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, listele]);

  const hazir = liste && !hataMi(liste) ? liste : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <YonetimBasligi baslik="Öğretmenler" genislik="max-w-5xl" />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Öğretmenler</h1>
          <p className="text-sm text-gray-500">Kullanıcı adıyla ara; bir öğretmeni seçip ayrıntısını gör, askıya al ya da hesabını sil.</p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[12rem]">
            <label htmlFor="ogretmen-ara" className="block text-xs font-semibold text-gray-600 mb-1">
              Kullanıcı adı
            </label>
            <input id="ogretmen-ara" type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={40} placeholder="ör. ayse" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" />
          </div>
          {hazir && (
            <p className="text-sm text-gray-500 pb-2">
              {hazir.eslesen} / {hazir.toplam} öğretmen{hazir.eslesen > hazir.ogretmenler.length ? ` (ilk ${hazir.ogretmenler.length} gösteriliyor)` : ""}
            </p>
          )}
        </div>

        {hataMi(liste) && (
          <p role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            {liste.status === 401 ? "Giriş yap; bu sayfa yöneticilere açık." : liste.error}
          </p>
        )}
        {!liste && <p className="text-sm text-gray-400">Yükleniyor…</p>}

        {hazir && (
          <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
            <section aria-label="Öğretmen listesi" className="bg-white border border-gray-200 rounded-2xl overflow-x-auto self-start">
              {hazir.ogretmenler.length === 0 ? (
                <p className="text-sm text-gray-500 p-6 text-center">Eşleşen öğretmen yok.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500">
                      <th className="px-4 py-2">Kullanıcı adı</th>
                      <th className="px-4 py-2">Okul</th>
                      <th className="px-4 py-2">Kayıt</th>
                      <th className="px-4 py-2">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {hazir.ogretmenler.map((o) => (
                      <tr key={o.id} className={secili === o.id ? "bg-indigo-50" : undefined}>
                        <td className="px-4 py-2">
                          <button type="button" onClick={() => {
                              setSecili(o.id);
                              setBildirim(null);
                            }} aria-pressed={secili === o.id} className="font-semibold text-indigo-700 hover:underline text-left">
                            {o.kullaniciAdi}
                          </button>
                        </td>
                        <td className="px-4 py-2 text-gray-600">{o.okulAdi ?? "—"}</td>
                        <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{tarih(o.olusturma)}</td>
                        <td className="px-4 py-2">{o.askida ? <span className="text-xs font-semibold text-amber-800 bg-amber-100 rounded-full px-2 py-0.5">Askıda</span> : <span className="text-xs text-gray-500">Etkin</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <div className="space-y-6">
              {secili ? (
                <OgretmenAyrintisi
                  key={secili}
                  id={secili}
                  degisti={(silinen) => {
                    if (silinen) {
                      setSecili(null);
                      setBildirim(`${silinen} hesabı ve verileri silindi.`);
                    }
                    listele(q.trim());
                  }}
                />
              ) : (
                <>
                  {bildirim && (
                    <p role="status" className="text-sm rounded-lg p-2 bg-green-50 text-green-800">
                      {bildirim}
                    </p>
                  )}
                  <p className="text-sm text-gray-500 bg-white border border-dashed border-gray-300 rounded-2xl p-6 text-center">Ayrıntı için listeden bir öğretmen seç.</p>
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

// E-postasız öğretmen için tek kullanımlık şifre sıfırlama bağlantısı; bağlantı yalnız burada bir kez görünür.
function SifirlamaBaglantisi({ id }: { id: string }) {
  const [neden, setNeden] = useState("");
  const [baglanti, setBaglanti] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [kopyalandi, setKopyalandi] = useState(false);
  const [calisiyor, setCalisiyor] = useState(false);

  async function uret() {
    setCalisiyor(true);
    setHata(null);
    const r = await istek<{ baglanti: string }>(`/api/yonetim/ogretmenler/${id}/sifirlama`, { neden });
    setCalisiyor(false);
    if (hataMi(r)) return setHata(r.error);
    setBaglanti(r.baglanti);
    setNeden("");
  }

  return (
    <div className="border-t border-gray-100 pt-4 space-y-2">
      <h3 className="text-sm font-bold text-gray-900">Şifre sıfırlama bağlantısı</h3>
      <p className="text-xs text-gray-500">Şifresini unutan ve doğrulanmış e-postası olmayan öğretmen için. 1 saat geçerli, tek kullanımlık; öğretmene güvenli bir yoldan (yüz yüze, okul içi yazışma) kendin ilet.</p>
      {baglanti ? (
        <div className="space-y-2">
          <input readOnly value={baglanti} aria-label="Sıfırlama bağlantısı" onFocus={(e) => e.currentTarget.select()} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50" />
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(baglanti);
                setKopyalandi(true);
              } catch {
                setKopyalandi(false);
              }
            }}
            className="text-sm font-semibold rounded-lg px-3 py-2 text-indigo-700 border border-indigo-200"
          >
            {kopyalandi ? "Kopyalandı" : "Kopyala"}
          </button>
        </div>
      ) : (
        <>
          <label htmlFor="sifirlama-neden" className="block text-xs font-semibold text-gray-600">
            Gerekçe
          </label>
          <input id="sifirlama-neden" value={neden} onChange={(e) => setNeden(e.target.value)} maxLength={300} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          {hata && (
            <p role="alert" className="text-sm rounded-lg p-2 bg-red-50 text-red-700">
              {hata}
            </p>
          )}
          <button type="button" disabled={calisiyor || neden.trim().length < 3} onClick={uret} className="text-sm font-semibold rounded-lg px-3 py-2 text-white bg-indigo-600 disabled:opacity-50">
            Bağlantı üret
          </button>
        </>
      )}
    </div>
  );
}

// degisti: askı değişince null, silinince silinen kullanıcı adı.
function OgretmenAyrintisi({ id, degisti }: { id: string; degisti: (silinen: string | null) => void }) {
  const [a, setA] = useState<Ayrinti | Hata | null>(null);
  const [neden, setNeden] = useState("");
  const [silNeden, setSilNeden] = useState("");
  const [onayAdi, setOnayAdi] = useState("");
  const [sifre, setSifre] = useState("");
  const [mesaj, setMesaj] = useState<{ tur: "hata" | "tamam"; metin: string } | null>(null);
  const [calisiyor, setCalisiyor] = useState(false);

  const yukle = useCallback(async () => setA(await istek<Ayrinti>(`/api/yonetim/ogretmenler/${id}`)), [id]);
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

  const askida = !!a.aski?.askida;
  const korumali = a.platformYoneticisi;

  async function askiDegistir() {
    setCalisiyor(true);
    setMesaj(null);
    const r = await istek<{ askida: boolean }>(`/api/yonetim/ogretmenler/${id}/aski`, { askida: !askida, neden });
    setCalisiyor(false);
    if (hataMi(r)) return setMesaj({ tur: "hata", metin: r.error });
    setNeden("");
    setMesaj({ tur: "tamam", metin: r.askida ? "Hesap askıya alındı; oturumları kapandı." : "Hesap geri açıldı; öğretmen yeniden giriş yapabilir." });
    await yukle();
    degisti(null);
  }

  async function sil() {
    setCalisiyor(true);
    setMesaj(null);
    const r = await istek<{ ok: true }>(`/api/yonetim/ogretmenler/${id}/sil`, { kullaniciAdi: onayAdi, sifre, neden: silNeden });
    setCalisiyor(false);
    setSifre("");
    if (hataMi(r)) return setMesaj({ tur: "hata", metin: r.error });
    degisti(a && !hataMi(a) ? a.kullaniciAdi : "Öğretmen");
  }

  return (
    <section aria-label="Öğretmen ayrıntısı" className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 break-all">{a.kullaniciAdi}</h2>
        <p className="text-xs text-gray-500">Kayıt: {tarih(a.olusturma)}</p>
        {korumali && <p className="text-xs font-semibold text-indigo-700 mt-1">Platform yöneticisi</p>}
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <dt className="text-gray-500">Okul</dt>
        <dd>{a.okul ? `${a.okul.ad}${a.okul.rol === "yonetici" ? " (okul yöneticisi)" : ""}` : "—"}</dd>
        <dt className="text-gray-500">Bu ay kalan kredi</dt>
        <dd>
          {a.kredi.aylikKalan} / {a.kredi.aylikHak}
        </dd>
        <dt className="text-gray-500">Kazanılan kredi</dt>
        <dd>{a.kredi.kazanilan}</dd>
        <dt className="text-gray-500">Kütüphanedeki oyun</dt>
        <dd>{a.oyunSayisi}</dd>
        <dt className="text-gray-500">Topluluk kaydı</dt>
        <dd>{a.toplulukKayitSayisi}</dd>
        <dt className="text-gray-500">Doğrulanmış e-posta</dt>
        <dd>{a.epostaDogrulanmis ? "Var (kendisi sıfırlayabilir)" : "Yok"}</dd>
        <dt className="text-gray-500">Durum</dt>
        <dd>{askida ? `Askıda (${zaman(a.aski!.zaman)})` : "Etkin"}</dd>
      </dl>
      {askida && a.aski!.neden && <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2">Askı gerekçesi: {a.aski!.neden}</p>}

      {mesaj && (
        <p role={mesaj.tur === "hata" ? "alert" : "status"} className={`text-sm rounded-lg p-2 ${mesaj.tur === "hata" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}>
          {mesaj.metin}
        </p>
      )}

      {!korumali && (
        <>
          <SifirlamaBaglantisi id={id} />

          <div className="border-t border-gray-100 pt-4 space-y-2">
            <h3 className="text-sm font-bold text-gray-900">{askida ? "Geri aç" : "Askıya al"}</h3>
            <p className="text-xs text-gray-500">{askida ? "Öğretmen yeniden giriş yapabilir." : "Öğretmenin bütün oturumları kapanır, giriş yapamaz. Verileri silinmez; öğrencilerin süren oyunları etkilenmez."}</p>
            <label htmlFor="aski-neden" className="block text-xs font-semibold text-gray-600">
              Gerekçe{askida ? " (isteğe bağlı)" : ""}
            </label>
            <p className="text-xs text-gray-400">Gerekçe işlem kaydında kalır; öğrenci ya da öğretmen hakkında kişisel bilgi yazma.</p>
            <input id="aski-neden" value={neden} onChange={(e) => setNeden(e.target.value)} maxLength={300} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <button type="button" disabled={calisiyor || (!askida && neden.trim().length < 3)} onClick={askiDegistir} className={`text-sm font-semibold rounded-lg px-3 py-2 text-white disabled:opacity-50 ${askida ? "bg-indigo-600" : "bg-amber-600"}`}>
              {askida ? "Hesabı geri aç" : "Hesabı askıya al"}
            </button>
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-2">
            <h3 className="text-sm font-bold text-red-700">Hesabı kalıcı olarak sil</h3>
            <p className="text-xs text-gray-500">Hesap, kütüphane, koleksiyonlar, okul paylaşımları ve kredi kayıtları silinir; topluluktaki oyunları geri çekilir. Geri alınamaz.</p>
            {a.okul?.rol === "yonetici" && (
              <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2">
                Bu öğretmen okul yöneticisi: silmeden önce{" "}
                <Link href="/yonetim/okullar" className="underline font-semibold">
                  Okullar
                </Link>{" "}
                sayfasından yöneticiliği devret ya da okulu kapat.
              </p>
            )}
            <label htmlFor="sil-neden" className="block text-xs font-semibold text-gray-600">
              Gerekçe
            </label>
            <p className="text-xs text-gray-400">Gerekçe işlem kaydında kalır; kişisel bilgi yazma.</p>
            <input id="sil-neden" value={silNeden} onChange={(e) => setSilNeden(e.target.value)} maxLength={300} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <label htmlFor="sil-onay" className="block text-xs font-semibold text-gray-600">
              Onay için kullanıcı adını yaz: <span className="font-mono">{a.kullaniciAdi}</span>
            </label>
            <input id="sil-onay" value={onayAdi} onChange={(e) => setOnayAdi(e.target.value)} autoComplete="off" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <label htmlFor="sil-sifre" className="block text-xs font-semibold text-gray-600">
              Kendi şifren
            </label>
            <input id="sil-sifre" type="password" value={sifre} onChange={(e) => setSifre(e.target.value)} autoComplete="current-password" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <button
              type="button"
              disabled={calisiyor || onayAdi.trim().toLocaleLowerCase("tr-TR") !== a.kullaniciAdi || !sifre || silNeden.trim().length < 3}
              onClick={sil}
              className="text-sm font-semibold rounded-lg px-3 py-2 text-white bg-red-600 disabled:opacity-50"
            >
              Hesabı kalıcı olarak sil
            </button>
          </div>
        </>
      )}
    </section>
  );
}

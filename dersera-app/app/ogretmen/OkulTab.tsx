"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { davetYenile, okulaKatil, okulBilgisi, okuldanAyril, okulOlustur, okulPanosu, okulPaylasimKaldir, okulPaylasimlari, uyeCikar } from "@/lib/okulClient";
import type { OkulumYaniti, PanoOgretmeni, PaylasimListesiOgesi } from "@/lib/okulService";
import { OKUL } from "@/lib/okul";

const tarih = (ms: number) => new Date(ms).toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
const girdi = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

function OkulYok({ onOkul }: { onOkul: (o: OkulumYaniti) => void }) {
  const [ad, setAd] = useState("");
  const [kod, setKod] = useState("");
  const [hata, setHata] = useState<{ yer: "kur" | "katil"; mesaj: string } | null>(null);
  const [calisiyor, setCalisiyor] = useState(false);

  async function yap(yer: "kur" | "katil") {
    setCalisiyor(true);
    setHata(null);
    const r = yer === "kur" ? await okulOlustur(ad) : await okulaKatil(kod);
    setCalisiyor(false);
    if ("error" in r) setHata({ yer, mesaj: r.error });
    else onOkul(r);
  }

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          yap("katil");
        }}
        className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3"
      >
        <h3 className="font-semibold text-gray-900">Okuluna katıl</h3>
        <p className="text-sm text-gray-600">Okul yöneticinden aldığın davet kodunu yaz.</p>
        <label htmlFor="okul-davet" className="block text-xs font-medium text-gray-600">
          Davet kodu
        </label>
        <input id="okul-davet" value={kod} onChange={(e) => setKod(e.target.value)} placeholder="ör. ABCD-EFGH" autoComplete="off" className={`${girdi} font-mono uppercase`} />
        {hata?.yer === "katil" && (
          <p role="alert" className="text-sm text-red-600">
            {hata.mesaj}
          </p>
        )}
        <button type="submit" disabled={calisiyor || kod.trim().length < 8} className="w-full bg-indigo-600 text-white font-semibold py-2 rounded-lg disabled:opacity-40">
          Katıl
        </button>
      </form>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          yap("kur");
        }}
        className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3"
      >
        <h3 className="font-semibold text-gray-900">Okulunu oluştur</h3>
        <p className="text-sm text-gray-600">Okulu oluşturan okul yöneticisi olur; diğer öğretmenleri davet koduyla eklersin.</p>
        <label htmlFor="okul-ad" className="block text-xs font-medium text-gray-600">
          Okul adı
        </label>
        <input id="okul-ad" value={ad} onChange={(e) => setAd(e.target.value)} maxLength={OKUL.adEnCok} placeholder="ör. Atatürk Ortaokulu" className={girdi} />
        {hata?.yer === "kur" && (
          <p role="alert" className="text-sm text-red-600">
            {hata.mesaj}
          </p>
        )}
        <button type="submit" disabled={calisiyor || ad.trim().length < OKUL.adEnAz} className="w-full border border-indigo-300 text-indigo-700 font-semibold py-2 rounded-lg disabled:opacity-40">
          Okulu oluştur
        </button>
      </form>
    </div>
  );
}

function OkulKutuphanesi({ oyunlar, onYenile }: { oyunlar: PaylasimListesiOgesi[] | null; onYenile: () => void }) {
  const [hata, setHata] = useState("");
  async function kaldir(o: PaylasimListesiOgesi) {
    if (!window.confirm(`"${o.baslik}" okul kütüphanesinden kaldırılsın mı? Öğretmenlerin kendi kopyaları etkilenmez.`)) return;
    const r = await okulPaylasimKaldir(o.id);
    if ("error" in r) setHata(r.error);
    else onYenile();
  }
  return (
    <section aria-labelledby="okul-kutuphanesi" className="space-y-2">
      <h3 id="okul-kutuphanesi" className="font-semibold text-gray-900">
        Okul kütüphanesi
      </h3>
      <p className="text-sm text-gray-500">Okulundaki öğretmenlerin paylaştığı oyunlar. “Kullan” oyunu kendi kütüphanene kopya olarak açar. Paylaşmak için Kütüphane sekmesinde oyun kartındaki “Okulla paylaş”ı kullan.</p>
      {hata && (
        <p role="alert" className="text-sm text-red-600">
          {hata}
        </p>
      )}
      {oyunlar === null && <p className="text-sm text-gray-400">Yükleniyor…</p>}
      {oyunlar?.length === 0 && <p className="bg-white border border-dashed border-gray-300 rounded-2xl p-5 text-center text-sm text-gray-500">Henüz paylaşılan oyun yok.</p>}
      {oyunlar && oyunlar.length > 0 && (
        <ul className="space-y-2">
          {oyunlar.map((o) => (
            <li key={o.id} className="bg-white border border-gray-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 truncate">{o.baslik}</p>
                <p className="text-xs text-gray-600">
                  {o.sinif}. sınıf · {o.ders} · {o.konu} · {o.sure_dk} dk
                </p>
                <p className="text-xs text-gray-400">
                  {o.paylasanAd} · {tarih(o.tarih)}
                </p>
              </div>
              <Link href={`/composer?okul=${o.id}`} className="text-sm bg-indigo-600 text-white font-semibold px-3 py-1.5 rounded-lg">
                Kullan
              </Link>
              {o.kaldirabilir && (
                <button onClick={() => kaldir(o)} className="text-sm text-red-600 font-semibold px-2 py-1.5 rounded-lg hover:bg-red-50">
                  Kaldır
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OkulPanosu() {
  const [pano, setPano] = useState<{ ogretmenler: PanoOgretmeni[]; toplam: { ogretmen: number; kutuphaneOyun: number; paylasim: number; ogrenci: number } } | null>(null);
  const [hata, setHata] = useState("");
  const yukle = useCallback(async () => {
    const r = await okulPanosu();
    if ("error" in r) setHata(r.error);
    else setPano(r);
  }, []);
  useEffect(() => {
    const t = setTimeout(yukle);
    return () => clearTimeout(t);
  }, [yukle]);

  async function cikar(o: PanoOgretmeni) {
    if (!window.confirm(`${o.kullaniciAdi} okuldan çıkarılsın mı? Kendi kütüphanesi ve paylaştığı oyunlar kalır.`)) return;
    const r = await uyeCikar(o.hesapId);
    if ("error" in r) setHata(r.error);
    else yukle();
  }

  return (
    <section aria-labelledby="okul-panosu" className="space-y-2">
      <h3 id="okul-panosu" className="font-semibold text-gray-900">
        Okul panosu
      </h3>
      {hata && (
        <p role="alert" className="text-sm text-red-600">
          {hata}
        </p>
      )}
      {!pano && !hata && <p className="text-sm text-gray-400">Yükleniyor…</p>}
      {pano && (
        <>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ["Öğretmen", pano.toplam.ogretmen],
              ["Kütüphanedeki oyun", pano.toplam.kutuphaneOyun],
              ["Okulda paylaşılan", pano.toplam.paylasim],
              ["Bitiren öğrenci", pano.toplam.ogrenci],
            ].map(([ad, deger]) => (
              <div key={ad} className="bg-white border border-gray-200 rounded-xl px-3 py-2">
                <dt className="text-xs text-gray-500">{ad}</dt>
                <dd className="font-bold text-gray-900">{deger}</dd>
              </div>
            ))}
          </dl>
          <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
            <table className="w-full text-sm">
              <caption className="sr-only">Okuldaki öğretmenler</caption>
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th scope="col" className="px-3 py-2 font-medium">Öğretmen</th>
                  <th scope="col" className="px-3 py-2 font-medium">Kütüphane</th>
                  <th scope="col" className="px-3 py-2 font-medium">Paylaşım</th>
                  <th scope="col" className="px-3 py-2 font-medium">Öğrenci</th>
                  <th scope="col" className="px-3 py-2 font-medium">Puan</th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    <span className="sr-only">İşlem</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pano.ogretmenler.map((o) => (
                  <tr key={o.hesapId} className="border-b border-gray-50 last:border-0">
                    <th scope="row" className="px-3 py-2 font-medium text-gray-900 text-left">
                      {o.kullaniciAdi}
                      {o.rol === "yonetici" && <span className="ml-2 text-[11px] bg-indigo-50 text-indigo-700 rounded px-1.5 py-0.5">yönetici</span>}
                    </th>
                    <td className="px-3 py-2">{o.kutuphaneOyun}</td>
                    <td className="px-3 py-2">{o.paylasim}</td>
                    <td className="px-3 py-2">{o.ogrenci}</td>
                    <td className="px-3 py-2">{o.puanOrtalama === null ? "—" : o.puanOrtalama.toLocaleString("tr-TR")}</td>
                    <td className="px-3 py-2 text-right">
                      {o.rol !== "yonetici" && (
                        <button onClick={() => cikar(o)} className="text-xs text-red-600 font-semibold hover:underline">
                          Çıkar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500">Öğrenci puanı 5 oyda bir güncellenir; öğrenci sayısı öğretmenlerin kütüphane oyunlarını bitiren öğrencilerdir.</p>
        </>
      )}
    </section>
  );
}

export default function OkulTab() {
  const [bilgi, setBilgi] = useState<OkulumYaniti | null>(null);
  const [oyunlar, setOyunlar] = useState<PaylasimListesiOgesi[] | null>(null);
  const [hata, setHata] = useState("");
  const [kopyalandi, setKopyalandi] = useState(false);
  const [yenileniyor, setYenileniyor] = useState(false);

  const yukle = useCallback(async () => {
    const r = await okulBilgisi();
    if ("error" in r) return setHata(r.error);
    setBilgi(r);
    if (r.okul) {
      const l = await okulPaylasimlari();
      setOyunlar("error" in l ? [] : l.oyunlar);
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(yukle);
    return () => clearTimeout(t);
  }, [yukle]);

  async function yenile() {
    if (!window.confirm("Yeni davet kodu oluşturulsun mu? Eski kod artık çalışmaz.")) return;
    setYenileniyor(true);
    const r = await davetYenile();
    setYenileniyor(false);
    if ("error" in r) setHata(r.error);
    else setBilgi((b) => (b?.okul ? { ...b, okul: { ...b.okul, davetKodu: r.davetKodu } } : b));
  }
  async function ayril() {
    if (!window.confirm("Okuldan ayrılmak istiyor musun? Kendi kütüphanen kalır; okul kütüphanesini artık göremezsin.")) return;
    const r = await okuldanAyril();
    if ("error" in r) setHata(r.error);
    else {
      setOyunlar(null);
      yukle();
    }
  }

  if (hata && !bilgi) {
    return (
      <p role="alert" className="text-sm text-red-600">
        {hata}
      </p>
    );
  }
  if (!bilgi) return <p className="text-sm text-gray-400">Yükleniyor…</p>;
  if (!bilgi.okul) return <OkulYok onOkul={() => yukle()} />;

  const kod = bilgi.okul.davetKodu;
  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-gray-500">Okulun</p>
          <h2 className="text-lg font-bold text-gray-900">{bilgi.okul.ad}</h2>
          <p className="text-sm text-gray-600">
            {bilgi.rol === "yonetici" ? "Okul yöneticisisin" : "Öğretmensin"} · {bilgi.okul.uyeSayisi} öğretmen
          </p>
        </div>
        {kod ? (
          <div className="text-right">
            <p className="text-xs text-gray-500">Davet kodu (öğretmenlere ver)</p>
            <p className="font-mono text-xl font-bold tracking-widest text-indigo-900">
              {kod.slice(0, 4)}-{kod.slice(4)}
            </p>
            <div className="flex gap-2 justify-end mt-1">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(kod).then(() => setKopyalandi(true), () => undefined);
                }}
                className="text-xs text-indigo-700 font-semibold hover:underline"
              >
                {kopyalandi ? "Kopyalandı" : "Kopyala"}
              </button>
              <button onClick={yenile} disabled={yenileniyor} className="text-xs text-gray-600 font-semibold hover:underline disabled:opacity-50">
                {yenileniyor ? "Yenileniyor…" : "Yeni kod"}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={ayril} className="text-sm text-red-600 font-semibold hover:underline">
            Okuldan ayrıl
          </button>
        )}
      </div>
      {hata && (
        <p role="alert" className="text-sm text-red-600">
          {hata}
        </p>
      )}
      <OkulKutuphanesi oyunlar={oyunlar} onYenile={yukle} />
      {bilgi.rol === "yonetici" && <OkulPanosu />}
    </div>
  );
}

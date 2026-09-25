"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { davetYenile, okulaKatil, okulBilgisi, okuldanAyril, okulKrediSiniri, okulOlustur, okulPanosu, okulPaylasimKaldir, okulPaylasimlari, uyeCikar } from "@/lib/okulClient";
import type { OkulPanosu as Pano, OkulumYaniti, PanoHavuzu, PanoOgretmeni, PaylasimListesiOgesi } from "@/lib/okulService";
import { OKUL } from "@/lib/okul";
import { OKUL_HAVUZU, type OkulKredisi } from "@/lib/kredi";
import { krediDurumuGetir } from "@/lib/krediClient";

const tarih = (ms: number) => new Date(ms).toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
const ayAdi = (ay: string) => new Date(`${ay}-15T12:00:00Z`).toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
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
              <Link href={`/demo?okul=${o.id}`} title="Öğrenci gözüyle dene (sonuç kaydedilmez)" className="text-sm border border-gray-300 text-gray-700 font-semibold px-3 py-1.5 rounded-lg">
                👁 Demo
              </Link>
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

// Okul yöneticisi: bu ayki havuz ve öğretmen başına aylık sınır.
function KrediHavuzu({ havuz, onDegisti }: { havuz: PanoHavuzu | null; onDegisti: () => void }) {
  const [sinir, setSinir] = useState(String(havuz?.sinir ?? ""));
  const [durum, setDurum] = useState<{ hata?: string; tamam?: string }>({});
  const [calisiyor, setCalisiyor] = useState(false);
  if (!havuz) {
    return (
      <p className="bg-white border border-dashed border-gray-300 rounded-xl p-3 text-sm text-gray-500">
        Okuluna kredi havuzu atanmamış. Havuz, Dersera ile yapılan okul anlaşmasına göre platform yöneticisince atanır; öğretmenler o zamana kadar kendi kredilerini kullanır.
      </p>
    );
  }
  async function kaydet() {
    const deger = sinir.trim() === "" ? 0 : Number(sinir);
    setCalisiyor(true);
    setDurum({});
    const r = await okulKrediSiniri(deger);
    setCalisiyor(false);
    if ("error" in r) setDurum({ hata: r.error });
    else {
      setDurum({ tamam: r.sinir ? `Öğretmen başına aylık sınır: ${r.sinir} kredi.` : "Öğretmen başına sınır kaldırıldı." });
      onDegisti();
    }
  }
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
      <p className="text-sm text-gray-800">
        <span aria-hidden="true">💳 </span>
        <strong>Okul kredi havuzu</strong> ({ayAdi(havuz.ay)}): {havuz.kullanilan}/{havuz.hak} kullanıldı · <strong>{havuz.kalan} kredi kaldı</strong>
      </p>
      <p className="text-xs text-gray-500">Öğretmenler önce kendi aylık hakkını, bitince okul havuzunu, en son kazandıkları krediyi kullanır. Havuz her ay başında yenilenir.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          kaydet();
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <div>
          <label htmlFor="okul-sinir" className="block text-xs font-medium text-gray-600">
            Öğretmen başına aylık sınır (boş: sınır yok)
          </label>
          <input
            id="okul-sinir"
            type="number"
            inputMode="numeric"
            min={0}
            max={OKUL_HAVUZU.sinirEnCok}
            value={sinir}
            onChange={(e) => setSinir(e.target.value)}
            placeholder="sınır yok"
            className="w-32 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button type="submit" disabled={calisiyor} className="text-sm bg-indigo-600 text-white font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40">
          Kaydet
        </button>
      </form>
      {durum.hata && (
        <p role="alert" className="text-sm text-red-600">
          {durum.hata}
        </p>
      )}
      {durum.tamam && (
        <p role="status" className="text-sm text-green-700">
          {durum.tamam}
        </p>
      )}
    </div>
  );
}

// onHavuzDegisti: sınır değişince üstteki "kullanabileceğin" satırı da yenilensin.
function OkulPanosu({ onHavuzDegisti }: { onHavuzDegisti: () => void }) {
  const [pano, setPano] = useState<Pano | null>(null);
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
          <KrediHavuzu
            havuz={pano.havuz}
            onDegisti={() => {
              yukle();
              onHavuzDegisti();
            }}
          />
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
                  {pano.havuz && (
                    <th scope="col" className="px-3 py-2 font-medium">
                      Havuzdan
                    </th>
                  )}
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
                    {pano.havuz && (
                      <td className="px-3 py-2">
                        {o.havuzdan}
                        {pano.havuz.sinir && <span className="text-gray-400">/{pano.havuz.sinir}</span>}
                      </td>
                    )}
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
  const [okulKredisi, setOkulKredisi] = useState<OkulKredisi | null>(null);
  // Durum yeniden çizilmeden gelen ikinci tıklamayı da engeller (her yenileme eski kodu geçersiz kılar).
  const yenilemeKilidi = useRef(false);

  const yukle = useCallback(async () => {
    const r = await okulBilgisi();
    if ("error" in r) return setHata(r.error);
    setBilgi(r);
    if (r.okul) {
      const [l, k] = await Promise.all([okulPaylasimlari(), krediDurumuGetir()]);
      setOyunlar("error" in l ? [] : l.oyunlar);
      setOkulKredisi(k?.okul ?? null);
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(yukle);
    return () => clearTimeout(t);
  }, [yukle]);

  async function yenile() {
    if (yenilemeKilidi.current || !window.confirm("Yeni davet kodu oluşturulsun mu? Eski kod artık çalışmaz.")) return;
    yenilemeKilidi.current = true;
    setYenileniyor(true);
    const r = await davetYenile();
    yenilemeKilidi.current = false;
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
          {okulKredisi && (
            <p className="text-sm text-gray-700 mt-1">
              <span aria-hidden="true">💳 </span>Okul havuzundan bu ay kullanabileceğin: <strong>{okulKredisi.kalan} kredi</strong>
              {okulKredisi.sinir !== null && <span className="text-gray-500"> (sınır {okulKredisi.sinir}, kullandığın {okulKredisi.kullandigin})</span>}
            </p>
          )}
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
      {bilgi.rol === "yonetici" && <OkulPanosu onHavuzDegisti={() => krediDurumuGetir().then((k) => setOkulKredisi(k?.okul ?? null))} />}
    </div>
  );
}

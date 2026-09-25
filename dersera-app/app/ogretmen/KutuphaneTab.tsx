"use client";

import { useCallback, useEffect, useState } from "react";
import { okullaPaylas } from "@/lib/okulClient";
import Link from "next/link";
import { DURATION_PRESETS_MIN, publishWindowMinutes } from "@/lib/games";
import { PUAN_KOVASI } from "@/lib/istatistik";
import type { KutuphaneKaydi, KutuphaneListeOgesi } from "@/lib/library";
import { kutuphanedenSil, kutuphanedenYayinla, kutuphaneListesi, kutuphaneOyunu } from "@/lib/libraryClient";
import { TOPLULUK_KURALLARI } from "@/lib/topluluk";
import { ogretmenPuaniGetir, ogretmenPuaniVer, toplulugaGonder, topluluktanGeriCekIstegi, type OgretmenPuaniDurumu } from "@/lib/toplulukClient";
import { krediDurumuGetir, krediMetni } from "@/lib/krediClient";
import type { KrediDurumu } from "@/lib/kredi";
import type { TeacherGame } from "@/lib/teacherGame";
import { DENEYIM_SECENEKLERI, GOREV_TUR_ADI } from "@/app/composer/labels";

const tarih = (ms: number) => new Date(ms).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });

function Onizleme({ oyun }: { oyun: KutuphaneKaydi }) {
  const d = oyun.definition;
  return (
    <div className="mt-3 border-t border-gray-100 pt-3 space-y-2 text-sm">
      <p className="text-gray-700">{d.hikaye_giris}</p>
      <ol className="space-y-1.5">
        {d.duraklar.map((durak, i) => (
          <li key={durak.id} className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="font-semibold text-gray-900">
              {i + 1}. {durak.isim} <span className="text-xs font-normal text-indigo-600">{GOREV_TUR_ADI[durak.gorev.tur]}</span>
              {durak.sahne_turu === "secim" && <span className="text-xs font-normal text-amber-600"> · Seçim</span>}
            </p>
            <p className="text-gray-600">{durak.gorev.soru}</p>
          </li>
        ))}
        <li className="bg-indigo-50 rounded-lg px-3 py-2">
          <p className="font-semibold text-indigo-900">Final</p>
          <p className="text-indigo-800">{d.final.soru}</p>
        </li>
      </ol>
    </div>
  );
}

const PUAN_ADI = ["Zayıf", "Geliştirilmeli", "İyi", "Çok iyi", "Mükemmel"];

// Topluluktan alınan oyun: topluluğun öğretmen puanı, öğretmenin kendi puanı ve puan verme (sınıfında oynattıysa).
export function OgretmenPuaniBolumu({ toplulukId }: { toplulukId: string }) {
  const [d, setD] = useState<OgretmenPuaniDurumu | null>(null);
  const [hata, setHata] = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);
  useEffect(() => {
    let iptal = false;
    ogretmenPuaniGetir(toplulukId).then((x) => !iptal && setD(x));
    return () => {
      iptal = true;
    };
  }, [toplulukId]);
  if (!d) return null;

  async function ver(puan: number) {
    setGonderiliyor(true);
    setHata("");
    const r = await ogretmenPuaniVer(toplulukId, puan);
    setGonderiliyor(false);
    if ("error" in r) setHata(r.error);
    else setD(r);
  }

  return <OgretmenPuaniGorunumu d={d} onVer={ver} gonderiliyor={gonderiliyor} hata={hata} />;
}

export function OgretmenPuaniGorunumu({ d, onVer, gonderiliyor, hata }: { d: OgretmenPuaniDurumu; onVer: (puan: number) => void; gonderiliyor: boolean; hata: string }) {
  return (
    <div className="mt-2 text-xs text-gray-600 space-y-1">
      <p>
        <span aria-hidden="true">🍎 </span>Topluluk oyunu · öğretmen puanı:{" "}
        {d.ortalama === null ? `${TOPLULUK_KURALLARI.ogretmenPuaniGosterim} öğretmen puanlayınca görünür` : `${d.ortalama.toLocaleString("tr-TR")} / 5 (${d.sayi} öğretmen)`}
      </p>
      {d.uygun ? (
        <fieldset disabled={gonderiliyor} className="flex items-center gap-1 flex-wrap">
          <legend className="sr-only">Bu oyuna puanın</legend>
          <span>{d.benim ? "Senin puanın:" : "Sınıfında oynattın; puanın:"}</span>
          {PUAN_ADI.map((ad, i) => (
            <button
              key={ad}
              type="button"
              onClick={() => onVer(i + 1)}
              aria-pressed={d.benim === i + 1}
              aria-label={`${i + 1} yıldız: ${ad}`}
              className={`w-8 h-8 text-lg leading-none ${d.benim && i < d.benim ? "" : "opacity-30 grayscale"} hover:opacity-100 hover:grayscale-0`}
            >
              <span aria-hidden="true">⭐</span>
            </button>
          ))}
        </fieldset>
      ) : (
        d.neden && <p className="text-gray-500">{d.neden}</p>
      )}
      {hata && (
        <p role="alert" className="text-red-600">
          {hata}
        </p>
      )}
    </div>
  );
}

// Topluluk paylaşımı: durum, eşik gerekçeleri, paylaş / geri çek.
// Okul içi paylaşım: topluluk incelemesi yok; aynı oyun yeniden paylaşılınca okuldaki kopya güncellenir.
function OkulPaylasimBolumu({ oyun, okulAdi, onYenile }: { oyun: KutuphaneListeOgesi; okulAdi: string; onYenile: () => void }) {
  const [durum, setDurum] = useState<{ tur: "bos" | "calisiyor" | "tamam" | "hata"; mesaj?: string }>({ tur: "bos" });
  const paylasildi = !!oyun.okulPaylasimi;
  async function paylas() {
    setDurum({ tur: "calisiyor" });
    const r = await okullaPaylas(oyun.id);
    if ("error" in r) return setDurum({ tur: "hata", mesaj: r.error });
    setDurum({ tur: "tamam", mesaj: paylasildi ? `${okulAdi} kütüphanesindeki kopya güncellendi.` : `${okulAdi} ile paylaşıldı.` });
    onYenile();
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <button onClick={paylas} disabled={durum.tur === "calisiyor"} className="border border-indigo-200 text-indigo-700 font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">
        <span aria-hidden="true">🏫 </span>
        {durum.tur === "calisiyor" ? "Paylaşılıyor…" : paylasildi ? "Okulda güncelle" : "Okulla paylaş"}
      </button>
      {paylasildi && durum.tur === "bos" && <span className="text-xs text-gray-500">Okul kütüphanesinde</span>}
      {durum.mesaj && (
        <span role={durum.tur === "hata" ? "alert" : "status"} className={`text-xs ${durum.tur === "hata" ? "text-red-600" : "text-green-700"}`}>
          {durum.mesaj}
        </span>
      )}
    </div>
  );
}

export function ToplulukBolumu({ oyun, onYenile }: { oyun: KutuphaneListeOgesi; onYenile: () => void }) {
  const [calisiyor, setCalisiyor] = useState(false);
  const [hata, setHata] = useState("");
  const t = oyun.topluluk;
  const toplulukta = !!t && (t.durum === "inceleme" || t.durum === "yayinda" || t.oncekiYayinda);

  async function paylas() {
    setCalisiyor(true);
    setHata("");
    const r = await toplulugaGonder(oyun.id);
    setCalisiyor(false);
    if ("error" in r) return setHata(r.error);
    onYenile();
  }

  async function geriCek() {
    if (!window.confirm(`"${oyun.baslik}" topluluktan kaldırılsın mı? Diğer öğretmenler artık göremez.`)) return;
    setCalisiyor(true);
    setHata("");
    const r = await topluluktanGeriCekIstegi(oyun.id);
    setCalisiyor(false);
    if (r !== true) return setHata(r.error);
    onYenile();
  }

  const paylasEtiketi = t?.durum === "yayinda" ? "Güncel sürümü gönder" : t?.durum === "reddedildi" ? "Düzeltip yeniden gönder" : "🌐 Toplulukta paylaş";
  // Hiç oynanmamış ve hiç gönderilmemiş oyunda kapalı düğme ve eksik listesi yerine kısa bir not (başlangıç döneminde
  // oynanmamış oyun da gönderilebilir).
  if (!t && oyun.ogrenci_sayisi === 0 && !oyun.paylasim.uygun) {
    return <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500">Sınıfta oynatıldıkça topluluğa gönderebilirsin.</p>;
  }
  return (
    <div className="mt-3 border-t border-gray-100 pt-3 text-sm space-y-2">
      {t?.durum === "inceleme" && (
        <p className="text-amber-800">
          <span aria-hidden="true">🕒 </span>Toplulukta incelemede: {t.kabul}/{TOPLULUK_KURALLARI.gerekliKabul} öğretmen kabul etti.
          {t.oncekiYayinda && " Önceki sürüm toplulukta kalıyor."}
        </p>
      )}
      {t?.durum === "yayinda" && (
        <p className="text-green-700">
          <span aria-hidden="true">🌐 </span>Toplulukta yayında.
        </p>
      )}
      {t?.durum === "reddedildi" && (
        <div className="text-red-700">
          <p>
            Topluluk incelemesinden geçmedi.{t.oncekiYayinda && " Önceki sürüm toplulukta kalıyor."} Öğretmenlerin notları:
          </p>
          <ul className="list-disc list-inside text-red-600">
            {t.retNotlari.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {t?.durum !== "inceleme" && (
          <button
            onClick={paylas}
            disabled={calisiyor || !oyun.paylasim.uygun}
            className="border border-green-600 text-green-700 font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:border-gray-300 disabled:text-gray-500"
          >
            {calisiyor ? "Gönderiliyor…" : paylasEtiketi}
          </button>
        )}
        {toplulukta && (
          <button onClick={geriCek} disabled={calisiyor} className="text-gray-600 font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50">
            Topluluktan geri çek
          </button>
        )}
      </div>
      {oyun.paylasim.nedenler.length > 0 && t?.durum !== "inceleme" && (
        <p className="text-xs text-gray-500">Topluluğa göndermek için: {oyun.paylasim.nedenler.join(" · ")}</p>
      )}
      {hata && (
        <p role="alert" className="text-red-600">
          {hata}
        </p>
      )}
    </div>
  );
}

function OyunKarti({
  oyun,
  okulAdi,
  onYayinlandi,
  onSilindi,
  onYenile,
}: {
  oyun: KutuphaneListeOgesi;
  okulAdi: string | null;
  onYayinlandi: (tg: TeacherGame) => void;
  onSilindi: (id: string) => void;
  onYenile: () => void;
}) {
  const [onizleme, setOnizleme] = useState<KutuphaneKaydi | null>(null);
  const [yukleniyor, setYukleniyor] = useState<"onizle" | "yayinla" | "sil" | null>(null);
  const [sure, setSure] = useState(publishWindowMinutes(oyun.sure_dk));
  const [hata, setHata] = useState("");
  const sureler = [...new Set([publishWindowMinutes(oyun.sure_dk), ...DURATION_PRESETS_MIN])].sort((a, b) => a - b);

  async function onizle() {
    if (onizleme) return setOnizleme(null);
    setYukleniyor("onizle");
    setHata("");
    const tam = await kutuphaneOyunu(oyun.id);
    if (tam) setOnizleme(tam.oyun);
    else setHata("Önizleme yüklenemedi.");
    setYukleniyor(null);
  }

  async function yayinla() {
    setYukleniyor("yayinla");
    setHata("");
    const r = await kutuphanedenYayinla(oyun.id, sure);
    setYukleniyor(null);
    if ("error" in r) return setHata(r.error);
    onYayinlandi({ game: r.game, adminToken: r.adminToken });
  }

  async function sil() {
    if (!window.confirm(`"${oyun.baslik}" kütüphaneden kalıcı olarak silinsin mi? Bu işlem geri alınamaz.`)) return;
    setYukleniyor("sil");
    setHata("");
    if (await kutuphanedenSil(oyun.id)) onSilindi(oyun.id);
    else {
      setHata("Oyun silinemedi.");
      setYukleniyor(null);
    }
  }

  return (
    <li className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-gray-900">{oyun.baslik}</h3>
          <p className="text-sm text-gray-500">
            {oyun.sinif}. sınıf · {oyun.ders} · {oyun.konu}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {tarih(oyun.createdAt)} · {oyun.durakSayisi} durak · {oyun.sure_dk} dk ·{" "}
            {DENEYIM_SECENEKLERI.find((d) => d.key === oyun.deneyim)?.ad} · Sürüm {oyun.surum ?? 1}
          </p>
          {oyun.turetildigi && <p className="text-xs text-indigo-700 mt-0.5">“{oyun.turetildigi.baslik}” oyunundan türetilmiş varyant</p>}
          {oyun.topluluk_kaynagi && <OgretmenPuaniBolumu toplulukId={oyun.topluluk_kaynagi} />}
          <p className="text-xs text-gray-600 mt-1">
            <span aria-hidden="true">👥 </span>
            {oyun.ogrenci_sayisi} öğrenci ·{" "}
            <span aria-hidden="true">⭐ </span>
            {oyun.puan_ortalama === null
              ? `puan ${PUAN_KOVASI} oydan sonra görünür`
              : `${oyun.puan_ortalama.toLocaleString("tr-TR")} / 5 (${oyun.puan_sayisi}+ oy)`}
          </p>
        </div>
        {oyun.sonKod && (
          <div className="text-right shrink-0">
            <p className="text-[11px] text-gray-500">Son kod</p>
            <p className="font-mono font-bold text-indigo-700">{oyun.sonKod}</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <Link href={`/composer?kutuphane=${oyun.id}`} className="text-sm border border-indigo-300 text-indigo-700 font-semibold px-3 py-1.5 rounded-lg">
          Düzenle
        </Link>
        <button onClick={onizle} disabled={yukleniyor !== null} className="text-sm border border-gray-300 text-gray-700 font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">
          {yukleniyor === "onizle" ? "Yükleniyor…" : onizleme ? "Önizlemeyi kapat" : "Önizle"}
        </button>
        <Link href={`/demo?kutuphane=${oyun.id}`} title="Öğrenci gözüyle dene (sonuç kaydedilmez)" className="text-sm border border-gray-300 text-gray-700 font-semibold px-3 py-1.5 rounded-lg">
          👁 Demo
        </Link>
        <label className="text-sm text-gray-600 flex items-center gap-1">
          <span className="sr-only">Oyun süresi</span>
          <select value={sure} onChange={(e) => setSure(Number(e.target.value))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
            {sureler.map((s) => (
              <option key={s} value={s}>
                {s} dk açık
              </option>
            ))}
          </select>
        </label>
        <button onClick={yayinla} disabled={yukleniyor !== null} className="text-sm bg-indigo-600 text-white font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">
          {yukleniyor === "yayinla" ? "Yayınlanıyor…" : "Yayınla"}
        </button>
        <button onClick={sil} disabled={yukleniyor !== null} className="text-sm text-red-600 font-semibold px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50 ml-auto">
          {yukleniyor === "sil" ? "Siliniyor…" : "Sil"}
        </button>
      </div>
      {hata && (
        <p role="alert" className="text-sm text-red-600 mt-2">
          {hata}
        </p>
      )}
      <ToplulukBolumu oyun={oyun} onYenile={onYenile} />
      {okulAdi && <OkulPaylasimBolumu oyun={oyun} okulAdi={okulAdi} onYenile={onYenile} />}
      {onizleme && <Onizleme oyun={onizleme} />}
    </li>
  );
}

export default function KutuphaneTab({ onYayinlandi }: { onYayinlandi: (tg: TeacherGame) => void }) {
  const [oyunlar, setOyunlar] = useState<KutuphaneListeOgesi[] | null>(null);
  const [hesap, setHesap] = useState<{ toplulukHazir: boolean; kalanGun: number } | null>(null);
  const [baslangic, setBaslangic] = useState<{ kalan: number } | null>(null);
  const [okulAdi, setOkulAdi] = useState<string | null>(null);
  const [kredi, setKredi] = useState<KrediDurumu | null>(null);
  const [hata, setHata] = useState(false);

  const yukle = useCallback(async () => {
    setHata(false);
    const [liste, k] = await Promise.all([kutuphaneListesi(), krediDurumuGetir()]);
    setKredi(k);
    if (liste) {
      setOyunlar(liste.oyunlar);
      setHesap(liste.hesap);
      setBaslangic(liste.toplulukBaslangic);
      setOkulAdi(liste.okul?.ad ?? null);
    } else setHata(true);
  }, []);

  useEffect(() => {
    const t = setTimeout(yukle);
    return () => clearTimeout(t);
  }, [yukle]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Oyun Kütüphanesi</h2>
          <p className="text-sm text-gray-500">Composer&apos;da “Kütüphaneye kaydet” dediğin oyunlar burada saklanır; düzenleyip yeniden yayınlayabilirsin. Tekrar yayınlamak yeni oyun kodu üretir.</p>
        </div>
        <Link href="/composer" className="shrink-0 text-sm bg-indigo-600 text-white font-semibold px-3 py-2 rounded-lg">
          + Yeni Oyun
        </Link>
      </div>
      {kredi && (
        <p className="text-sm text-gray-700">
          <span aria-hidden="true">💳 </span>Kredin: <strong>{krediMetni(kredi)}</strong>. Oyun oluşturmak 2–4 kredi; yayınlamak, düzenlemek ve öğrencilerin oynaması ücretsiz.
        </p>
      )}
      {baslangic && (
        <p className="bg-green-50 border border-green-100 rounded-xl p-3 text-sm text-green-900">
          <span aria-hidden="true">🌱 </span>Topluluk başlangıç dönemi: ilk {TOPLULUK_KURALLARI.baslangicYayinSayisi} oyun öğretmen incelemesi beklemeden hemen
          toplulukta yayına girer ({baslangic.kalan} yer kaldı). Çocuk güvenliği ve içerik denetimi yine yapılır; bu dönemde topluluk kredi ödülü verilmez.
        </p>
      )}
      {hesap && !hesap.toplulukHazir && (
        <p className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-sm text-indigo-900">
          Topluluğa oyun gönderebilmek için hesabının {TOPLULUK_KURALLARI.hesapYasiGun} günlük olması gerekir ({hesap.kalanGun} gün kaldı).
        </p>
      )}

      {hata && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          Kütüphane yüklenemedi.{" "}
          <button onClick={yukle} className="underline font-semibold">
            Tekrar dene
          </button>
        </div>
      )}
      {!hata && oyunlar === null && <p className="text-sm text-gray-400">Yükleniyor…</p>}
      {oyunlar?.length === 0 && (
        <p className="bg-white border border-dashed border-gray-300 rounded-2xl p-6 text-center text-sm text-gray-500">
          Kütüphanen boş. Composer&apos;da bir oyun oluşturup “Kütüphaneye kaydet” dediğinde burada görünür.
        </p>
      )}
      {oyunlar && oyunlar.length > 0 && (
        <ul className="space-y-3">
          {oyunlar.map((o) => (
            <OyunKarti key={o.id} oyun={o} okulAdi={okulAdi} onYayinlandi={onYayinlandi} onSilindi={(id) => setOyunlar((l) => l?.filter((x) => x.id !== id) ?? null)} onYenile={yukle} />
          ))}
        </ul>
      )}
    </div>
  );
}

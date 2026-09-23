"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DURATION_PRESETS_MIN, publishWindowMinutes } from "@/lib/games";
import type { KutuphaneKaydi, KutuphaneOzeti } from "@/lib/library";
import { kutuphanedenSil, kutuphanedenYayinla, kutuphaneListesi, kutuphaneOyunu } from "@/lib/libraryClient";
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

function OyunKarti({
  oyun,
  onYayinlandi,
  onSilindi,
}: {
  oyun: KutuphaneOzeti;
  onYayinlandi: (tg: TeacherGame) => void;
  onSilindi: (id: string) => void;
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
            {DENEYIM_SECENEKLERI.find((d) => d.key === oyun.deneyim)?.ad}
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
      {onizleme && <Onizleme oyun={onizleme} />}
    </li>
  );
}

export default function KutuphaneTab({ onYayinlandi }: { onYayinlandi: (tg: TeacherGame) => void }) {
  const [oyunlar, setOyunlar] = useState<KutuphaneOzeti[] | null>(null);
  const [hata, setHata] = useState(false);

  const yukle = useCallback(async () => {
    setHata(false);
    const liste = await kutuphaneListesi();
    if (liste) setOyunlar(liste);
    else setHata(true);
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
          <p className="text-sm text-gray-500">Composer&apos;da “Kütüphaneye kaydet” dediğin oyunlar burada saklanır; düzenleyip yeniden yayınlayabilirsin. Tekrar yayınlamak yeni oyun kodu üretir; yapay zekâ çağrısı yapılmaz.</p>
        </div>
        <Link href="/composer" className="shrink-0 text-sm bg-indigo-600 text-white font-semibold px-3 py-2 rounded-lg">
          + Yeni Oyun
        </Link>
      </div>

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
            <OyunKarti key={o.id} oyun={o} onYayinlandi={onYayinlandi} onSilindi={(id) => setOyunlar((l) => l?.filter((x) => x.id !== id) ?? null)} />
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-400">Kütüphane bu tarayıcıya bağlıdır; tarayıcı verileri silinirse kütüphaneye erişim kaybolur.</p>
    </div>
  );
}

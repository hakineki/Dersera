"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { Koleksiyon } from "@/lib/koleksiyon";
import type { ToplulukOzeti } from "@/lib/topluluk";
import { benzerOyunlarGetir, koleksiyonaEkle, koleksiyondanCikar, koleksiyonOlustur } from "@/lib/koleksiyonClient";
import { ALAN_SECENEKLERI, DENEYIM_SECENEKLERI } from "@/app/composer/labels";

// Topluluk oyun kartı: özet, öğrenme çıktısı kodları, kullan/dene, koleksiyon menüsü ve benzer oyunlar.
// Koleksiyon değişikliği sonrası üst bileşen koleksiyonları yeniler (onKoleksiyon).

const HEDEF_GOSTER = 4;

function KoleksiyonMenusu({ oyun, koleksiyonlar, onKoleksiyon }: { oyun: ToplulukOzeti; koleksiyonlar: Koleksiyon[]; onKoleksiyon: () => void }) {
  const [acik, setAcik] = useState(false);
  const [yeniAd, setYeniAd] = useState("");
  const [calisiyor, setCalisiyor] = useState(false);
  const [hata, setHata] = useState("");
  const icinde = koleksiyonlar.filter((k) => k.oyunlar.includes(oyun.oyun_id));

  async function degistir(k: Koleksiyon) {
    setCalisiyor(true);
    setHata("");
    const r = k.oyunlar.includes(oyun.oyun_id) ? await koleksiyondanCikar(k.id, oyun.oyun_id) : await koleksiyonaEkle(k.id, oyun.oyun_id);
    setCalisiyor(false);
    if ("error" in r) setHata(r.error);
    onKoleksiyon();
  }

  async function olusturVeEkle() {
    setCalisiyor(true);
    setHata("");
    const r = await koleksiyonOlustur(yeniAd);
    if ("error" in r) {
      setCalisiyor(false);
      return setHata(r.error);
    }
    const e = await koleksiyonaEkle(r.koleksiyon.id, oyun.oyun_id);
    setCalisiyor(false);
    if ("error" in e) setHata(e.error);
    setYeniAd("");
    onKoleksiyon();
  }

  return (
    <div className="relative mt-2">
      <button
        type="button"
        onClick={() => setAcik((a) => !a)}
        aria-expanded={acik}
        className="w-full text-sm border border-gray-300 text-gray-700 font-semibold px-3 py-2 rounded-lg hover:bg-gray-50"
      >
        {icinde.length ? `★ ${icinde.length} koleksiyonda` : "☆ Koleksiyona ekle"}
      </button>
      {acik && (
        <div className="mt-2 border border-gray-200 rounded-xl p-3 bg-gray-50 space-y-2 text-sm">
          {koleksiyonlar.length === 0 && <p className="text-xs text-gray-500">Henüz koleksiyonun yok; aşağıdan ilkini oluştur (ör. “Favoriler”).</p>}
          {koleksiyonlar.map((k) => (
            <label key={k.id} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={k.oyunlar.includes(oyun.oyun_id)} disabled={calisiyor} onChange={() => degistir(k)} />
              <span className="truncate">{k.ad}</span>
              <span className="text-xs text-gray-400 ml-auto">{k.oyunlar.length}</span>
            </label>
          ))}
          <form
            className="flex gap-2 pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (yeniAd.trim()) olusturVeEkle();
            }}
          >
            <label className="sr-only" htmlFor={`yeni-${oyun.oyun_id}`}>
              Yeni koleksiyon adı
            </label>
            <input
              id={`yeni-${oyun.oyun_id}`}
              value={yeniAd}
              onChange={(e) => setYeniAd(e.target.value.slice(0, 60))}
              placeholder="Yeni koleksiyon"
              className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
            />
            <button type="submit" disabled={calisiyor || !yeniAd.trim()} className="text-sm font-semibold text-indigo-700 px-2 disabled:opacity-40">
              Ekle
            </button>
          </form>
          {hata && (
            <p role="alert" className="text-xs text-red-600">
              {hata}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function BenzerOyunlar({ oyun }: { oyun: ToplulukOzeti }) {
  const [durum, setDurum] = useState<{ tur: "kapali" } | { tur: "yukleniyor" } | { tur: "hazir"; oyunlar: ToplulukOzeti[] } | { tur: "hata"; mesaj: string }>({ tur: "kapali" });
  async function ac() {
    if (durum.tur !== "kapali") return setDurum({ tur: "kapali" });
    setDurum({ tur: "yukleniyor" });
    const r = await benzerOyunlarGetir(oyun.oyun_id);
    setDurum("error" in r ? { tur: "hata", mesaj: r.error } : { tur: "hazir", oyunlar: r.oyunlar });
  }
  return (
    <div className="mt-2">
      <button type="button" onClick={ac} aria-expanded={durum.tur !== "kapali"} className="text-xs font-semibold text-indigo-700">
        {durum.tur === "kapali" ? "Benzer oyunlar ›" : "Benzer oyunları gizle"}
      </button>
      {durum.tur === "yukleniyor" && <p className="text-xs text-gray-400 mt-1">Yükleniyor…</p>}
      {durum.tur === "hata" && (
        <p role="alert" className="text-xs text-red-600 mt-1">
          {durum.mesaj}
        </p>
      )}
      {durum.tur === "hazir" &&
        (durum.oyunlar.length === 0 ? (
          <p className="text-xs text-gray-500 mt-1">Aynı sınıf ve ünitede başka oyun yok.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {durum.oyunlar.map((b) => (
              <li key={b.oyun_id} className="text-xs text-gray-700 flex gap-2">
                <Link href={`/demo?topluluk=${b.oyun_id}`} className="font-semibold text-gray-900 hover:underline truncate" title="Öğrenci gözüyle dene">
                  {b.baslik}
                </Link>
                <span className="text-gray-400 whitespace-nowrap">{b.oynanma_sayisi} kez</span>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

export default function OyunKarti({
  oyun,
  koleksiyonlar,
  onKoleksiyon,
  ek,
}: {
  oyun: ToplulukOzeti;
  // Yüklenemediyse null: koleksiyon menüsü gösterilmez.
  koleksiyonlar: Koleksiyon[] | null;
  onKoleksiyon: () => void;
  ek?: ReactNode;
}) {
  const deneyim = DENEYIM_SECENEKLERI.find((d) => d.key === oyun.deneyim);
  const alan = ALAN_SECENEKLERI.find((a) => a.key === oyun.alan);
  const hedefler = oyun.hedefler ?? [];
  return (
    <li className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col">
      <h3 className="font-bold text-gray-900">{oyun.baslik}</h3>
      <p className="text-sm text-gray-600 mt-0.5">
        {oyun.ders} · {oyun.konu}
      </p>
      {hedefler.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-1" aria-label="Öğrenme çıktıları">
          {hedefler.slice(0, HEDEF_GOSTER).map((h) => (
            <span key={h} className="font-mono text-[11px] bg-indigo-50 text-indigo-800 border border-indigo-100 rounded px-1.5 py-0.5">
              {h}
            </span>
          ))}
          {hedefler.length > HEDEF_GOSTER && <span className="text-[11px] text-gray-500 px-1">+{hedefler.length - HEDEF_GOSTER}</span>}
        </p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
        <div>
          <dt className="sr-only">Sınıf</dt>
          <dd>
            <span aria-hidden="true">🎓 </span>
            {oyun.sinif}. sınıf
          </dd>
        </div>
        <div>
          <dt className="sr-only">Süre</dt>
          <dd>
            <span aria-hidden="true">⏱ </span>
            {oyun.sure_dk} dk
          </dd>
        </div>
        <div>
          <dt className="sr-only">Deneyim</dt>
          <dd>
            <span aria-hidden="true">{deneyim?.ikon} </span>
            {deneyim?.ad}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Oyun alanı</dt>
          <dd>
            <span aria-hidden="true">{alan?.ikon} </span>
            {alan?.ad}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="sr-only">Oynanma</dt>
          <dd>
            <span aria-hidden="true">👥 </span>
            {oyun.oynanma_sayisi} kez oynandı
          </dd>
        </div>
        {oyun.puan_ortalama !== null && (
          <div>
            <dt className="sr-only">Öğrenci puanı</dt>
            <dd>
              <span aria-hidden="true">⭐ </span>
              Öğrenci {oyun.puan_ortalama.toLocaleString("tr-TR")}
            </dd>
          </div>
        )}
        {oyun.ogretmen_puan_ortalama != null && (
          <div>
            <dt className="sr-only">Öğretmen puanı</dt>
            <dd>
              <span aria-hidden="true">🍎 </span>
              Öğretmen {oyun.ogretmen_puan_ortalama.toLocaleString("tr-TR")} ({oyun.ogretmen_puan_sayisi})
            </dd>
          </div>
        )}
      </dl>
      <div className="mt-auto pt-4">
        <Link href={`/composer?topluluk=${oyun.oyun_id}`} aria-label={`${oyun.baslik} oyununu kullan`} className="block text-center text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-3 py-2 rounded-lg">
          Oyunu Kullan
        </Link>
        <Link
          href={`/demo?topluluk=${oyun.oyun_id}`}
          aria-label={`${oyun.baslik} oyununu öğrenci gözüyle dene`}
          title="Sonuç kaydedilmez; günlük açma hakkından sayılır"
          className="block mt-2 text-center text-sm border border-indigo-300 text-indigo-700 font-semibold px-3 py-2 rounded-lg"
        >
          👁 Öğrenci gözüyle dene
        </Link>
        {koleksiyonlar && <KoleksiyonMenusu oyun={oyun} koleksiyonlar={koleksiyonlar} onKoleksiyon={onKoleksiyon} />}
        {ek}
        <BenzerOyunlar oyun={oyun} />
      </div>
    </li>
  );
}

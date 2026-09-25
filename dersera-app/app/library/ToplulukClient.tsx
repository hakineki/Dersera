"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import DerseraLogo from "@/components/DerseraLogo";
import type { ToplulukOzeti } from "@/lib/topluluk";
import { ALAN_SECENEKLERI, DENEYIM_SECENEKLERI } from "@/app/composer/labels";

interface Filtre {
  ders: string;
  sinif: string;
  alan: string;
  deneyim: string;
  q: string;
}

const BOS: Filtre = { ders: "", sinif: "", alan: "", deneyim: "", q: "" };

function sorgu(f: Filtre, cursor: string | null): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v.trim()) p.set(k, v.trim());
  if (cursor) p.set("cursor", cursor);
  return p.toString();
}

function Kart({ oyun }: { oyun: ToplulukOzeti }) {
  const deneyim = DENEYIM_SECENEKLERI.find((d) => d.key === oyun.deneyim);
  const alan = ALAN_SECENEKLERI.find((a) => a.key === oyun.alan);
  return (
    <li className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col">
      <h3 className="font-bold text-gray-900">{oyun.baslik}</h3>
      <p className="text-sm text-gray-600 mt-0.5">
        {oyun.ders} · {oyun.konu}
      </p>
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
      <Link href={`/composer?topluluk=${oyun.oyun_id}`} aria-label={`${oyun.baslik} oyununu kullan`} className="mt-4 text-center text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-3 py-2 rounded-lg">
        Oyunu Kullan
      </Link>
      <Link href={`/demo?topluluk=${oyun.oyun_id}`} aria-label={`${oyun.baslik} oyununu öğrenci gözüyle dene`} className="mt-2 text-center text-sm border border-indigo-300 text-indigo-700 font-semibold px-3 py-2 rounded-lg">
        👁 Öğrenci gözüyle dene
      </Link>
    </li>
  );
}

function Secim({ id, etiket, deger, onChange, secenekler }: { id: string; etiket: string; deger: string; onChange: (v: string) => void; secenekler: { key: string; ad: string }[] }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-gray-600 mb-1">
        {etiket}
      </label>
      <select id={id} value={deger} onChange={(e) => onChange(e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white">
        <option value="">Tümü</option>
        {secenekler.map((s) => (
          <option key={s.key} value={s.key}>
            {s.ad}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function ToplulukClient({ dersler, siniflar }: { dersler: { key: string; ad: string }[]; siniflar: number[] }) {
  const [filtre, setFiltre] = useState<Filtre>(BOS);
  const [arama, setArama] = useState("");
  const [oyunlar, setOyunlar] = useState<ToplulukOzeti[]>([]);
  const [sonraki, setSonraki] = useState<string | null>(null);
  const [durum, setDurum] = useState<"yukleniyor" | "hazir" | "hata">("yukleniyor");
  const istekNo = useRef(0);
  const sonIstek = useRef<string | null>(null);

  const yukle = useCallback(async (f: Filtre, cursor: string | null) => {
    const no = ++istekNo.current;
    sonIstek.current = cursor;
    setDurum("yukleniyor");
    try {
      const res = await fetch(`/api/topluluk?${sorgu(f, cursor)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { oyunlar: ToplulukOzeti[]; sonraki: string | null };
      if (no !== istekNo.current) return;
      setOyunlar((eski) => (cursor ? [...eski, ...json.oyunlar] : json.oyunlar));
      setSonraki(json.sonraki);
      setDurum("hazir");
    } catch {
      if (no === istekNo.current) setDurum("hata");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => yukle(filtre, null));
    return () => clearTimeout(t);
  }, [filtre, yukle]);

  // Arama yazarken her tuşta istek atılmaz.
  useEffect(() => {
    const t = setTimeout(() => setFiltre((f) => (f.q === arama ? f : { ...f, q: arama })), 350);
    return () => clearTimeout(t);
  }, [arama]);

  const guncelle = (alan: keyof Filtre) => (v: string) => setFiltre((f) => ({ ...f, [alan]: v }));
  const filtreVar = Object.values(filtre).some((v) => v);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-900 text-white px-4 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <DerseraLogo />
            <p className="text-xs font-semibold text-indigo-200 border-l border-indigo-700 pl-3">Topluluk Kütüphanesi</p>
          </div>
          <Link href="/" className="text-indigo-300 hover:text-white text-sm whitespace-nowrap">
            ← Ana sayfa
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-900">Topluluk Kütüphanesi</h1>
        <p className="text-sm text-gray-500">Öğretmenlerin paylaştığı ve iki öğretmenin incelediği oyunlar. Bir oyunu kendi sınıfın için kopyalayıp düzenleyebilirsin.</p>
        <p className="text-sm mb-5 mt-1">
          <Link href="/library/inceleme" className="text-indigo-700 font-semibold underline">
            İnceleme bekleyen oyunlar
          </Link>{" "}
          <span className="text-gray-500">— meslektaşlarının gönderdiği oyunları inceleyerek topluluğa katkı ver.</span>
        </p>

        <div className="flex flex-col md:flex-row gap-6">
          <aside aria-label="Filtreler" className="md:w-60 shrink-0 space-y-3 bg-white border border-gray-200 rounded-2xl p-4 h-fit">
            <div>
              <label htmlFor="ara" className="block text-xs font-semibold text-gray-600 mb-1">
                Ara
              </label>
              <input
                id="ara"
                type="search"
                value={arama}
                onChange={(e) => setArama(e.target.value.slice(0, 100))}
                placeholder="Başlık, ders ya da konu"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <Secim id="f-ders" etiket="Ders" deger={filtre.ders} onChange={guncelle("ders")} secenekler={dersler} />
            <Secim id="f-sinif" etiket="Sınıf" deger={filtre.sinif} onChange={guncelle("sinif")} secenekler={siniflar.map((s) => ({ key: String(s), ad: `${s}. sınıf` }))} />
            <Secim id="f-alan" etiket="Oyun alanı" deger={filtre.alan} onChange={guncelle("alan")} secenekler={[...ALAN_SECENEKLERI]} />
            <Secim id="f-deneyim" etiket="Deneyim" deger={filtre.deneyim} onChange={guncelle("deneyim")} secenekler={[...DENEYIM_SECENEKLERI]} />
            {filtreVar && (
              <button
                type="button"
                onClick={() => {
                  setArama("");
                  setFiltre(BOS);
                }}
                className="w-full text-sm text-indigo-700 font-semibold py-1.5"
              >
                Filtreleri temizle
              </button>
            )}
          </aside>

          <section aria-label="Oyunlar" aria-busy={durum === "yukleniyor"} className="flex-1 min-w-0">
            {durum === "hata" && (
              <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
                Kütüphane yüklenemedi.{" "}
                <button onClick={() => yukle(filtre, sonIstek.current)} className="underline font-semibold">
                  Tekrar dene
                </button>
              </div>
            )}
            {oyunlar.length === 0 && durum === "hazir" && !sonraki && (
              <p className="bg-white border border-dashed border-gray-300 rounded-2xl p-6 text-center text-sm text-gray-500">
                {filtreVar ? "Bu filtrelere uyan oyun yok." : "Henüz yayınlanmış oyun yok."}
              </p>
            )}
            <p aria-live="polite" className="sr-only">
              {durum === "hazir" ? `${oyunlar.length} oyun listeleniyor` : ""}
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {oyunlar.map((o) => (
                <Kart key={o.oyun_id} oyun={o} />
              ))}
            </ul>
            {durum === "yukleniyor" && <p className="text-sm text-gray-400 mt-4">Yükleniyor…</p>}
            {sonraki && durum === "hazir" && (
              <button onClick={() => yukle(filtre, sonraki)} className="mt-5 w-full sm:w-auto border border-gray-300 bg-white text-gray-700 font-semibold px-4 py-2 rounded-lg text-sm">
                Daha fazla
              </button>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

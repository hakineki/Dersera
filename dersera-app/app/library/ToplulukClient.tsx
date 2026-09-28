"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import DerseraLogo from "@/components/DerseraLogo";
import type { KonuSecenegi } from "@/data/mufredat/programlar";
import type { Koleksiyon } from "@/lib/koleksiyon";
import { koleksiyonlarGetir } from "@/lib/koleksiyonClient";
import type { Siralama, ToplulukOzeti } from "@/lib/topluluk";
import { ALAN_SECENEKLERI, DENEYIM_SECENEKLERI } from "@/app/composer/labels";
import Koleksiyonlar from "./Koleksiyonlar";
import OyunKarti from "./OyunKarti";

interface Filtre {
  ders: string;
  sinif: string;
  konu: string;
  alan: string;
  deneyim: string;
  q: string;
  sirala: Siralama;
}

const BOS: Filtre = { ders: "", sinif: "", konu: "", alan: "", deneyim: "", q: "", sirala: "yeni" };

const SIRALAMA_ADI: { key: Siralama; ad: string }[] = [
  { key: "yeni", ad: "En yeni" },
  { key: "oynanan", ad: "En çok oynanan" },
  { key: "ogretmen", ad: "Öğretmen puanı" },
  { key: "ogrenci", ad: "Öğrenci puanı" },
];

function sorgu(f: Filtre, cursor: string | null): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v.trim() && !(k === "sirala" && v === "yeni")) p.set(k, v.trim());
  if (cursor) p.set("cursor", cursor);
  return p.toString();
}

function Secim({
  id,
  etiket,
  deger,
  onChange,
  secenekler,
  tumu = "Tümü",
}: {
  id: string;
  etiket: string;
  deger: string;
  onChange: (v: string) => void;
  secenekler: { key: string; ad: string }[];
  tumu?: string | null;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-gray-600 mb-1">
        {etiket}
      </label>
      <select id={id} value={deger} onChange={(e) => onChange(e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white">
        {tumu !== null && <option value="">{tumu}</option>}
        {secenekler.map((s) => (
          <option key={s.key} value={s.key}>
            {s.ad}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function ToplulukClient({
  dersler,
  siniflar,
  konular,
}: {
  dersler: { key: string; ad: string }[];
  siniflar: number[];
  // "sınıf:ders" → üniteler (ünite araması).
  konular: Record<string, KonuSecenegi[]>;
}) {
  const [filtre, setFiltre] = useState<Filtre>(BOS);
  const [gorunum, setGorunum] = useState<"tum" | "koleksiyon">("tum");
  const [koleksiyonlar, setKoleksiyonlar] = useState<Koleksiyon[] | null>(null);
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

  const koleksiyonlariYukle = useCallback(async () => {
    const r = await koleksiyonlarGetir();
    if (!("error" in r)) setKoleksiyonlar(r.koleksiyonlar);
  }, []);
  useEffect(() => {
    const t = setTimeout(koleksiyonlariYukle);
    return () => clearTimeout(t);
  }, [koleksiyonlariYukle]);

  // Ders ya da sınıf değişince ünite seçimi düşer (ünite o ders ve sınıfa aittir).
  const guncelle = (alan: keyof Filtre) => (v: string) => setFiltre((f) => ({ ...f, [alan]: v, ...(alan === "ders" || alan === "sinif" ? { konu: "" } : {}) }));
  const filtreVar = Object.entries(filtre).some(([k, v]) => v && !(k === "sirala" && v === "yeni"));
  const uniteler = filtre.ders && filtre.sinif ? (konular[`${filtre.sinif}:${filtre.ders}`] ?? []) : [];

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
        <p className="text-sm text-gray-500">Öğretmenlerin paylaştığı ve iki öğretmenin incelediği oyunlar. Bir oyunu kendi sınıfın için kopyalayıp düzenleyebilirsin. “Oyunu Kullan” da “Öğrenci gözüyle dene” de oyunun tamamını açtığı için günlük açma hakkından sayılır.</p>
        <p className="text-sm mb-5 mt-1">
          <Link href="/library/inceleme" className="text-indigo-700 font-semibold underline">
            İnceleme bekleyen oyunlar
          </Link>{" "}
          <span className="text-gray-500">— meslektaşlarının gönderdiği oyunları inceleyerek topluluğa katkı ver.</span>
        </p>

        <div role="tablist" aria-label="Görünüm" className="flex gap-2 mb-4">
          {(
            [
              ["tum", "Tüm oyunlar"],
              ["koleksiyon", `Koleksiyonlarım${koleksiyonlar ? ` (${koleksiyonlar.length})` : ""}`],
            ] as const
          ).map(([k, ad]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={gorunum === k}
              onClick={() => setGorunum(k)}
              className={`text-sm font-semibold px-3 py-1.5 rounded-lg ${gorunum === k ? "bg-indigo-600 text-white" : "bg-white border border-gray-300 text-gray-700"}`}
            >
              {ad}
            </button>
          ))}
        </div>

        {gorunum === "koleksiyon" &&
          (koleksiyonlar ? (
            <Koleksiyonlar koleksiyonlar={koleksiyonlar} onKoleksiyon={koleksiyonlariYukle} />
          ) : (
            <p className="text-sm text-gray-400">Koleksiyonlar yükleniyor…</p>
          ))}

        <div className={`flex flex-col md:flex-row gap-6 ${gorunum === "tum" ? "" : "hidden"}`}>
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
            {uniteler.length > 0 ? (
              <Secim id="f-konu" etiket="Ünite (öğrenme çıktıları)" deger={filtre.konu} onChange={guncelle("konu")} secenekler={uniteler.map((u) => ({ key: u.id, ad: u.ad }))} />
            ) : (
              <p className="text-xs text-gray-400">Ünite araması için ders ve sınıf seç.</p>
            )}
            <Secim id="f-alan" etiket="Oyun alanı" deger={filtre.alan} onChange={guncelle("alan")} secenekler={[...ALAN_SECENEKLERI]} />
            <Secim id="f-deneyim" etiket="Deneyim" deger={filtre.deneyim} onChange={guncelle("deneyim")} secenekler={[...DENEYIM_SECENEKLERI]} />
            {filtreVar && (
              <button
                type="button"
                onClick={() => {
                  setArama("");
                  setFiltre((f) => ({ ...BOS, sirala: f.sirala }));
                }}
                className="w-full text-sm text-indigo-700 font-semibold py-1.5"
              >
                Filtreleri temizle
              </button>
            )}
          </aside>

          <section aria-label="Oyunlar" aria-busy={durum === "yukleniyor"} className="flex-1 min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
              <div className="w-56">
                <Secim id="f-sirala" etiket="Sırala" deger={filtre.sirala} onChange={(v) => setFiltre((f) => ({ ...f, sirala: v as Siralama }))} secenekler={SIRALAMA_ADI} tumu={null} />
              </div>
              {filtre.sirala !== "yeni" && <p className="text-xs text-gray-500">Sıralama en yeni 500 oyun içinde yapılır.</p>}
            </div>
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
                <OyunKarti key={o.oyun_id} oyun={o} koleksiyonlar={koleksiyonlar} onKoleksiyon={koleksiyonlariYukle} />
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

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DerseraLogo from "@/components/DerseraLogo";
import type { KonuSecenegi, OgrenmeCiktisi } from "@/data/mufredat/programlar";
import { validationContext } from "@/lib/composer/context";
import type { GameDefinition } from "@/lib/composer/definition";
import { validateGame, type ValidationResult } from "@/lib/composer/validator";
import { loadTeacherSession } from "@/lib/teacherAuth";
import { saveTeacherGame } from "@/lib/teacherGame";
import type { PublishResponse } from "@/lib/gamesClient";
import ComposerPreview from "./ComposerPreview";
import DurakEditor, { type Duzenlenen } from "./DurakEditor";
import { ALAN_SECENEKLERI, DENEYIM_SECENEKLERI } from "./labels";
import { maxDersSayisi } from "@/lib/composer/recipe";

const CLIENT_TIMEOUT_MS = 170_000; // sunucu sınırı (150 sn) + pay; maxDuration 180 sn
const MESAJLAR = ["Müfredat hazırlanıyor...", "Hikâye kuruluyor...", "Görevler oluşturuluyor...", "Oyun kontrol ediliyor..."];

type Durum =
  | { tur: "form" }
  | { tur: "yukleniyor" }
  | { tur: "hata"; mesaj: string }
  | { tur: "onizleme" };

interface DersKonu {
  ders: string;
  konuId: string;
}

interface ComposeResponse {
  definition: GameDefinition;
  validation: ValidationResult;
  dersler: DersKonu[];
  hedefler: OgrenmeCiktisi[];
  hedefDersleri: Record<string, string[]>;
}

function Secim<T extends string | number>({
  etiket,
  secenekler,
  deger,
  onChange,
  pasif,
}: {
  etiket: string;
  secenekler: { key: T; ad: string; ikon?: string; aciklama?: string }[];
  deger: T;
  onChange: (v: T) => void;
  pasif?: (v: T) => boolean;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-gray-700 mb-2">{etiket}</legend>
      <div className={`grid gap-2 ${secenekler.some((s) => s.aciklama) ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
        {secenekler.map((s) => {
          const kapali = pasif?.(s.key) ?? false;
          return (
            <button
              key={String(s.key)}
              type="button"
              aria-pressed={deger === s.key}
              disabled={kapali}
              onClick={() => onChange(s.key)}
              className={`text-left rounded-xl border px-3 py-2.5 text-sm transition-colors disabled:opacity-40 ${
                deger === s.key ? "border-indigo-600 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-600" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
              }`}
            >
              <span className="font-semibold">
                {s.ikon && <span aria-hidden="true">{s.ikon} </span>}
                {s.ad}
              </span>
              {s.aciklama && <span className="block text-xs text-gray-500 mt-0.5">{s.aciklama}</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Yukleniyor({ ilerleme, mesaj }: { ilerleme: number; mesaj: string }) {
  return (
    <div className="py-16 text-center" role="status" aria-live="polite">
      <div className="text-5xl mb-4 motion-safe:animate-pulse" aria-hidden="true">
        🧭
      </div>
      <p className="font-bold text-gray-900 text-lg">Dersera oyununuzu oluşturuyor...</p>
      <p className="text-sm text-gray-500 mt-1 h-5">{mesaj}</p>
      <div
        className="mt-6 h-2 bg-gray-200 rounded-full overflow-hidden max-w-sm mx-auto"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ilerleme)}
      >
        <div className="h-full bg-indigo-600 motion-safe:transition-[width] motion-safe:duration-500" style={{ width: `${ilerleme}%` }} />
      </div>
    </div>
  );
}

export default function ComposerClient({
  siniflar,
  dersler,
  konular,
}: {
  siniflar: number[];
  dersler: { key: string; ad: string }[];
  konular: Record<string, KonuSecenegi[]>;
}) {
  const router = useRouter();
  const [ogretmen, setOgretmen] = useState<boolean | null>(null);
  const [sinif, setSinif] = useState(10);
  // Seçim sırası korunur; her seçili dersin kendi konusu vardır.
  const [secili, setSecili] = useState<DersKonu[]>([{ ders: "fizik", konuId: konular["10:fizik"]?.[0]?.id ?? "" }]);
  const [sure, setSure] = useState<20 | 40 | 60>(40);
  const [deneyim, setDeneyim] = useState<"macera" | "dengeli" | "ders">("dengeli");
  const [alan, setAlan] = useState<"sinif" | "okul">("sinif");

  const [durum, setDurum] = useState<Durum>({ tur: "form" });
  const [ilerleme, setIlerleme] = useState(0);
  const [mesajNo, setMesajNo] = useState(0);
  const [sonuc, setSonuc] = useState<ComposeResponse | null>(null);
  const [duzenlenen, setDuzenlenen] = useState<Duzenlenen | null>(null);
  const [yayinlaniyor, setYayinlaniyor] = useState(false);
  const [yayinHatasi, setYayinHatasi] = useState("");
  const istek = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setOgretmen(loadTeacherSession()));
    return () => clearTimeout(t);
  }, []);

  // İlerleme %93'e asimptotik yaklaşır; yanıt gelince %100'e atlar. Üretim 1–2 dakika sürebilir.
  useEffect(() => {
    if (durum.tur !== "yukleniyor") return;
    const basla = Date.now();
    const id = setInterval(() => {
      const t = (Date.now() - basla) / 1000;
      setIlerleme(93 * (1 - Math.exp(-t / 40)));
      setMesajNo(Math.min(MESAJLAR.length - 1, Math.floor(t / 15)));
    }, 250);
    return () => clearInterval(id);
  }, [durum.tur]);

  const ilkKonu = (s: number, d: string) => konular[`${s}:${d}`]?.[0]?.id ?? "";

  // Sınıf değişince bu sınıfta programı olmayan dersler seçimden düşer; kalanların konusu yeni sınıfın ilk konusu olur.
  function sinifSec(s: number) {
    setSinif(s);
    const kalan = secili.filter((k) => konular[`${s}:${k.ders}`]?.length).map((k) => ({ ders: k.ders, konuId: ilkKonu(s, k.ders) }));
    const ilk = dersler.find((d) => konular[`${s}:${d.key}`]?.length);
    setSecili(kalan.length ? kalan : ilk ? [{ ders: ilk.key, konuId: ilkKonu(s, ilk.key) }] : []);
  }

  function dersDegistir(d: string) {
    setSecili((cur) =>
      cur.some((k) => k.ders === d) ? cur.filter((k) => k.ders !== d) : [...cur, { ders: d, konuId: ilkKonu(sinif, d) }]
    );
  }

  function konuSec(d: string, konuId: string) {
    setSecili((cur) => cur.map((k) => (k.ders === d ? { ...k, konuId } : k)));
  }

  const dersAdi = (key: string) => dersler.find((d) => d.key === key)?.ad ?? key;
  const enFazlaDers = maxDersSayisi(sure);
  const cokDers = secili.length > enFazlaDers;
  const hazir = secili.length > 0 && !cokDers && secili.every((k) => k.konuId);

  async function olustur() {
    setDurum({ tur: "yukleniyor" });
    setIlerleme(0);
    setMesajNo(0);
    const controller = new AbortController();
    istek.current = controller;
    const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
    try {
      const res = await fetch("/api/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sinif, dersler: secili, sure, deneyim, alan }),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDurum({ tur: "hata", mesaj: json.error ?? "Oyun şu anda oluşturulamadı. Tekrar deneyin." });
        return;
      }
      setIlerleme(100);
      setSonuc(json as ComposeResponse);
      setTimeout(() => setDurum({ tur: "onizleme" }), 250);
    } catch {
      setDurum({ tur: "hata", mesaj: "Oyun şu anda oluşturulamadı. Tekrar deneyin." });
    } finally {
      clearTimeout(timer);
    }
  }

  function kaydet(v: Duzenlenen) {
    if (!sonuc) return;
    const def: GameDefinition =
      v.tur === "durak"
        ? { ...sonuc.definition, duraklar: sonuc.definition.duraklar.map((d) => (d.id === v.durak.id ? v.durak : d)) }
        : { ...sonuc.definition, final: v.final };
    const ctx = validationContext({
      alan: def.meta.alan,
      deneyim: def.meta.deneyim,
      sure: def.meta.sure_dk,
      ogrenmeCiktilari: sonuc.hedefler,
      hedefDersleri: sonuc.hedefDersleri,
    });
    setSonuc({ ...sonuc, definition: def, validation: validateGame(def, ctx) });
    setDuzenlenen(null);
  }

  async function yayinla() {
    if (!sonuc) return;
    setYayinlaniyor(true);
    setYayinHatasi("");
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ composer: { definition: sonuc.definition, dersler: sonuc.dersler } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.validation) setSonuc({ ...sonuc, validation: json.validation });
        setYayinHatasi(json.error ?? "Oyun yayınlanamadı. Tekrar deneyin.");
        return;
      }
      const pub = json as PublishResponse;
      saveTeacherGame({ game: pub.game, adminToken: pub.adminToken });
      router.push("/ogretmen");
    } catch {
      setYayinHatasi("Oyun yayınlanamadı. Bağlantınızı kontrol edin.");
    } finally {
      setYayinlaniyor(false);
    }
  }

  const baslik = (
    <header className="bg-indigo-900 text-white px-4 py-4">
      <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <DerseraLogo />
          <p className="text-xs font-semibold text-indigo-200 border-l border-indigo-700 pl-3">Yeni Oyun Oluştur</p>
        </div>
        <Link href="/ogretmen" className="text-indigo-300 hover:text-white text-sm whitespace-nowrap">
          ← Panel
        </Link>
      </div>
    </header>
  );

  if (ogretmen === false) {
    return (
      <div className="min-h-screen bg-gray-50">
        {baslik}
        <main className="max-w-3xl mx-auto px-4 py-10 text-center">
          <p className="text-gray-700 mb-4">Oyun oluşturmak için öğretmen girişi gerekli.</p>
          <Link href="/ogretmen" className="inline-block bg-indigo-600 text-white font-semibold px-5 py-2.5 rounded-lg">
            Öğretmen girişi
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {baslik}
      <main className="max-w-3xl mx-auto px-4 py-6">
        {durum.tur === "form" && (
          <form
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              olustur();
            }}
          >
            <div>
              <h1 className="text-xl font-bold text-gray-900">Oyununuzu tanımlayın</h1>
              <p className="text-sm text-gray-500">Altı seçim yeterli; gerisini Dersera tasarlar.</p>
            </div>
            <Secim etiket="1. Sınıf" secenekler={siniflar.map((s) => ({ key: s, ad: `${s}. sınıf` }))} deger={sinif} onChange={sinifSec} />
            <fieldset>
              <legend className="text-sm font-semibold text-gray-700 mb-1">2. Ders</legend>
              <p className="text-xs text-gray-400 mb-2">Birden çok ders seçebilirsiniz; oyun dersleri tek bir hikâyede birleştirir.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {dersler.map((d) => {
                  const secildi = secili.some((k) => k.ders === d.key);
                  return (
                    <button
                      key={d.key}
                      type="button"
                      aria-pressed={secildi}
                      disabled={!konular[`${sinif}:${d.key}`]?.length}
                      onClick={() => dersDegistir(d.key)}
                      className={`text-left rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors disabled:opacity-40 ${
                        secildi ? "border-indigo-600 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-600" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      {secildi && <span aria-hidden="true">✓ </span>}
                      {d.ad}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-gray-700 mb-2">3. Konu</legend>
              {secili.length === 0 && <p className="text-xs text-gray-400">Önce en az bir ders seçin.</p>}
              {secili.map((k) => (
                <label key={k.ders} className="block">
                  {secili.length > 1 && <span className="block text-xs font-semibold text-gray-500 mb-1">{dersAdi(k.ders)}</span>}
                  <select
                    aria-label={`${dersAdi(k.ders)} konusu`}
                    value={k.konuId}
                    onChange={(e) => konuSec(k.ders, e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm bg-white"
                  >
                    {(konular[`${sinif}:${k.ders}`] ?? []).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.ad}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </fieldset>
            <Secim etiket="4. Süre" secenekler={[20, 40, 60].map((s) => ({ key: s as 20 | 40 | 60, ad: `${s} dk` }))} deger={sure} onChange={setSure} />
            {cokDers && (
              <p role="alert" className="text-sm text-red-600 -mt-3">
                {sure} dakikalık oyunda en fazla {enFazlaDers} ders seçilebilir. Ders sayısını azaltın ya da süreyi uzatın.
              </p>
            )}
            <Secim etiket="5. Deneyim biçimi" secenekler={[...DENEYIM_SECENEKLERI]} deger={deneyim} onChange={setDeneyim} />
            <Secim etiket="6. Oyun alanı" secenekler={[...ALAN_SECENEKLERI]} deger={alan} onChange={setAlan} />
            <button
              type="submit"
              disabled={!hazir || ogretmen !== true}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold py-3.5 rounded-xl text-base"
            >
              Oyunu Oluştur
            </button>
          </form>
        )}

        {durum.tur === "yukleniyor" && <Yukleniyor ilerleme={ilerleme} mesaj={MESAJLAR[mesajNo]} />}

        {durum.tur === "hata" && (
          <div className="py-12 text-center" role="alert">
            <div className="text-4xl mb-3" aria-hidden="true">
              ⚠️
            </div>
            <p className="font-semibold text-gray-900">{durum.mesaj}</p>
            <div className="flex gap-2 justify-center mt-5">
              <button onClick={() => setDurum({ tur: "form" })} className="border border-gray-300 text-gray-700 font-semibold px-4 py-2 rounded-lg">
                Seçimlere dön
              </button>
              <button onClick={olustur} className="bg-indigo-600 text-white font-semibold px-4 py-2 rounded-lg">
                Tekrar dene
              </button>
            </div>
          </div>
        )}

        {durum.tur === "onizleme" && sonuc && (
          <ComposerPreview
            definition={sonuc.definition}
            validation={sonuc.validation}
            hedefler={sonuc.hedefler}
            onEdit={setDuzenlenen}
            onPublish={yayinla}
            onNew={() => {
              setSonuc(null);
              setDurum({ tur: "form" });
            }}
            publishing={yayinlaniyor}
            publishError={yayinHatasi}
          />
        )}
      </main>
      {duzenlenen && <DurakEditor value={duzenlenen} onSave={kaydet} onClose={() => setDuzenlenen(null)} />}
    </div>
  );
}

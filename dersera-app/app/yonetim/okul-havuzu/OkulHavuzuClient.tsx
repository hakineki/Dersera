"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import DerseraLogo from "@/components/DerseraLogo";
import { OKUL_HAVUZU } from "@/lib/kredi";
import { havuzAta, havuzListesiGetir, havuzOkulBul } from "@/lib/okulClient";
import type { HavuzluOkul } from "@/lib/okulService";

const girdi = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
const ayAdi = (ay: string) => new Date(`${ay}-15T12:00:00Z`).toLocaleDateString("tr-TR", { month: "long", year: "numeric" });

// Seçili okulun aylık havuzunu yazar (0: kaldırır).
function HavuzFormu({ okul, onKaydedildi }: { okul: HavuzluOkul; onKaydedildi: (o: HavuzluOkul) => void }) {
  const [hak, setHak] = useState(String(okul.hak || ""));
  const [hata, setHata] = useState("");
  const [calisiyor, setCalisiyor] = useState(false);
  const kilit = useRef(false);

  async function kaydet() {
    const deger = hak.trim() === "" ? 0 : Number(hak);
    const soru = deger === 0 ? `${okul.ad} okulunun kredi havuzu kaldırılsın mı?` : `${okul.ad} okuluna aylık ${deger} kredilik havuz atansın mı?`;
    if (kilit.current || !window.confirm(soru)) return;
    kilit.current = true;
    setCalisiyor(true);
    setHata("");
    const r = await havuzAta(okul.okulId, deger);
    kilit.current = false;
    setCalisiyor(false);
    if ("error" in r) setHata(r.error);
    else onKaydedildi(r.okul);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        kaydet();
      }}
      className="bg-white border border-indigo-200 rounded-2xl p-4 space-y-3"
    >
      <div>
        <h2 className="font-bold text-gray-900">{okul.ad}</h2>
        <p className="text-sm text-gray-600">
          {okul.uyeSayisi !== undefined && `${okul.uyeSayisi} öğretmen · `}
          {okul.hak > 0 ? `Şu anki havuz: aylık ${okul.hak} kredi (bu ay ${okul.kullanilan} kullanıldı)` : "Havuz atanmamış"}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="havuz-hak" className="block text-xs font-medium text-gray-600">
            Aylık havuz (kredi; 0 ya da boş: kaldır)
          </label>
          <input
            id="havuz-hak"
            type="number"
            inputMode="numeric"
            min={0}
            max={OKUL_HAVUZU.hakEnCok}
            value={hak}
            onChange={(e) => setHak(e.target.value)}
            className={`${girdi} w-40`}
          />
        </div>
        <button type="submit" disabled={calisiyor} className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40">
          {calisiyor ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </div>
      {hata && (
        <p role="alert" className="text-sm text-red-600">
          {hata}
        </p>
      )}
    </form>
  );
}

export default function OkulHavuzuClient() {
  const [liste, setListe] = useState<{ ay: string; okullar: HavuzluOkul[] } | { error: string; status?: number } | null>(null);
  const [kod, setKod] = useState("");
  const [bulHata, setBulHata] = useState("");
  const [secili, setSecili] = useState<HavuzluOkul | null>(null);
  const [mesaj, setMesaj] = useState("");

  const yukle = useCallback(async () => {
    setListe(await havuzListesiGetir());
  }, []);
  useEffect(() => {
    const t = setTimeout(yukle);
    return () => clearTimeout(t);
  }, [yukle]);

  async function bul() {
    setBulHata("");
    setMesaj("");
    const r = await havuzOkulBul(kod);
    if ("error" in r) setBulHata(r.error);
    else setSecili(r.okul);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-900 text-white px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <DerseraLogo />
            <p className="text-xs font-semibold text-indigo-200 border-l border-indigo-700 pl-3">Okul kredi havuzları</p>
          </div>
          <nav className="flex gap-4 text-sm whitespace-nowrap">
            <Link href="/moderasyon" className="text-indigo-300 hover:text-white">
              Moderasyon
            </Link>
            <Link href="/yonetim/kopya-kaydi" className="text-indigo-300 hover:text-white">
              Kopya kaydı
            </Link>
            <Link href="/ogretmen" className="text-indigo-300 hover:text-white">
              ← Öğretmen paneli
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Okul kredi havuzları</h1>
          <p className="text-sm text-gray-500">
            Anlaşmalı okula aylık kredi havuzu ata. Öğretmenler önce kendi aylık hakkını, bitince okul havuzunu, en son kazandıkları krediyi kullanır; okul
            yöneticisi öğretmen başına aylık sınır koyabilir. Havuz her ay başında yenilenir.
          </p>
        </div>

        {mesaj && (
          <p role="status" className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-3 text-sm">
            {mesaj}
          </p>
        )}

        {liste && "error" in liste ? (
          <p role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            {liste.status === 401 ? (
              <>
                <Link href="/ogretmen" className="underline font-semibold">
                  Giriş yap
                </Link>
                ; bu sayfa yöneticilere açık.
              </>
            ) : (
              liste.error
            )}
          </p>
        ) : (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                bul();
              }}
              className="bg-white border border-gray-200 rounded-2xl p-4 space-y-2"
            >
              <label htmlFor="havuz-kod" className="block font-semibold text-gray-900">
                Okul bul
              </label>
              <p className="text-sm text-gray-500">Okul yöneticisinden okulun davet kodunu iste (Öğretmen paneli → Okulum).</p>
              <div className="flex flex-wrap gap-2">
                <input id="havuz-kod" value={kod} onChange={(e) => setKod(e.target.value)} placeholder="ör. ABCD-EFGH" autoComplete="off" className={`${girdi} font-mono uppercase`} />
                <button type="submit" disabled={kod.trim().length < 8} className="border border-indigo-300 text-indigo-700 text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40">
                  Bul
                </button>
              </div>
              {bulHata && (
                <p role="alert" className="text-sm text-red-600">
                  {bulHata}
                </p>
              )}
            </form>

            {secili && (
              <HavuzFormu
                key={secili.okulId}
                okul={secili}
                onKaydedildi={(o) => {
                  setSecili(null);
                  setKod("");
                  setMesaj(o.hak > 0 ? `${o.ad}: aylık ${o.hak} kredilik havuz kaydedildi.` : `${o.ad}: havuz kaldırıldı.`);
                  yukle();
                }}
              />
            )}

            <section aria-labelledby="havuzlu-okullar" className="space-y-2">
              <h2 id="havuzlu-okullar" className="font-semibold text-gray-900">
                Havuzu olan okullar{liste && ` · ${ayAdi(liste.ay)}`}
              </h2>
              {liste === null && <p className="text-sm text-gray-400">Yükleniyor…</p>}
              {liste?.okullar.length === 0 && (
                <p className="bg-white border border-dashed border-gray-300 rounded-2xl p-5 text-center text-sm text-gray-500">Henüz havuz atanmış okul yok.</p>
              )}
              {liste && liste.okullar.length > 0 && (
                <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Havuzu olan okullar ve bu ayki kullanım</caption>
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                        <th scope="col" className="px-3 py-2 font-medium">Okul</th>
                        <th scope="col" className="px-3 py-2 font-medium">Aylık havuz</th>
                        <th scope="col" className="px-3 py-2 font-medium">Bu ay kullanılan</th>
                        <th scope="col" className="px-3 py-2 font-medium">
                          <span className="sr-only">İşlem</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {liste.okullar.map((o) => (
                        <tr key={o.okulId} className="border-b border-gray-50 last:border-0">
                          <th scope="row" className="px-3 py-2 font-medium text-gray-900 text-left">
                            {o.ad}
                          </th>
                          <td className="px-3 py-2">{o.hak}</td>
                          <td className="px-3 py-2">
                            {o.kullanilan}
                            {o.kullanilan >= o.hak && <span className="ml-2 text-xs text-amber-700">doldu</span>}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() => {
                                setMesaj("");
                                setSecili(o);
                              }}
                              className="text-xs text-indigo-700 font-semibold hover:underline"
                            >
                              Değiştir
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

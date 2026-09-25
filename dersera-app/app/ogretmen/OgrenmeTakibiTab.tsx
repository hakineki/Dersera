"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GOREV_TUR_ADI } from "@/app/composer/labels";
import { oncekiAy, pekistirmeAdresi, TAKIP, type Gidisat, type KazanimSatiri, type TakipRaporu } from "@/lib/ogrenmeTakibi";
import { takipRaporuGetir } from "@/lib/ogrenmeTakibiClient";
import { yuzde, ZORLUK } from "./OgrenmeRaporu";

const GIDISAT: Record<Gidisat, { ok: string; ad: string; sinif: string }> = {
  yukseliyor: { ok: "↑", ad: "Yükseliyor", sinif: "text-green-700" },
  dusuyor: { ok: "↓", ad: "Düşüyor", sinif: "text-red-700" },
  sabit: { ok: "→", ad: "Sabit", sinif: "text-gray-500" },
};

const ayAdi = (ay: string, month: "short" | "long") =>
  new Date(`${ay}-15T12:00:00Z`).toLocaleDateString("tr-TR", month === "long" ? { month: "long", year: "numeric" } : { month: "short" });
const sonrakiAy = (ay: string) => {
  const [y, m] = ay.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
const turAdi = (t: string) => (GOREV_TUR_ADI as Record<string, string>)[t] ?? t;
const toplam = (x: number[]) => x.reduce((a, b) => a + b, 0);

function Kutu({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2">
      <p className="text-xs text-gray-500">{etiket}</p>
      <p className="font-bold text-gray-900">{deger}</p>
    </div>
  );
}

function CiktiSatiri({ s, aylar }: { s: KazanimSatiri; aylar: string[] }) {
  const adres = s.zorluk === "zor" || s.zorluk === "orta" ? pekistirmeAdresi(s) : null;
  return (
    <tr className="border-b border-gray-50 align-top">
      <th scope="row" className="py-2 pr-2 font-normal text-left min-w-44 max-w-xs">
        <span className="font-mono text-xs text-gray-900">{s.kod}</span>
        {s.tanim ? (
          <>
            <span className="block text-xs text-gray-700">{s.tanim.metin}</span>
            <span className="block text-xs text-gray-500">
              {s.tanim.dersAd} · {s.tanim.sinif}. sınıf · {s.tanim.uniteAd}
            </span>
          </>
        ) : (
          <span className="block text-xs text-gray-500">Programda bulunamadı</span>
        )}
      </th>
      <td className="py-2 pr-2 text-xs text-gray-700 whitespace-nowrap">
        {s.oyun} oyun
        <span className="block text-gray-500">{s.deneme} deneme</span>
      </td>
      <td className="py-2 pr-2">
        <span className="font-semibold">{yuzde(s.ilkDenemeOrani)}</span>
        {s.ilkDenemeOrani !== null && (
          <span className="block h-1.5 bg-gray-100 rounded-full mt-1 w-20" aria-hidden="true">
            <span className="block h-full bg-indigo-500 rounded-full" style={{ width: `${Math.round(s.ilkDenemeOrani * 100)}%` }} />
          </span>
        )}
      </td>
      <td className="py-2 pr-2">{yuzde(s.destekOrani)}</td>
      <td className="py-2 pr-2 text-xs text-gray-600 whitespace-nowrap">
        {s.aylar.map((o, i) => (
          <span key={aylar[i]} className="inline-block mr-2">
            <span className="text-gray-400">{ayAdi(aylar[i], "short")}</span> {yuzde(o)}
          </span>
        ))}
        {s.gidisat && (
          <span className={`block font-medium ${GIDISAT[s.gidisat].sinif}`}>
            <span aria-hidden="true">{GIDISAT[s.gidisat].ok}</span> {GIDISAT[s.gidisat].ad}
          </span>
        )}
      </td>
      <td className="py-2">
        <span className={`text-xs border rounded-full px-2 py-0.5 whitespace-nowrap ${ZORLUK[s.zorluk].sinif}`}>{ZORLUK[s.zorluk].ad}</span>
        {adres && (
          <Link href={adres} className="block mt-2 text-xs font-semibold text-indigo-700 hover:text-indigo-900 whitespace-nowrap">
            Pekiştirme oyunu oluştur →
          </Link>
        )}
      </td>
    </tr>
  );
}

// Öğretmenin tüm Composer oyunları boyunca öğrenme çıktısı bazında son üç ay (lib/ogrenmeTakibi.ts).
export default function OgrenmeTakibiTab() {
  // null: bu ay (sunucu Türkiye saatine göre belirler).
  const [ay, setAy] = useState<string | null>(null);
  const [buAy, setBuAy] = useState<string | null>(null);
  const [rapor, setRapor] = useState<TakipRaporu | null>(null);
  const [durum, setDurum] = useState<"yukleniyor" | "hazir" | "hata">("yukleniyor");

  useEffect(() => {
    let iptal = false;
    const t = setTimeout(async () => {
      setDurum("yukleniyor");
      const r = await takipRaporuGetir(ay);
      if (iptal) return;
      setRapor(r);
      setDurum(r ? "hazir" : "hata");
      if (r && ay === null) setBuAy(r.aylar[r.aylar.length - 1]);
    });
    return () => {
      iptal = true;
      clearTimeout(t);
    };
  }, [ay]);

  const son = rapor?.aylar[rapor.aylar.length - 1] ?? null;
  const zorlanilan = rapor?.kazanimlar.filter((k) => k.zorluk === "zor").length ?? 0;

  return (
    <section aria-labelledby="ogrenme-takibi" className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-xl">
            <h2 id="ogrenme-takibi" className="font-bold text-gray-900">
              Öğrenme takibi
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Yayınladığın oyunlardaki öğrenci sonuçları, öğrenme çıktısı bazında son {TAKIP.aySayisi} ay. Öğrenci adı tutulmaz; oranlar en az {TAKIP.enAzDeneme} durak
              denemesiyle gösterilir. Giriş yapmadan yayınlanan, bu özellikten önceki oyunlar ve kendi deneme oynayışların sayılmaz.
            </p>
          </div>
          {son && (
            <div className="flex items-center gap-2 text-sm">
              <button type="button" onClick={() => setAy(oncekiAy(son))} disabled={durum === "yukleniyor"} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                ← Önceki
              </button>
              <span className="font-semibold text-gray-800 whitespace-nowrap">
                {ayAdi(rapor!.aylar[0], "short")} – {ayAdi(son, "long")}
              </span>
              <button
                type="button"
                onClick={() => setAy(sonrakiAy(son))}
                disabled={durum === "yukleniyor" || son === buAy}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Sonraki →
              </button>
            </div>
          )}
        </div>
      </div>

      {durum === "yukleniyor" && !rapor && <p className="text-sm text-gray-500">Yükleniyor…</p>}
      {durum === "hata" && <p className="text-sm text-red-700">Öğrenme takibi okunamadı. Sayfayı yenileyip tekrar dene.</p>}

      {rapor && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Kutu etiket="Bitiren öğrenci" deger={String(toplam(rapor.bitiren))} />
            <Kutu etiket="Oynatılan oyun" deger={String(toplam(rapor.oyun))} />
            <Kutu etiket="Çalışılan çıktı" deger={String(rapor.kazanimlar.length)} />
            <Kutu etiket="Zorlanılan çıktı" deger={String(zorlanilan)} />
          </div>

          {rapor.kazanimlar.length === 0 ? (
            <p className="bg-white border border-gray-200 rounded-2xl p-4 text-sm text-gray-500">
              Bu dönemde henüz sonuç yok. Öğrenciler yayınladığın oyunları bitirdikçe çıktılar burada birikir.
            </p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <h3 className="font-semibold text-gray-900">Öğrenme çıktıları</h3>
              <p className="text-xs text-gray-500 mb-2">
                En çok zorlanılan önce. &ldquo;Pekiştirme oyunu oluştur&rdquo; Composer&apos;ı bu çıktının konusu ve bir ön notla açar; oluşturmadan önce
                değiştirebilirsin, kredi yalnız oluşturunca düşer.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Öğrenme çıktılarına göre son {TAKIP.aySayisi} ayın sonuçları</caption>
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                      <th scope="col" className="py-1.5 pr-2 font-medium">
                        Öğrenme çıktısı
                      </th>
                      <th scope="col" className="py-1.5 pr-2 font-medium">
                        Veri
                      </th>
                      <th scope="col" className="py-1.5 pr-2 font-medium">
                        İlk denemede doğru
                      </th>
                      <th scope="col" className="py-1.5 pr-2 font-medium">
                        Destek görevi
                      </th>
                      <th scope="col" className="py-1.5 pr-2 font-medium">
                        Ay ay
                      </th>
                      <th scope="col" className="py-1.5 font-medium">
                        Durum
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rapor.kazanimlar.map((s) => (
                      <CiktiSatiri key={s.kod} s={s} aylar={rapor.aylar} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {rapor.turler.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <h3 className="font-semibold text-gray-900">Görev türleri</h3>
              <p className="text-xs text-gray-500 mb-2">Hangi görev türünde öğrencilerin ilk denemede doğru cevapladığı; tüm çıktılar birlikte.</p>
              <table className="w-full text-sm">
                <caption className="sr-only">Görev türlerine göre son {TAKIP.aySayisi} ayın sonuçları</caption>
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th scope="col" className="py-1.5 pr-2 font-medium">
                      Görev türü
                    </th>
                    <th scope="col" className="py-1.5 pr-2 font-medium">
                      Deneme
                    </th>
                    <th scope="col" className="py-1.5 pr-2 font-medium">
                      İlk denemede doğru
                    </th>
                    <th scope="col" className="py-1.5 font-medium">
                      Destek görevi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rapor.turler.map((t) => (
                    <tr key={t.tur} className="border-b border-gray-50">
                      <th scope="row" className="py-1.5 pr-2 font-normal text-left text-gray-900">
                        {turAdi(t.tur)}
                      </th>
                      <td className="py-1.5 pr-2">{t.deneme}</td>
                      <td className="py-1.5 pr-2 font-semibold">{yuzde(t.ilkDenemeOrani)}</td>
                      <td className="py-1.5">{yuzde(t.destekOrani)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

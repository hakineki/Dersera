"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GameDefinition } from "@/lib/composer/definition";
import type { LeaderboardEntry } from "@/lib/gameState";
import { fetchGame } from "@/lib/gamesClient";
import { ogrenmeRaporu, RAPOR_KURALLARI, type OgrenmeRaporu, type Zorluk } from "@/lib/ogrenmeRaporu";

const ZORLUK: Record<Zorluk, { ad: string; sinif: string }> = {
  zor: { ad: "Zorlanıldı", sinif: "bg-red-50 text-red-800 border-red-200" },
  orta: { ad: "Orta", sinif: "bg-amber-50 text-amber-800 border-amber-200" },
  iyi: { ad: "İyi", sinif: "bg-green-50 text-green-800 border-green-200" },
  "az-veri": { ad: "Az veri", sinif: "bg-gray-50 text-gray-600 border-gray-200" },
};

const yuzde = (x: number | null) => (x === null ? "—" : `%${Math.round(x * 100)}`);

function Kutu({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2">
      <p className="text-xs text-gray-500">{etiket}</p>
      <p className="font-bold text-gray-900">{deger}</p>
    </div>
  );
}

export function OgrenmeRaporuGorunumu({ rapor }: { rapor: OgrenmeRaporu }) {
  return (
    <section aria-labelledby="ogrenme-raporu" className="bg-white border border-gray-200 rounded-2xl p-4 mb-5 space-y-4">
      <div>
        <h2 id="ogrenme-raporu" className="font-bold text-gray-900">
          Öğrenme raporu
        </h2>
        <p className="text-xs text-gray-500">
          Sınıfın toplu sonuçları: hangi öğrenme çıktısında zorlanıldığı. İlk denemede doğru cevap oranına göre sıralanır; {RAPOR_KURALLARI.enAzOgrenci} öğrenciden
          az veri olan satırlar yorumlanmaz.
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Oranlar oyunu bitiren öğrencilerin cevaplarından hesaplanır; yarıda bırakanların cevapları görünmez, bu yüzden gerçek zorluk biraz daha yüksek olabilir.
          Final görevi bu rapora dahil değildir.
        </p>
        {rapor.katilimTutarsiz && <p className="text-xs text-amber-700 mt-1">Katılım sayısı eksik okundu; katılan en az bitiren kadar gösteriliyor.</p>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Kutu etiket="Katılan" deger={rapor.katilan === null ? "—" : String(rapor.katilan)} />
        <Kutu etiket="Bitiren" deger={`${rapor.bitiren}${rapor.bitirmeOrani === null ? "" : ` (${yuzde(rapor.bitirmeOrani)})`}`} />
        <Kutu etiket="Bitirmeyen" deger={rapor.bitirmeyen === null ? "—" : String(rapor.bitirmeyen)} />
        <Kutu etiket="Ortanca süre" deger={rapor.medyanSureDk === null ? "—" : `${rapor.medyanSureDk.toLocaleString("tr-TR")} dk`} />
      </div>

      {rapor.bitiren === 0 ? (
        <p className="text-sm text-gray-500">Henüz oyunu bitiren öğrenci yok; rapor ilk sonuçlarla oluşur.</p>
      ) : (
        <>
          <table className="w-full text-sm">
            <caption className="sr-only">Öğrenme çıktılarına göre sınıf sonuçları</caption>
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th scope="col" className="py-1.5 pr-2 font-medium">
                  Öğrenme çıktısı
                </th>
                <th scope="col" className="py-1.5 pr-2 font-medium">
                  İlk denemede doğru
                </th>
                <th scope="col" className="py-1.5 pr-2 font-medium">
                  Destek görevine düşen
                </th>
                <th scope="col" className="py-1.5 font-medium">
                  Durum
                </th>
              </tr>
            </thead>
            <tbody>
              {rapor.hedefler.map((h) => (
                <tr key={h.kod} className="border-b border-gray-50 align-top">
                  <th scope="row" className="py-2 pr-2 font-normal">
                    <span className="font-mono text-xs text-gray-900">{h.kod}</span>
                    <span className="block text-xs text-gray-500">
                      {h.duraklar.join(", ")} · {h.ogrenci} öğrenci
                    </span>
                  </th>
                  <td className="py-2 pr-2">
                    <span className="font-semibold">{yuzde(h.ilkDenemeOrani)}</span>
                    {h.ilkDenemeOrani !== null && (
                      <span className="block h-1.5 bg-gray-100 rounded-full mt-1 w-24" aria-hidden="true">
                        <span className="block h-full bg-indigo-500 rounded-full" style={{ width: `${Math.round(h.ilkDenemeOrani * 100)}%` }} />
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-2">{yuzde(h.destekOrani)}</td>
                  <td className="py-2">
                    <span className={`text-xs border rounded-full px-2 py-0.5 ${ZORLUK[h.zorluk].sinif}`}>{ZORLUK[h.zorluk].ad}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <details className="text-sm">
            <summary className="cursor-pointer text-indigo-700 font-medium">Durak durak ayrıntı</summary>
            <ul className="mt-2 space-y-1">
              {rapor.duraklar.map((d) => (
                <li key={d.id} className="flex flex-wrap gap-x-3 text-xs text-gray-700">
                  <span className="font-semibold text-gray-900">{d.isim}</span>
                  <span>{d.ulasan} öğrenci</span>
                  <span>ilk denemede doğru {yuzde(d.ilkDenemeOrani)}</span>
                  <span>ortalama yanlış {d.ortalamaYanlis === null ? "—" : d.ortalamaYanlis.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}</span>
                  <span>destek {yuzde(d.destekOrani)}</span>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}

// Katılan sayısı oyundan okunur; yeni sonuç geldikçe en çok dakikada bir tekrar sorulur.
const KATILIM_YENILEME_MS = 60_000;

export default function OgrenmeRaporuKarti({ definition, leaderboard, gameCode }: { definition: GameDefinition; leaderboard: LeaderboardEntry[]; gameCode: string }) {
  const [katilan, setKatilan] = useState<number | null>(null);
  const sonOkuma = useRef<{ kod: string; zaman: number } | null>(null);
  useEffect(() => {
    const son = sonOkuma.current;
    if (son && son.kod === gameCode && Date.now() - son.zaman < KATILIM_YENILEME_MS) return;
    sonOkuma.current = { kod: gameCode, zaman: Date.now() };
    let iptal = false;
    fetchGame(gameCode).then((r) => {
      if (!iptal && r.status === "ok" && typeof r.players === "number") setKatilan(r.players);
    });
    return () => {
      iptal = true;
    };
  }, [gameCode, leaderboard.length]);
  const rapor = useMemo(() => ogrenmeRaporu(definition, leaderboard, katilan), [definition, leaderboard, katilan]);
  return <OgrenmeRaporuGorunumu rapor={rapor} />;
}

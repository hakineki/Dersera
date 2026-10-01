"use client";

import { MEKANLAR, mekanOf } from "@/data/mekanlar";
import type { RotaSecimi } from "@/lib/composer/input";
import { MEKAN_SINIRLARI } from "@/lib/mekan";

export type RotaSatiri = RotaSecimi | null;

// Gönderilecek rota seçimi: durak sayısı kadar satır, boş ad atılır; hiç mekân seçilmediyse undefined (hepsi rehberde).
export function rotaSecimiGovdesi(deger: RotaSatiri[], durakSayisi: number): RotaSatiri[] | undefined {
  const satirlar = Array.from({ length: durakSayisi }, (_, i) => deger[i] ?? null).map(
    (s) => s && { mekan_id: s.mekan_id, ...(s.ad?.trim() ? { ad: s.ad.trim() } : {}), ...(s.nokta?.trim() ? { nokta: s.nokta.trim() } : {}) }
  );
  return satirlar.some(Boolean) ? satirlar : undefined;
}

// Okul macerasının rotası: her durak için okulun bir mekânı ya da "Rehber seçsin". Seçilen mekân diğer satırlarda pasiftir
// (her mekân bir kez); adı okula göre yazılabilir ("Sınıf" → "10-A sınıfı").
export default function RotaSecici({ durakSayisi, deger, onChange }: { durakSayisi: number; deger: RotaSatiri[]; onChange: (v: RotaSatiri[]) => void }) {
  const satirlar = Array.from({ length: durakSayisi }, (_, i) => deger[i] ?? null);
  const yaz = (i: number, s: RotaSatiri) => onChange(satirlar.map((x, j) => (j === i ? s : x)));
  const secilen = satirlar.filter(Boolean).length;
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-gray-700 mb-2">Rota: durakların okuldaki yeri</legend>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <p className="text-xs text-gray-500 flex-1 min-w-[12rem]">
          Her durağın okuldaki yerini seç ya da rehbere bırak. İstersen QR&apos;ı yapıştıracağın noktayı da yaz: rehber bilmeceyi o noktaya göre kurar,
          son ipucu yazdığın noktayı söyler. Takımlar farklı duraklardan başlar ve rotayı sırayla dolaşır.
        </p>
        <button
          type="button"
          onClick={() => onChange(satirlar.map(() => null))}
          disabled={secilen === 0}
          className="text-xs font-semibold text-indigo-700 border border-indigo-200 rounded-lg px-2.5 py-1.5 disabled:text-gray-400 disabled:border-gray-200"
        >
          🧭 Tamamını rehbere bırak
        </button>
      </div>
      <ol className="space-y-2">
        {satirlar.map((s, i) => {
          const m = s ? mekanOf(s.mekan_id) : null;
          return (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <span className="w-6 shrink-0 text-sm font-semibold text-gray-500">{i + 1}.</span>
              <select
                aria-label={`${i + 1}. durağın mekânı`}
                className="flex-1 min-w-0 border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white"
                value={s?.mekan_id ?? ""}
                onChange={(e) => yaz(i, e.target.value ? { mekan_id: e.target.value } : null)}
              >
                <option value="">🧭 Rehber seçsin</option>
                {MEKANLAR.map((x) => (
                  <option key={x.id} value={x.id} disabled={satirlar.some((o, j) => j !== i && o?.mekan_id === x.id)}>
                    {x.emoji} {x.ad}
                  </option>
                ))}
              </select>
              {m && (
                <input
                  aria-label={`${i + 1}. durağın okuldaki adı`}
                  className="basis-full ml-8 sm:ml-0 sm:basis-auto sm:flex-1 min-w-0 border border-gray-300 rounded-xl px-3 py-2 text-sm"
                  maxLength={MEKAN_SINIRLARI.adEnCok}
                  value={s?.ad ?? m.ad}
                  placeholder={m.ayrintiOrnegi ?? m.ad}
                  onChange={(e) => yaz(i, { ...s, mekan_id: m.id, ad: e.target.value })}
                />
              )}
              {m && (
                <input
                  aria-label={`${i + 1}. durağın noktası (isteğe bağlı)`}
                  className="basis-full ml-8 min-w-0 border border-gray-300 rounded-xl px-3 py-2 text-sm"
                  maxLength={MEKAN_SINIRLARI.noktaEnCok}
                  value={s?.nokta ?? ""}
                  placeholder="Nokta (boşsa rehber seçer), ör. pencere kenarındaki masanın üstü"
                  onChange={(e) => yaz(i, { ...s, mekan_id: m.id, nokta: e.target.value })}
                />
              )}
            </li>
          );
        })}
      </ol>
    </fieldset>
  );
}

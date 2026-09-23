"use client";

import type { OgrenmeCiktisi } from "@/data/mufredat/programlar";
import type { GameDefinition } from "@/lib/composer/definition";
import { summarize, type ValidationResult } from "@/lib/composer/validator";
import type { Duzenlenen } from "./DurakEditor";
import { ALAN_SECENEKLERI, DENEYIM_SECENEKLERI, GOREV_TUR_ADI } from "./labels";

function Ozet({ etiket, deger }: { etiket: string; deger: string | number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2">
      <p className="text-[11px] text-gray-500">{etiket}</p>
      <p className="font-bold text-gray-900 text-sm">{deger}</p>
    </div>
  );
}

export default function ComposerPreview({
  definition,
  validation,
  hedefler,
  onEdit,
  onPublish,
  onNew,
  publishing,
  publishError,
  kutuphane,
}: {
  definition: GameDefinition;
  validation: ValidationResult;
  hedefler: OgrenmeCiktisi[];
  onEdit: (item: Duzenlenen) => void;
  onPublish: () => void;
  onNew: () => void;
  publishing: boolean;
  publishError: string;
  kutuphane: { durum: "kayitsiz" | "degisti" | "kaydedildi" | "kaydediliyor"; hata: string; onSave: () => void };
}) {
  const ozet = summarize(definition);
  const hedefMetni = (kod: string) => hedefler.find((h) => h.kod === kod)?.metin ?? "";
  const m = definition.meta;
  const durakAdi = (id: string) => definition.duraklar.find((d) => d.id === id)?.isim ?? id;

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Önizleme</p>
        <h1 className="text-2xl font-bold text-gray-900">{m.baslik}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {m.sinif}. sınıf · {m.ders} · {m.konu}
        </p>
        <p className="text-gray-700 text-sm leading-relaxed mt-3">{definition.hikaye_giris}</p>
      </header>

      <section aria-label="Oyun özeti" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Ozet etiket="Tahmini süre" deger={`${m.sure_dk} dk`} />
        <Ozet etiket="Durak" deger={ozet.durak} />
        <Ozet etiket="Görev" deger={ozet.gorev} />
        <Ozet etiket="Dallanma" deger={ozet.dallanma} />
        <Ozet etiket="Kanıt / nesne" deger={ozet.nesne} />
        <Ozet etiket="Deneyim" deger={DENEYIM_SECENEKLERI.find((d) => d.key === m.deneyim)!.ad} />
        <Ozet etiket="Oyun alanı" deger={ALAN_SECENEKLERI.find((a) => a.key === m.alan)!.ad} />
      </section>

      {!validation.gecerli && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="font-semibold text-red-800 text-sm mb-2">Bu oyun yayınlanamaz. Düzeltilmesi gerekenler:</p>
          <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
            {validation.hatalar.map((h, i) => (
              <li key={i}>{h.mesaj}</li>
            ))}
          </ul>
          <p className="text-xs text-red-600 mt-2">İlgili durağı düzenleyebilir ya da oyunu yeniden oluşturabilirsiniz.</p>
        </div>
      )}
      {validation.uyarilar.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
          {validation.uyarilar.map((u, i) => (
            <p key={i}>ℹ️ {u.mesaj}</p>
          ))}
        </div>
      )}

      <section aria-label="Duraklar" className="space-y-2">
        <h2 className="font-semibold text-gray-800">Duraklar</h2>
        {definition.duraklar.map((d, i) => {
          const hatali = validation.hatalar.some((h) => h.durakId === d.id);
          return (
            <button
              key={d.id}
              onClick={() => onEdit({ tur: "durak", durak: d })}
              className={`w-full text-left bg-white border rounded-xl p-4 hover:border-indigo-300 transition-colors ${hatali ? "border-red-300" : "border-gray-200"}`}
            >
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs text-gray-400">{i + 1}.</span>
                <span className="font-semibold text-gray-900">{d.isim}</span>
                <span className="text-[11px] bg-indigo-50 text-indigo-700 rounded px-1.5 py-0.5">{GOREV_TUR_ADI[d.gorev.tur]}</span>
                {d.sahne_turu === "secim" && <span className="text-[11px] bg-amber-50 text-amber-700 rounded px-1.5 py-0.5">🔀 Seçim</span>}
                {d.mekan.qr_durak_id && <span className="text-[11px] bg-[#3B2F9E] text-white rounded px-1.5 py-0.5">QR {d.mekan.qr_durak_id.replace("qr-", "")}</span>}
                {d.gorev.odul_id && <span className="text-[11px] bg-green-50 text-green-700 rounded px-1.5 py-0.5">🔍 {definition.envanter.find((e) => e.id === d.gorev.odul_id)?.isim}</span>}
                <span className="ml-auto text-xs text-indigo-600">Düzenle ›</span>
              </div>
              <p className="text-xs text-gray-500">
                <span className="font-mono">{d.gorev.ogrenme_hedefi}</span> {hedefMetni(d.gorev.ogrenme_hedefi)}
              </p>
              <p className="text-sm text-gray-700 mt-1 line-clamp-2">{d.gorev.soru}</p>
              {d.secimler.length > 0 && (
                <p className="text-xs text-amber-700 mt-1">{d.secimler.map((s) => `${s.metin} → ${durakAdi(s.hedef_durak_id)}`).join(" · ")}</p>
              )}
            </button>
          );
        })}
      </section>

      <section aria-label="Final">
        <button
          onClick={() => onEdit({ tur: "final", final: definition.final })}
          className="w-full text-left bg-indigo-900 text-white rounded-xl p-4 hover:bg-indigo-800 transition-colors"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold">🏁 Final</span>
            <span className="text-[11px] bg-white/15 rounded px-1.5 py-0.5">{GOREV_TUR_ADI[definition.final.gorev_turu]}</span>
            <span className="ml-auto text-xs text-indigo-200">Düzenle ›</span>
          </div>
          <p className="text-sm text-indigo-100">{definition.final.soru}</p>
          {definition.final.gerekli_nesneler.length > 0 && (
            <p className="text-xs text-indigo-200 mt-1">
              Gerekli: {definition.final.gerekli_nesneler.map((id) => definition.envanter.find((e) => e.id === id)?.isim ?? id).join(", ")}
            </p>
          )}
        </button>
      </section>

      {publishError && (
        <p role="alert" className="text-sm text-red-600">
          {publishError}
        </p>
      )}

      {kutuphane.hata && (
        <p role="alert" className="text-sm text-red-600">
          {kutuphane.hata}
        </p>
      )}

      <div className="sticky bottom-0 bg-gray-50/95 backdrop-blur py-3 flex gap-2">
        <button onClick={() => onEdit({ tur: "durak", durak: definition.duraklar[0] })} className="flex-1 border border-indigo-300 text-indigo-700 font-semibold py-3 rounded-xl">
          Düzenle
        </button>
        <button
          onClick={kutuphane.onSave}
          disabled={kutuphane.durum === "kaydedildi" || kutuphane.durum === "kaydediliyor"}
          className="flex-1 border border-indigo-300 text-indigo-700 disabled:text-green-700 disabled:border-green-300 font-semibold py-3 rounded-xl"
        >
          {{ kayitsiz: "📚 Kütüphaneye kaydet", degisti: "📚 Kütüphanede güncelle", kaydedildi: "✓ Kütüphanede", kaydediliyor: "Kaydediliyor…" }[kutuphane.durum]}
        </button>
        <button
          onClick={onPublish}
          disabled={!validation.gecerli || publishing}
          className="flex-[2] bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-bold py-3 rounded-xl"
        >
          {publishing ? "Yayınlanıyor…" : "🚀 Yayınla"}
        </button>
      </div>
      <button onClick={onNew} className="w-full text-sm text-gray-500 underline">
        Baştan yeni oyun oluştur
      </button>
    </div>
  );
}

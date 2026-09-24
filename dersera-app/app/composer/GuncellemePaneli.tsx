"use client";

import { useState } from "react";
import type { GameDefinition } from "@/lib/composer/definition";
import { GUNCELLEME } from "@/lib/composer/limits";
import { KREDI_KURALLARI, type KrediDurumu } from "@/lib/kredi";
import { krediMetni } from "@/lib/krediClient";

// Yapay zekâyla güncelleme (1 kredi): en çok üç durak ve bir talimat. Elle düzenleme ayrıca ücretsizdir.
// onGuncelle hata mesajı döner; başarıda null (önizleme yeni tanımla yenilenir).
export default function GuncellemePaneli({
  definition,
  kredi,
  onGuncelle,
}: {
  definition: GameDefinition;
  kredi: KrediDurumu | null;
  onGuncelle: (idler: string[], talimat: string) => Promise<string | null>;
}) {
  const [secili, setSecili] = useState<string[]>([]);
  const [talimat, setTalimat] = useState("");
  const [calisiyor, setCalisiyor] = useState(false);
  const [hata, setHata] = useState("");
  const [bilgi, setBilgi] = useState("");
  const maliyet = KREDI_KURALLARI.guncelleme;
  const yetersiz = !!kredi && kredi.toplam < maliyet;
  const dolu = secili.length >= GUNCELLEME.enCokDurak;
  const hazir = secili.length > 0 && talimat.trim().length >= GUNCELLEME.talimatEnAz && !yetersiz && !calisiyor;

  const degistir = (id: string) => setSecili((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < GUNCELLEME.enCokDurak ? [...s, id] : s));

  async function gonder() {
    setCalisiyor(true);
    setHata("");
    setBilgi("");
    const sonuc = await onGuncelle(secili, talimat.trim());
    if (sonuc) setHata(sonuc);
    else {
      const adlar = definition.duraklar.filter((d) => secili.includes(d.id)).map((d) => d.isim);
      setBilgi(`${adlar.join(", ")} güncellendi; yayınlamadan önce önizlemede gözden geçirin.`);
      setSecili([]);
      setTalimat("");
    }
    setCalisiyor(false);
  }

  return (
    <details className="bg-white border border-indigo-200 rounded-xl p-4 group">
      <summary className="cursor-pointer font-semibold text-indigo-900 text-sm">
        <span aria-hidden="true">✨ </span>Yapay zekâyla güncelle <span className="font-normal text-gray-500">({maliyet} kredi)</span>
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-gray-600">
          Seçtiğin durakları talimatına göre yeniden yazdırır. Rota, ödüller ve öğrenme hedefleri aynı kalır. Küçük değişiklikler için durağa tıklayıp elle
          düzenlemek ücretsizdir.
        </p>
        <fieldset>
          <legend className="text-sm font-semibold text-gray-700 mb-1">
            Güncellenecek duraklar <span className="font-normal text-gray-500">(en çok {GUNCELLEME.enCokDurak})</span>
          </legend>
          <div className="grid sm:grid-cols-2 gap-1.5">
            {definition.duraklar.map((d, i) => {
              const secildi = secili.includes(d.id);
              return (
                <label key={d.id} className={`flex items-center gap-2 text-sm rounded-lg border px-2.5 py-1.5 ${secildi ? "border-indigo-400 bg-indigo-50" : "border-gray-200"} ${!secildi && dolu ? "opacity-50" : ""}`}>
                  <input type="checkbox" checked={secildi} disabled={!secildi && dolu} onChange={() => degistir(d.id)} className="accent-indigo-600" />
                  <span className="text-xs text-gray-400">{i + 1}.</span>
                  <span className="truncate">{d.isim}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div>
          <label htmlFor="guncelleme-talimat" className="text-sm font-semibold text-gray-700 block mb-1">
            Ne değişsin?
          </label>
          <textarea
            id="guncelleme-talimat"
            value={talimat}
            maxLength={GUNCELLEME.talimatEnCok}
            onChange={(e) => setTalimat(e.target.value)}
            rows={3}
            placeholder="Ör. Soruları biraz daha zorlaştır ve günlük hayattan örnek kullan."
            aria-describedby="guncelleme-sayac"
            className="w-full border border-gray-300 rounded-lg p-2 text-sm"
          />
          <p id="guncelleme-sayac" className="text-xs text-gray-500 text-right">
            {talimat.length}/{GUNCELLEME.talimatEnCok}
          </p>
        </div>
        <p role="status" className={`text-xs ${yetersiz ? "text-red-700" : "text-gray-600"}`}>
          Bu güncelleme <strong>{maliyet} kredi</strong>
          {kredi && <> · Bakiyen: {krediMetni(kredi)}</>}
          {yetersiz && ". Bakiyen yetmiyor; aylık hakkın ay başında yenilenir."}
          {" "}Güncelleme yapılamazsa kredin iade edilir.
        </p>
        <button onClick={gonder} disabled={!hazir} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold py-2.5 rounded-lg text-sm">
          {calisiyor ? "Güncelleniyor… (bir dakika kadar sürebilir)" : `Seçili durakları güncelle (${maliyet} kredi)`}
        </button>
        {hata && (
          <p role="alert" className="text-sm text-red-600">
            {hata}
          </p>
        )}
        {bilgi && (
          <p role="status" className="text-sm text-green-700">
            {bilgi}
          </p>
        )}
      </div>
    </details>
  );
}

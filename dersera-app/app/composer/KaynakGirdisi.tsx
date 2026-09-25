"use client";

import { useRef, useState } from "react";
import { KAYNAK, kaynakNormal } from "@/lib/composer/kaynak";
import { KREDI_KURALLARI } from "@/lib/kredi";

// İsteğe bağlı kaynak: öğretmen ders notunu yapıştırır ya da PDF'in metni tarayıcıda çıkarılıp bu kutuya düşer.
// Öğretmen gönderilecek metni görür ve kişisel bilgileri silebilir. Kaynak saklanmaz (lib/composer/kaynak.ts).
export default function KaynakGirdisi({ deger, onChange }: { deger: string; onChange: (v: string) => void }) {
  const dosya = useRef<HTMLInputElement>(null);
  const [durum, setDurum] = useState<{ tur: "bos" } | { tur: "okunuyor"; ad: string } | { tur: "hata"; mesaj: string } | { tur: "alindi"; bilgi: string } | { tur: "kirpildi" }>({ tur: "bos" });

  async function pdfSecildi(f: File | undefined) {
    if (!f) return;
    setDurum({ tur: "okunuyor", ad: f.name });
    try {
      const { pdfMetni } = await import("@/lib/pdfMetni");
      const r = await pdfMetni(f);
      if (!r.ok) return setDurum({ tur: "hata", mesaj: r.hata });
      onChange(r.metin);
      setDurum({
        tur: "alindi",
        bilgi: r.kirpildi
          ? `${f.name}: ${r.sayfa} sayfanın ilk ${r.alinanSayfa} sayfası alındı (sınır ${KAYNAK.enCok.toLocaleString("tr-TR")} karakter). Gerekirse metni kısaltıp önemli bölümü bırak.`
          : `${f.name}: ${r.sayfa} sayfanın metni alındı.`,
      });
    } catch {
      setDurum({ tur: "hata", mesaj: "PDF okunamadı. Metni kopyalayıp yapıştırmayı dene." });
    } finally {
      if (dosya.current) dosya.current.value = "";
    }
  }

  // Sunucunun ölçtüğü uzunluk (fazla boşluklar sayılmaz).
  const uzunluk = kaynakNormal(deger).length;
  return (
    <div>
      <label htmlFor="kaynak" className="text-sm font-semibold text-gray-700 mb-1 block">
        Kaynak <span className="font-normal text-gray-500">(isteğe bağlı · +{KREDI_KURALLARI.kaynakEki} kredi)</span>
      </label>
      <p id="kaynak-aciklama" className="text-xs text-gray-500 mb-2">
        Kendi ders notunu yapıştır ya da PDF&apos;ini seç; sorular bu kaynaktan üretilir, konu seçimin yine geçerlidir. Kaynak yalnız bu oyunu oluşturmak için
        kullanılır ve saklanmaz. Öğrenci adı gibi kişisel bilgileri metinden çıkar.
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => dosya.current?.click()}
          disabled={durum.tur === "okunuyor"}
          className="text-sm border border-indigo-300 text-indigo-700 font-semibold px-3 py-1.5 rounded-lg hover:bg-indigo-50 disabled:opacity-50"
        >
          <span aria-hidden="true">📄 </span>
          {durum.tur === "okunuyor" ? "PDF okunuyor…" : "PDF'ten al"}
        </button>
        <input ref={dosya} type="file" accept="application/pdf,.pdf" className="hidden" tabIndex={-1} aria-hidden="true" onChange={(e) => pdfSecildi(e.target.files?.[0])} />
        {deger && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setDurum({ tur: "bos" });
            }}
            className="text-sm text-gray-600 font-semibold px-2 py-1.5 rounded-lg hover:bg-gray-100"
          >
            Kaynağı kaldır
          </button>
        )}
      </div>
      {durum.tur === "okunuyor" && (
        <p role="status" className="text-xs text-indigo-700 mb-2">
          {durum.ad} okunuyor…
        </p>
      )}
      {durum.tur === "hata" && (
        <p role="alert" className="text-xs text-red-600 mb-2">
          {durum.mesaj}
        </p>
      )}
      {durum.tur === "kirpildi" && (
        <p role="status" className="text-xs text-amber-700 mb-2">
          Yapıştırılan metin {KAYNAK.enCok.toLocaleString("tr-TR")} karakter sınırını aşıyor; sonu alınmadı. Gerekirse önemli bölümü bırakıp metni kısalt.
        </p>
      )}
      {durum.tur === "alindi" && (
        <p role="status" className="text-xs text-green-700 mb-2">
          {durum.bilgi}
        </p>
      )}
      <textarea
        id="kaynak"
        value={deger}
        onChange={(e) => onChange(e.target.value.slice(0, KAYNAK.enCok))}
        // maxLength yapıştırmayı sessizce kırpar: sınırı aşan yapıştırma öğretmene söylenir.
        onPaste={(e) => {
          const t = e.currentTarget;
          const sonraki = t.value.length - (t.selectionEnd - t.selectionStart) + e.clipboardData.getData("text").length;
          if (sonraki > KAYNAK.enCok) setDurum({ tur: "kirpildi" });
        }}
        maxLength={KAYNAK.enCok}
        rows={deger ? 8 : 3}
        aria-describedby="kaynak-aciklama kaynak-sayac"
        placeholder="Ders notunu buraya yapıştır ya da PDF'ten al…"
        className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <p id="kaynak-sayac" className="text-xs mt-1 flex justify-between gap-3">
        <span className={uzunluk > 0 && uzunluk < KAYNAK.enAz ? "text-red-600" : "text-gray-500"}>
          {uzunluk > 0 && uzunluk < KAYNAK.enAz ? `Kaynak en az ${KAYNAK.enAz} karakter olmalı.` : uzunluk > 0 ? "Oyun bu kaynaktan oluşturulacak." : ""}
        </span>
        <span aria-live={deger.length >= KAYNAK.enCok - 200 ? "polite" : "off"} className="shrink-0 text-gray-500">
          {deger.length.toLocaleString("tr-TR")}/{KAYNAK.enCok.toLocaleString("tr-TR")}
        </span>
      </p>
    </div>
  );
}

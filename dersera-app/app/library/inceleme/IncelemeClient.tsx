"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DerseraLogo from "@/components/DerseraLogo";
import { rozetler, type Karar } from "@/lib/composer/yonetisim";
import { TOPLULUK_KURALLARI as K } from "@/lib/topluluk";
import { incelemeGonder, incelemeListesi, incelemeOyunu, type IncelemeDetayi, type IncelemeListesi } from "@/lib/toplulukClient";
import { ALAN_SECENEKLERI, DENEYIM_SECENEKLERI, GOREV_TUR_ADI } from "@/app/composer/labels";

const tarih = (ms: number) => new Date(ms).toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
const ROZET: Record<Karar, { metin: string; sinif: string }> = {
  PASS: { metin: "✓ Uygun", sinif: "bg-green-50 border-green-200 text-green-800" },
  REVIEW: { metin: "! Gözden geçirin", sinif: "bg-amber-50 border-amber-200 text-amber-800" },
  BLOCK: { metin: "✕ Engel", sinif: "bg-red-50 border-red-200 text-red-800" },
};

export function IncelemeOyunu({ detay }: { detay: IncelemeDetayi }) {
  const d = detay.oyun.definition;
  const hedef = (kod: string) => detay.hedefler.find((h) => h.kod === kod)?.metin ?? "";
  const bulgular = detay.yonetisim?.kapilar.flatMap((k) => k.bulgular) ?? [];
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-bold text-gray-900">{d.meta.baslik}</h2>
        <p className="text-sm text-gray-600">
          {d.meta.sinif}. sınıf · {d.meta.ders} · {d.meta.konu} · {d.meta.sure_dk} dk · {DENEYIM_SECENEKLERI.find((x) => x.key === d.meta.deneyim)?.ad} ·{" "}
          {ALAN_SECENEKLERI.find((x) => x.key === d.meta.alan)?.ad}
        </p>
        <p className="text-sm text-gray-800 mt-2">{d.hikaye_giris}</p>
        <p className="text-sm text-gray-600 mt-1">
          <strong>Amaç:</strong> {d.oyun_amaci}
        </p>
      </header>

      {detay.yonetisim && (
        <section aria-labelledby="denetim">
          <h3 id="denetim" className="font-semibold text-gray-800 text-sm mb-2">
            Otomatik içerik denetimi
          </h3>
          <ul className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {rozetler(detay.yonetisim).map((r) => (
              <li key={r.ad} className={`border rounded-xl px-3 py-2 ${ROZET[r.karar].sinif}`}>
                <p className="text-xs">{r.ad}</p>
                <p className="font-bold text-sm">{ROZET[r.karar].metin}</p>
              </li>
            ))}
          </ul>
          {bulgular.length > 0 && (
            <ul className="mt-2 list-disc list-inside text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
              {bulgular.map((b, i) => (
                <li key={i}>{b.mesaj}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <ol className="space-y-2">
        {d.duraklar.map((durak, i) => (
          <li key={durak.id} className="bg-white border border-gray-200 rounded-xl p-3 text-sm">
            <p className="font-semibold text-gray-900">
              {i + 1}. {durak.isim} <span className="text-xs font-normal text-indigo-600">{GOREV_TUR_ADI[durak.gorev.tur]}</span>
            </p>
            <p className="text-gray-600 mt-1">{durak.hikaye_metni}</p>
            <p className="text-xs text-gray-500 mt-1">
              <span className="font-mono">{durak.gorev.ogrenme_hedefi}</span> {hedef(durak.gorev.ogrenme_hedefi)}
            </p>
            <p className="text-gray-900 mt-1 font-medium">{durak.gorev.soru}</p>
            {durak.gorev.secenekler.length > 0 && <p className="text-gray-600">Seçenekler: {durak.gorev.secenekler.join(" · ")}</p>}
            <p className="text-green-800">Doğru cevap: {durak.gorev.dogru_cevap}</p>
            <p className="text-gray-500 text-xs">
              İpuçları: {durak.gorev.ipucu_1} / {durak.gorev.ipucu_2}
            </p>
            {durak.secimler.length > 0 && <p className="text-amber-700 text-xs mt-1">Seçimler: {durak.secimler.map((s) => s.metin).join(" · ")}</p>}
          </li>
        ))}
        <li className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-sm">
          <p className="font-semibold text-indigo-900">Final</p>
          <p className="text-indigo-900 mt-1">{d.final.soru}</p>
          <p className="text-green-800">Doğru cevap: {d.final.dogru_cevap}</p>
          <p className="text-indigo-800 text-xs mt-1">{d.final.basari_metni}</p>
        </li>
      </ol>
    </div>
  );
}

export function IncelemeFormu({ id, onBitti }: { id: string; onBitti: (mesaj: string) => void }) {
  const [karar, setKarar] = useState<"kabul" | "ret" | null>(null);
  const [not, setNot] = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState("");
  const notEksik = karar === "ret" && not.trim().length < K.notEnAz;

  async function gonder() {
    if (!karar) return;
    setGonderiliyor(true);
    setHata("");
    const r = await incelemeGonder(id, karar, not);
    setGonderiliyor(false);
    if ("error" in r) return setHata(r.error);
    onBitti(
      r.durum === "yayinda"
        ? "Teşekkürler! İkinci onay seninkiydi; oyun artık toplulukta."
        : r.durum === "reddedildi"
          ? "Teşekkürler! Oyun topluluğa alınmadı; gerekçen öğretmene isimsiz iletilecek."
          : "Teşekkürler! İncelemen kaydedildi."
    );
  }

  return (
    <fieldset disabled={gonderiliyor} className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
      <legend className="font-semibold text-gray-900 px-1">Kararın</legend>
      <p className="text-sm text-gray-600">
        Oyun müfredata uygun, doğru ve öğrencilere uygun mu? {K.gerekliKabul} öğretmen kabul ederse toplulukta yayınlanır. İncelemen isimsizdir.
      </p>
      <div className="flex flex-wrap gap-2">
        {(["kabul", "ret"] as const).map((k) => (
          <label key={k} className={`flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer ${karar === k ? "border-indigo-500 bg-indigo-50" : "border-gray-300"}`}>
            <input type="radio" name="karar" value={k} checked={karar === k} onChange={() => setKarar(k)} />
            {k === "kabul" ? "Kabul: toplulukta yayınlansın" : "Ret: düzeltilmesi gerekiyor"}
          </label>
        ))}
      </div>
      <label className="block text-sm">
        <span className="text-gray-700">{karar === "ret" ? `Gerekçe (öğretmene iletilir, en az ${K.notEnAz} karakter)` : "Not (isteğe bağlı)"}</span>
        <textarea
          value={not}
          onChange={(e) => setNot(e.target.value)}
          maxLength={K.notEnCok}
          rows={3}
          className="mt-1 w-full border border-gray-300 rounded-lg p-2 text-sm"
          placeholder={karar === "ret" ? "Örn: 3. duraktaki sorunun doğru cevabı yanlış işaretlenmiş." : ""}
        />
      </label>
      {hata && (
        <p role="alert" className="text-sm text-red-600">
          {hata}
        </p>
      )}
      <button onClick={gonder} disabled={!karar || notEksik} className="bg-indigo-600 text-white font-semibold px-4 py-2 rounded-lg disabled:opacity-40">
        {gonderiliyor ? "Gönderiliyor…" : "İncelemeyi gönder"}
      </button>
    </fieldset>
  );
}

export default function IncelemeClient() {
  const [liste, setListe] = useState<IncelemeListesi | null | "hata">(null);
  const [secili, setSecili] = useState<{ id: string; detay: IncelemeDetayi | null; hata: string } | null>(null);
  const [mesaj, setMesaj] = useState("");

  const yukle = useCallback(async () => {
    setListe((await incelemeListesi()) ?? "hata");
  }, []);

  useEffect(() => {
    const t = setTimeout(yukle);
    return () => clearTimeout(t);
  }, [yukle]);

  async function ac(id: string) {
    setMesaj("");
    setSecili({ id, detay: null, hata: "" });
    const r = await incelemeOyunu(id);
    setSecili("error" in r ? { id, detay: null, hata: r.error } : { id, detay: r, hata: "" });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-900 text-white px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <DerseraLogo />
            <p className="text-xs font-semibold text-indigo-200 border-l border-indigo-700 pl-3">Topluluk İncelemesi</p>
          </div>
          <Link href="/library" className="text-indigo-300 hover:text-white text-sm whitespace-nowrap">
            ← Topluluk Kütüphanesi
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {mesaj && (
          <p role="status" className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-3 text-sm">
            {mesaj}
          </p>
        )}

        {secili ? (
          <div className="space-y-4">
            <button onClick={() => setSecili(null)} className="text-sm text-indigo-700 underline">
              ← İnceleme listesine dön
            </button>
            {secili.hata && (
              <p role="alert" className="text-sm text-red-600">
                {secili.hata}
              </p>
            )}
            {!secili.detay && !secili.hata && <p className="text-sm text-gray-400">Yükleniyor…</p>}
            {secili.detay && (
              <>
                <IncelemeOyunu detay={secili.detay} />
                <IncelemeFormu
                  id={secili.id}
                  onBitti={(m) => {
                    setMesaj(m);
                    setSecili(null);
                    yukle();
                  }}
                />
              </>
            )}
          </div>
        ) : (
          <>
            <div>
              <h1 className="text-xl font-bold text-gray-900">İnceleme bekleyen oyunlar</h1>
              <p className="text-sm text-gray-500">
                Meslektaşlarının topluluğa gönderdiği oyunlar. Her oyun {K.gerekliKabul} öğretmen kabul edince toplulukta yayınlanır; {K.redEsigi} ret alırsa
                gerekçelerle sahibine döner. Kendi oyunların burada görünmez.
              </p>
            </div>
            {liste === null && <p className="text-sm text-gray-400">Yükleniyor…</p>}
            {liste === "hata" && (
              <p role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                Liste yüklenemedi. Öğretmen olarak{" "}
                <Link href="/ogretmen" className="underline font-semibold">
                  giriş yaptığından
                </Link>{" "}
                emin ol.
              </p>
            )}
            {liste && liste !== "hata" && !liste.inceleyebilir && (
              <p className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">{liste.neden}</p>
            )}
            {liste && liste !== "hata" && liste.inceleyebilir && liste.oyunlar.length === 0 && (
              <p className="bg-white border border-dashed border-gray-300 rounded-2xl p-6 text-center text-sm text-gray-500">Şu an inceleme bekleyen oyun yok.</p>
            )}
            {liste && liste !== "hata" && liste.oyunlar.length > 0 && (
              <ul className="space-y-3">
                {liste.oyunlar.map((o) => (
                  <li key={o.oyun_id} className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-bold text-gray-900">{o.baslik}</h2>
                      <p className="text-sm text-gray-600">
                        {o.sinif}. sınıf · {o.ders} · {o.konu} · {o.sure_dk} dk
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {tarih(o.gonderim_tarihi)} gönderildi · {o.kabul}/{K.gerekliKabul} kabul
                      </p>
                    </div>
                    <button onClick={() => ac(o.oyun_id)} className="shrink-0 bg-indigo-600 text-white text-sm font-semibold px-3 py-2 rounded-lg">
                      İncele
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}

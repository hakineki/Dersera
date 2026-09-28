"use client";

import { useEffect, useState } from "react";
import type { Koleksiyon } from "@/lib/koleksiyon";
import type { ToplulukOzeti } from "@/lib/topluluk";
import { koleksiyonAdDegistir, koleksiyondanCikar, koleksiyonGetir, koleksiyonSil } from "@/lib/koleksiyonClient";
import OyunKarti from "./OyunKarti";

type Oge = ToplulukOzeti | { oyun_id: string; kaldirildi: true };

// "Koleksiyonlarım": soldan koleksiyon seçilir; oyunları kartlarla, topluluktan kalkmış oyun ayrı satırla gösterilir.
export default function Koleksiyonlar({ koleksiyonlar, onKoleksiyon }: { koleksiyonlar: Koleksiyon[]; onKoleksiyon: () => void }) {
  const [secili, setSecili] = useState<string | null>(null);
  const [oyunlar, setOyunlar] = useState<Oge[] | null>(null);
  const [yeniAd, setYeniAd] = useState<string | null>(null);
  const [hata, setHata] = useState("");
  const aktif = koleksiyonlar.find((k) => k.id === secili) ?? koleksiyonlar.at(0) ?? null;
  // Seçili koleksiyonun oyun listesi değişince (ekle/çıkar) içerik yeniden okunur.
  const imza = aktif ? `${aktif.id}:${aktif.oyunlar.join(",")}` : "";

  useEffect(() => {
    if (!aktif) return;
    let iptal = false;
    const t = setTimeout(async () => {
      setOyunlar(null);
      const r = await koleksiyonGetir(aktif.id);
      if (iptal) return;
      if ("error" in r) setHata(r.error);
      else setOyunlar(r.oyunlar);
    });
    return () => {
      iptal = true;
      clearTimeout(t);
    };
    // aktif her render'da yeni nesne; içerik imzası değişince okunur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imza]);

  async function yenidenAdlandir() {
    if (!aktif || yeniAd === null) return;
    const r = await koleksiyonAdDegistir(aktif.id, yeniAd);
    if ("error" in r) return setHata(r.error);
    setYeniAd(null);
    setHata("");
    onKoleksiyon();
  }

  async function sil() {
    if (!aktif || !window.confirm(`"${aktif.ad}" koleksiyonu silinsin mi? Oyunlar toplulukta kalır; yalnız bu liste silinir.`)) return;
    const r = await koleksiyonSil(aktif.id);
    if ("error" in r) return setHata(r.error);
    setSecili(null);
    setHata("");
    onKoleksiyon();
  }

  async function cikar(oyunId: string) {
    if (!aktif) return;
    const r = await koleksiyondanCikar(aktif.id, oyunId);
    if ("error" in r) return setHata(r.error);
    onKoleksiyon();
  }

  if (koleksiyonlar.length === 0) {
    return (
      <p className="bg-white border border-dashed border-gray-300 rounded-2xl p-6 text-center text-sm text-gray-500">
        Henüz koleksiyonun yok. Tüm oyunlar görünümünde bir oyun kartında “☆ Koleksiyona ekle” ile ilkini oluştur.
      </p>
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <nav aria-label="Koleksiyonlar" className="md:w-60 shrink-0 bg-white border border-gray-200 rounded-2xl p-2 h-fit">
        <ul>
          {koleksiyonlar.map((k) => (
            <li key={k.id}>
              <button
                type="button"
                onClick={() => {
                  setSecili(k.id);
                  setYeniAd(null);
                }}
                aria-current={k.id === aktif?.id ? "true" : undefined}
                className={`w-full flex justify-between gap-2 text-left text-sm px-3 py-2 rounded-lg ${k.id === aktif?.id ? "bg-indigo-50 text-indigo-900 font-semibold" : "text-gray-700 hover:bg-gray-50"}`}
              >
                <span className="truncate">{k.ad}</span>
                <span className="text-xs text-gray-400">{k.oyunlar.length}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {aktif && (
        <section aria-label={aktif.ad} className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {yeniAd === null ? (
              <>
                <h2 className="text-lg font-bold text-gray-900 mr-2">{aktif.ad}</h2>
                <button type="button" onClick={() => setYeniAd(aktif.ad)} className="text-sm text-indigo-700 font-semibold">
                  Yeniden adlandır
                </button>
                <button type="button" onClick={sil} className="text-sm text-red-600 font-semibold">
                  Sil
                </button>
              </>
            ) : (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  yenidenAdlandir();
                }}
              >
                <label className="sr-only" htmlFor="koleksiyon-adi">
                  Koleksiyon adı
                </label>
                <input id="koleksiyon-adi" value={yeniAd} onChange={(e) => setYeniAd(e.target.value.slice(0, 60))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" autoFocus />
                <button type="submit" className="text-sm font-semibold text-indigo-700">
                  Kaydet
                </button>
                <button type="button" onClick={() => setYeniAd(null)} className="text-sm text-gray-500">
                  Vazgeç
                </button>
              </form>
            )}
          </div>
          {hata && (
            <p role="alert" className="text-sm text-red-600 mb-3">
              {hata}
            </p>
          )}
          {oyunlar === null ? (
            <p className="text-sm text-gray-400">Yükleniyor…</p>
          ) : oyunlar.length === 0 ? (
            <p className="text-sm text-gray-500">Bu koleksiyonda oyun yok.</p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {oyunlar.map((o) =>
                "kaldirildi" in o ? (
                  <li key={o.oyun_id} className="bg-gray-50 border border-dashed border-gray-300 rounded-2xl p-4 text-sm text-gray-500 flex flex-col gap-2">
                    Bu oyun artık toplulukta değil.
                    <button type="button" onClick={() => cikar(o.oyun_id)} className="text-left text-sm text-red-600 font-semibold">
                      Koleksiyondan çıkar
                    </button>
                  </li>
                ) : (
                  <OyunKarti
                    key={o.oyun_id}
                    oyun={o}
                    koleksiyonlar={koleksiyonlar}
                    onKoleksiyon={onKoleksiyon}
                    ek={
                      <button type="button" onClick={() => cikar(o.oyun_id)} className="block w-full mt-2 text-sm text-red-600 font-semibold">
                        Bu koleksiyondan çıkar
                      </button>
                    }
                  />
                )
              )}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

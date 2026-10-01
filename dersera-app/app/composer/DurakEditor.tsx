"use client";

import { useRef, useState } from "react";
import { MEKANLAR, mekanOf } from "@/data/mekanlar";
import type { Durak, Final, KonumYeri } from "@/lib/composer/definition";
import { LIMITLER } from "@/lib/composer/validator";
import { konumBilmeceleriGetir, type HazirBilmece } from "@/lib/konumBilmeceClient";
import { MEKAN_SINIRLARI, noktaDegisikligi } from "@/lib/mekan";
import { CEVAP_BICIMI } from "./labels";

export interface OyunBilgisi {
  baslik: string;
  hikaye_giris: string;
  oyun_amaci: string;
}

export type Duzenlenen = { tur: "durak"; durak: Durak } | { tur: "final"; final: Final } | { tur: "genel"; genel: OyunBilgisi };

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

function Alan({ etiket, children }: { etiket: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1">{etiket}</span>
      {children}
    </label>
  );
}

const input = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
const BASLIKLAR = { durak: "Durağı düzenle", final: "Finali düzenle", genel: "Oyun bilgileri" } as const;
// Topluluk kartı başlığı 120 karakterde kırpar; amaç tek satırlık hedeftir.
const SINIR = { baslik: 120, amac: 200 } as const;

// Görev alanları (soru, seçenekler, doğru cevap) durakta ve finalde ortaktır.
function GorevAlanlari({ v, setV }: { v: Exclude<Duzenlenen, { tur: "genel" }>; setV: (f: (cur: Duzenlenen) => Duzenlenen) => void }) {
  const isDurak = v.tur === "durak";
  const tur = isDurak ? v.durak.gorev.tur : v.final.gorev_turu;
  const soru = isDurak ? v.durak.gorev.soru : v.final.soru;
  const secenekler = isDurak ? v.durak.gorev.secenekler : v.final.secenekler;
  const dogru = isDurak ? v.durak.gorev.dogru_cevap : v.final.dogru_cevap;
  const setGorev = (patch: Partial<{ soru: string; secenekler: string[]; dogru_cevap: string }>) =>
    setV((cur) =>
      cur.tur === "durak"
        ? { ...cur, durak: { ...cur.durak, gorev: { ...cur.durak.gorev, ...patch } } }
        : cur.tur === "final"
          ? { ...cur, final: { ...cur.final, ...patch } }
          : cur
    );
  return (
    <>
      <Alan etiket="Soru">
        <textarea className={input} rows={2} value={soru} onChange={(e) => setGorev({ soru: e.target.value })} />
      </Alan>
      {tur !== "sayisal" && (
        <Alan etiket="Seçenekler (her satıra bir tane)">
          <textarea className={input} rows={4} defaultValue={secenekler.join("\n")} onChange={(e) => setGorev({ secenekler: lines(e.target.value) })} />
        </Alan>
      )}
      <Alan etiket="Doğru cevap">
        <input className={input} value={dogru} onChange={(e) => setGorev({ dogru_cevap: e.target.value })} />
        <span className="block text-[11px] text-gray-400 mt-1">{CEVAP_BICIMI[tur]}</span>
      </Alan>
    </>
  );
}

const bilmeceUygula = (y: KonumYeri, b: HazirBilmece): KonumYeri => ({ ...y, nokta: b.nokta, bilmece: b.bilmece, ipucu_1: b.ipucu1, ipucu_2: b.ipucu2 });

// Mekân rotası: durağın QR yeri ve öğrenciyi oraya götüren konum bilmecesi. Mekân değişince o mekânın ilk hazır bilmecesi
// gelir (nokta eski mekânda kalmasın); öğretmen mekânın diğer bilmecelerinden seçer ve metinleri okuluna göre düzeltir.
function KonumYeriAlani({ yer, kullanilan, onChange }: { yer: KonumYeri; kullanilan: string[]; onChange: (y: KonumYeri) => void }) {
  const [liste, setListe] = useState<{ mekan: string; bilmeceler: HazirBilmece[] } | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  // Açılıştaki mekân: değişirse durağın hikâyesi eski mekânı anlatıyor olabilir.
  const [ilkMekan] = useState(yer.mekan_id);
  // Bir kez yüklenen liste yeniden istenmez (klavyeyle seçim kutusunda gezinirken her mekân bir kez yüklenir).
  const onbellek = useRef(new Map<string, HazirBilmece[]>());
  const S = MEKAN_SINIRLARI;
  const getir = async (mekanId: string) => {
    setYukleniyor(true);
    setHata(null);
    const b = onbellek.current.get(mekanId) ?? (await konumBilmeceleriGetir(mekanId));
    if (b?.length) onbellek.current.set(mekanId, b);
    setYukleniyor(false);
    if (!b?.length) {
      setHata("Hazır bilmeceler yüklenemedi; tekrar deneyin.");
      return null;
    }
    setListe({ mekan: mekanId, bilmeceler: b });
    return b;
  };
  const mekanDegistir = async (id: string) => {
    const m = mekanOf(id);
    const b = m && (await getir(id));
    if (m && b) onChange(bilmeceUygula({ ...yer, mekan_id: m.id, mekan_adi: m.ad }, b[0]));
  };
  const set = (patch: Partial<KonumYeri>) => onChange({ ...yer, ...patch });
  const m = mekanOf(yer.mekan_id);
  return (
    <fieldset aria-busy={yukleniyor} className="border border-indigo-100 bg-indigo-50/40 rounded-xl p-3 space-y-3">
      <legend className="text-xs font-semibold text-indigo-700 px-1">QR yeri ve konum bilmecesi</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Alan etiket="Mekân">
          <select className={`${input} bg-white`} value={yer.mekan_id} disabled={yukleniyor} onChange={(e) => mekanDegistir(e.target.value)}>
            {MEKANLAR.map((x) => (
              <option key={x.id} value={x.id} disabled={x.id !== yer.mekan_id && kullanilan.includes(x.id)}>
                {x.emoji} {x.ad}
              </option>
            ))}
          </select>
        </Alan>
        <Alan etiket="Okuldaki adı">
          <input className={input} maxLength={S.adEnCok} value={yer.mekan_adi} placeholder={m?.ayrintiOrnegi ?? m?.ad} onChange={(e) => set({ mekan_adi: e.target.value })} />
        </Alan>
      </div>
      {yer.mekan_id !== ilkMekan && (
        <p role="status" className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          Mekân değişti: durağın hikâye metnini yeni mekâna göre gözden geçir.
        </p>
      )}
      <div className="space-y-2">
        {yukleniyor && <p role="status" className="sr-only">Bilmeceler yükleniyor</p>}
        {liste?.mekan === yer.mekan_id ? (
          <ul className="space-y-1.5 max-h-56 overflow-y-auto" aria-label="Hazır bilmeceler">
            {liste.bilmeceler.map((b) => {
              const secili = b.nokta === yer.nokta && b.bilmece === yer.bilmece;
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    aria-pressed={secili}
                    onClick={() => onChange(bilmeceUygula(yer, b))}
                    className={`w-full text-left rounded-lg border px-3 py-2 text-xs ${secili ? "border-indigo-600 bg-white ring-1 ring-indigo-600" : "border-gray-200 bg-white hover:border-gray-300"}`}
                  >
                    <span className="block font-semibold text-gray-900">📍 {b.nokta}</span>
                    <span className="block text-gray-600 italic">{b.bilmece}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <button
            type="button"
            onClick={() => getir(yer.mekan_id)}
            disabled={yukleniyor}
            className="text-xs font-semibold text-indigo-700 border border-indigo-200 bg-white rounded-lg px-2.5 py-1.5 disabled:text-gray-400"
          >
            {yukleniyor ? "Bilmeceler yükleniyor…" : "Hazır bilmecelerden seç"}
          </button>
        )}
        {hata && (
          <p role="alert" className="text-xs text-red-600">
            {hata}
          </p>
        )}
        <p className="text-[11px] text-gray-500">Hazır bilmeceler ortaokul düzeyinde yazıldı; seçtikten sonra sınıfına göre sadeleştirebilirsin.</p>
      </div>
      <Alan etiket="QR'ın yapıştırılacağı nokta">
        <input className={input} maxLength={S.noktaEnCok} value={yer.nokta} onChange={(e) => set(noktaDegisikligi(yer, e.target.value))} />
      </Alan>
      <Alan etiket="Konum bilmecesi">
        <textarea className={input} rows={3} maxLength={S.bilmeceEnCok} value={yer.bilmece} onChange={(e) => set({ bilmece: e.target.value })} />
      </Alan>
      <Alan etiket="Konum ipucu 1 (daha açık)">
        <input className={input} maxLength={S.ipucuEnCok} value={yer.ipucu_1} onChange={(e) => set({ ipucu_1: e.target.value })} />
      </Alan>
      <Alan etiket="Son ipucu (noktayı söyler)">
        <input className={input} maxLength={S.ipucuEnCok} value={yer.ipucu_2} onChange={(e) => set({ ipucu_2: e.target.value })} />
      </Alan>
    </fieldset>
  );
}

export default function DurakEditor({
  value,
  rotaMekanlari = [],
  onSave,
  onClose,
}: {
  value: Duzenlenen;
  // Mekân rotasında başka duraklarda kullanılan mekânlar (her mekân bir kez).
  rotaMekanlari?: string[];
  onSave: (v: Duzenlenen) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState<Duzenlenen>(value);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="editor-baslik" className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="editor-baslik" className="font-bold text-gray-900">
            {BASLIKLAR[v.tur]}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm" aria-label="Kapat">
            ✕
          </button>
        </div>

        {v.tur === "genel" && (
          <>
            <Alan etiket="Oyunun adı">
              <input
                className={input}
                maxLength={SINIR.baslik}
                value={v.genel.baslik}
                onChange={(e) => setV({ ...v, genel: { ...v.genel, baslik: e.target.value } })}
              />
            </Alan>
            <Alan etiket="Giriş hikâyesi">
              <textarea
                className={input}
                rows={4}
                maxLength={LIMITLER.metin}
                value={v.genel.hikaye_giris}
                onChange={(e) => setV({ ...v, genel: { ...v.genel, hikaye_giris: e.target.value } })}
              />
            </Alan>
            <Alan etiket="Oyunun amacı">
              <input
                className={input}
                maxLength={SINIR.amac}
                value={v.genel.oyun_amaci}
                onChange={(e) => setV({ ...v, genel: { ...v.genel, oyun_amaci: e.target.value } })}
              />
            </Alan>
          </>
        )}

        {v.tur === "durak" && (
          <>
            <Alan etiket="Durak adı">
              <input className={input} value={v.durak.isim} onChange={(e) => setV({ ...v, durak: { ...v.durak, isim: e.target.value } })} />
            </Alan>
            <Alan etiket="Hikâye metni">
              <textarea className={input} rows={3} value={v.durak.hikaye_metni} onChange={(e) => setV({ ...v, durak: { ...v.durak, hikaye_metni: e.target.value } })} />
            </Alan>
          </>
        )}
        {v.tur === "final" && (
          <Alan etiket="Final hikâyesi">
            <textarea className={input} rows={3} value={v.final.hikaye_metni} onChange={(e) => setV({ ...v, final: { ...v.final, hikaye_metni: e.target.value } })} />
          </Alan>
        )}

        {v.tur !== "genel" && <GorevAlanlari v={v} setV={setV} />}

        {v.tur === "final" && (
          <Alan etiket="Başarı metni">
            <input className={input} value={v.final.basari_metni} onChange={(e) => setV({ ...v, final: { ...v.final, basari_metni: e.target.value } })} />
          </Alan>
        )}

        {v.tur === "durak" && (
          <>
            <Alan etiket="İpucu 1">
              <input className={input} value={v.durak.gorev.ipucu_1} onChange={(e) => setV({ ...v, durak: { ...v.durak, gorev: { ...v.durak.gorev, ipucu_1: e.target.value } } })} />
            </Alan>
            <Alan etiket="İpucu 2">
              <input className={input} value={v.durak.gorev.ipucu_2} onChange={(e) => setV({ ...v, durak: { ...v.durak, gorev: { ...v.durak.gorev, ipucu_2: e.target.value } } })} />
            </Alan>
            <fieldset className="border border-gray-200 rounded-xl p-3 space-y-3">
              <legend className="text-xs font-semibold text-gray-600 px-1">Destek görevi</legend>
              {(["soru", "dogru_cevap", "aciklama"] as const).map((k) => (
                <Alan key={k} etiket={k === "soru" ? "Soru" : k === "dogru_cevap" ? "Doğru cevap" : "Açıklama"}>
                  <input
                    className={input}
                    value={v.durak.gorev.destek_gorevi[k]}
                    onChange={(e) => setV({ ...v, durak: { ...v.durak, gorev: { ...v.durak.gorev, destek_gorevi: { ...v.durak.gorev.destek_gorevi, [k]: e.target.value } } } })}
                  />
                </Alan>
              ))}
              <Alan etiket="Seçenekler (her satıra bir tane)">
                <textarea
                  className={input}
                  rows={3}
                  defaultValue={v.durak.gorev.destek_gorevi.secenekler.join("\n")}
                  onChange={(e) => setV({ ...v, durak: { ...v.durak, gorev: { ...v.durak.gorev, destek_gorevi: { ...v.durak.gorev.destek_gorevi, secenekler: lines(e.target.value) } } } })}
                />
              </Alan>
            </fieldset>
            {v.durak.sahne_turu === "secim" && (
              <fieldset className="border border-gray-200 rounded-xl p-3 space-y-3">
                <legend className="text-xs font-semibold text-gray-600 px-1">Öğrencinin seçimleri (her biri ayrı bir yola çıkar)</legend>
                {v.durak.secimler.map((s, i) => (
                  <Alan key={i} etiket={`${i + 1}. seçim`}>
                    <input
                      className={input}
                      value={s.metin}
                      onChange={(e) => setV({ ...v, durak: { ...v.durak, secimler: v.durak.secimler.map((x, j) => (j === i ? { ...x, metin: e.target.value } : x)) } })}
                    />
                  </Alan>
                ))}
              </fieldset>
            )}
            {/* Mekân rotası: durağın QR yeri ve öğrenciyi oraya götüren konum bilmecesi. */}
            {v.durak.mekan.yer ? (
              <KonumYeriAlani
                yer={v.durak.mekan.yer}
                kullanilan={rotaMekanlari}
                onChange={(yer) => setV((cur) => (cur.tur === "durak" ? { ...cur, durak: { ...cur.durak, mekan: { ...cur.durak.mekan, yer } } } : cur))}
              />
            ) : /* Öğrenci her durak geçişinde bu metni görür; boş kalırsa boş bir kart çıkar. */
            v.durak.varsayilan_sonraki_durak_id !== null || v.durak.sahne_turu === "secim" ? (
              <Alan etiket={v.durak.mekan.tur === "qr" ? "Sonraki durağın tarifi (öğrenci bir sonraki QR'ı nerede bulur)" : "Geçiş metni (öğrenci sonraki sahneye geçerken görür)"}>
                <input
                  className={input}
                  value={v.durak.mekan.sonraki_durak_tarifi}
                  onChange={(e) => setV({ ...v, durak: { ...v.durak, mekan: { ...v.durak.mekan, sonraki_durak_tarifi: e.target.value } } })}
                />
              </Alan>
            ) : null}
          </>
        )}

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-lg">
            Vazgeç
          </button>
          <button
            onClick={() => onSave(v)}
            disabled={v.tur === "genel" && !v.genel.baslik.trim()}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold py-2.5 rounded-lg"
          >
            Kaydet ve doğrula
          </button>
        </div>
      </div>
    </div>
  );
}

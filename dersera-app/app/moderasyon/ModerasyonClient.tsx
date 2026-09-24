"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DerseraLogo from "@/components/DerseraLogo";
import { KAPILAR } from "@/lib/composer/yonetisim";
import { MODERASYON, type ModerasyonKarari, type ModerasyonKaydi, type ModerasyonOzeti, type ModerasyonTuru } from "@/lib/moderasyon";
import { moderasyonKarariGonder, moderasyonKaydi, moderasyonListesi } from "@/lib/moderasyonClient";
import { GOREV_TUR_ADI } from "@/app/composer/labels";

const TUR: Record<ModerasyonTuru, { ad: string; sinif: string; kaldir?: string }> = {
  "sinif-yayini": { ad: "Sınıf yayını", sinif: "bg-amber-50 text-amber-800 border-amber-200", kaldir: "Oyunu bitir" },
  topluluk: { ad: "Topluluk gönderimi", sinif: "bg-indigo-50 text-indigo-800 border-indigo-200", kaldir: "Topluluktan reddet" },
  engellenen: { ad: "Engellenen yayın", sinif: "bg-red-50 text-red-800 border-red-200" },
};
const kapiAdi = (id: string) => KAPILAR.find((k) => k.id === id)?.ad ?? id;
const zaman = (ms: number) => new Date(ms).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Satir({ k, onAc }: { k: ModerasyonOzeti; onAc: () => void }) {
  const t = TUR[k.tur];
  return (
    <li className="bg-white border border-gray-200 rounded-2xl p-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <span className={`text-xs border rounded-full px-2 py-0.5 ${t.sinif}`}>{t.ad}</span>
          <span className={`text-xs font-semibold ${k.karar === "BLOCK" ? "text-red-700" : "text-amber-700"}`}>{k.karar === "BLOCK" ? "Engel" : "Uyarı"}</span>
          <span className="text-xs text-gray-500">{zaman(k.tarih)}</span>
        </p>
        <h2 className="font-bold text-gray-900 mt-1 truncate">{k.baslik}</h2>
        <p className="text-sm text-gray-600">
          {k.sinif ? `${k.sinif}. sınıf · ` : ""}
          {k.ders}
          {k.kod ? ` · kod ${k.kod}` : ""}
        </p>
        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{k.bulgular[0]?.mesaj}</p>
        {k.sonuc && (
          <p className="text-xs text-gray-700 mt-1">
            Karar: <strong>{k.sonuc.karar === "temiz" ? "Temiz" : "Kaldırıldı"}</strong> · {k.sonuc.yonetici} · {zaman(k.sonuc.tarih)}
            {k.sonuc.not && ` · “${k.sonuc.not}”`}
          </p>
        )}
      </div>
      <button onClick={onAc} className="shrink-0 bg-indigo-600 text-white text-sm font-semibold px-3 py-2 rounded-lg">
        Aç
      </button>
    </li>
  );
}

function Icerik({ k }: { k: ModerasyonKaydi }) {
  const d = k.definition;
  return (
    <div className="space-y-4">
      <header>
        <p className={`inline-block text-xs border rounded-full px-2 py-0.5 ${TUR[k.tur].sinif}`}>{TUR[k.tur].ad}</p>
        <h2 className="text-xl font-bold text-gray-900 mt-1">{k.baslik}</h2>
        <p className="text-sm text-gray-600">
          {k.sinif ? `${k.sinif}. sınıf · ` : ""}
          {k.ders}
          {d ? ` · ${d.meta.konu}` : ""}
          {k.kod ? ` · kod ${k.kod}` : ""} · {zaman(k.tarih)}
          {k.sahip ? " · öğretmen hesabı" : " · oturumsuz"}
        </p>
      </header>
      <section aria-labelledby="bulgular">
        <h3 id="bulgular" className="font-semibold text-gray-800 text-sm mb-2">
          Denetim bulguları
        </h3>
        <ul className="space-y-1.5">
          {k.bulgular.map((b, i) => (
            <li key={i} className={`text-sm border rounded-xl px-3 py-2 ${b.karar === "BLOCK" ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-900"}`}>
              <span className="text-xs font-semibold">{kapiAdi(b.kapi)} · {b.karar === "BLOCK" ? "Engel" : "Uyarı"}</span>
              <span className="block">{b.mesaj}</span>
            </li>
          ))}
        </ul>
      </section>
      {d && (
        <section aria-labelledby="icerik" className="space-y-2">
          <h3 id="icerik" className="font-semibold text-gray-800 text-sm">
            Öğrencinin gördüğü içerik
          </h3>
          <p className="text-sm text-gray-800 bg-white border border-gray-200 rounded-xl p-3">{d.hikaye_giris}</p>
          <ol className="space-y-2">
            {d.duraklar.map((durak, i) => (
              <li key={durak.id} className="bg-white border border-gray-200 rounded-xl p-3 text-sm">
                <p className="font-semibold text-gray-900">
                  {i + 1}. {durak.isim} <span className="text-xs font-normal text-indigo-600">{GOREV_TUR_ADI[durak.gorev.tur]}</span>
                </p>
                <p className="text-gray-600 mt-1">{durak.hikaye_metni}</p>
                <p className="text-gray-900 mt-1 font-medium">{durak.gorev.soru}</p>
                {durak.gorev.secenekler.length > 0 && <p className="text-gray-600">Seçenekler: {durak.gorev.secenekler.join(" · ")}</p>}
                <p className="text-gray-500 text-xs">
                  İpuçları: {durak.gorev.ipucu_1} / {durak.gorev.ipucu_2}
                </p>
              </li>
            ))}
            <li className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-sm">
              <p className="font-semibold text-indigo-900">Final</p>
              <p className="text-indigo-900 mt-1">{d.final.hikaye_metni}</p>
              <p className="text-indigo-900 mt-1">{d.final.soru}</p>
            </li>
          </ol>
        </section>
      )}
    </div>
  );
}

function KararFormu({ k, onBitti }: { k: ModerasyonKaydi; onBitti: (mesaj: string) => void }) {
  const [not, setNot] = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState("");
  const kaldir = TUR[k.tur].kaldir;

  async function gonder(karar: ModerasyonKarari) {
    if (karar === "kaldir" && !window.confirm(k.tur === "sinif-yayini" ? "Oyun hemen bitirilecek; öğrenciler devam edemez. Emin misin?" : "Oyun topluluktan reddedilecek. Emin misin?")) return;
    setGonderiliyor(true);
    setHata("");
    const r = await moderasyonKarariGonder(k.id, karar, not);
    setGonderiliyor(false);
    if ("error" in r) return setHata(r.error);
    onBitti(karar === "temiz" ? "Kayıt temiz olarak kapatıldı." : k.tur === "sinif-yayini" ? "Oyun bitirildi ve kayıt kapatıldı." : "Oyun topluluktan reddedildi ve kayıt kapatıldı.");
  }

  return (
    <fieldset disabled={gonderiliyor} className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
      <legend className="font-semibold text-gray-900 px-1">Karar</legend>
      <label className="block text-sm">
        <span className="text-gray-700">Not (isteğe bağlı; yalnız yöneticiler görür)</span>
        <textarea value={not} onChange={(e) => setNot(e.target.value)} maxLength={MODERASYON.notEnCok} rows={2} className="mt-1 w-full border border-gray-300 rounded-lg p-2 text-sm" />
      </label>
      {hata && (
        <p role="alert" className="text-sm text-red-600">
          {hata}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => gonder("temiz")} className="bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-lg disabled:opacity-40">
          Temiz, kapat
        </button>
        {kaldir && (
          <button onClick={() => gonder("kaldir")} className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg disabled:opacity-40">
            {kaldir}
          </button>
        )}
      </div>
    </fieldset>
  );
}

export default function ModerasyonClient() {
  const [durum, setDurum] = useState<ModerasyonKaydi["durum"]>("bekliyor");
  const [liste, setListe] = useState<ModerasyonOzeti[] | { error: string; status?: number } | null>(null);
  const [secili, setSecili] = useState<{ kayit: ModerasyonKaydi | null; hata: string } | null>(null);
  const [mesaj, setMesaj] = useState("");

  const yukle = useCallback(async (d: ModerasyonKaydi["durum"]) => {
    setListe(null);
    const r = await moderasyonListesi(d);
    setListe("error" in r ? r : r.kayitlar);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => yukle(durum));
    return () => clearTimeout(t);
  }, [yukle, durum]);

  async function ac(id: string) {
    setMesaj("");
    setSecili({ kayit: null, hata: "" });
    const r = await moderasyonKaydi(id);
    setSecili("error" in r ? { kayit: null, hata: r.error } : { kayit: r.kayit, hata: "" });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-900 text-white px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <DerseraLogo />
            <p className="text-xs font-semibold text-indigo-200 border-l border-indigo-700 pl-3">Moderasyon</p>
          </div>
          <nav className="flex gap-4 text-sm whitespace-nowrap">
            <Link href="/yonetim/okul-havuzu" className="text-indigo-300 hover:text-white">
              Okul havuzları
            </Link>
            <Link href="/ogretmen" className="text-indigo-300 hover:text-white">
              ← Öğretmen paneli
            </Link>
          </nav>
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
              ← Kuyruğa dön
            </button>
            {secili.hata && (
              <p role="alert" className="text-sm text-red-600">
                {secili.hata}
              </p>
            )}
            {!secili.kayit && !secili.hata && <p className="text-sm text-gray-400">Yükleniyor…</p>}
            {secili.kayit && (
              <>
                <Icerik k={secili.kayit} />
                {secili.kayit.durum === "bekliyor" && (
                  <KararFormu
                    k={secili.kayit}
                    onBitti={(m) => {
                      setMesaj(m);
                      setSecili(null);
                      yukle(durum);
                    }}
                  />
                )}
              </>
            )}
          </div>
        ) : (
          <>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Moderasyon kuyruğu</h1>
              <p className="text-sm text-gray-500">
                Çocuk güvenliği ya da benzerlik denetiminden uyarı veya engel alan oyunlar. Uyarıyla yayınlanan sınıf oyununu bitirebilir, topluluk gönderimini
                reddedebilirsin; engellenen yayınlar kötüye kullanımı izlemek içindir.
              </p>
            </div>
            <div role="tablist" aria-label="Kayıt durumu" className="flex gap-2">
              {(["bekliyor", "kapatildi"] as const).map((d) => (
                <button
                  key={d}
                  role="tab"
                  aria-selected={durum === d}
                  onClick={() => setDurum(d)}
                  className={`text-sm font-semibold px-3 py-1.5 rounded-lg border ${durum === d ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700 border-gray-300"}`}
                >
                  {d === "bekliyor" ? "Bekleyen" : "Kapatılan"}
                </button>
              ))}
            </div>
            {liste === null && <p className="text-sm text-gray-400">Yükleniyor…</p>}
            {liste && "error" in liste && (
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
            )}
            {Array.isArray(liste) && liste.length === 0 && (
              <p className="bg-white border border-dashed border-gray-300 rounded-2xl p-6 text-center text-sm text-gray-500">
                {durum === "bekliyor" ? "Bekleyen kayıt yok." : "Henüz kapatılan kayıt yok."}
              </p>
            )}
            {Array.isArray(liste) && liste.length > 0 && (
              <ul className="space-y-3">
                {liste.map((k) => (
                  <Satir key={k.id} k={k} onAc={() => ac(k.id)} />
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}

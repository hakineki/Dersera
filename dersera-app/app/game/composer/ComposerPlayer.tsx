"use client";

import { useCallback, useEffect, useState } from "react";
import { yasProfiliOf, type YasProfili } from "@/lib/yasProfili";
import { arrive, choose, currentStep, durakById, FINAL_ID, inventory, needsScan, qrOf } from "@/lib/composer/scene";
import type { GameDefinition } from "@/lib/composer/definition";
import { gorselAdresi, KAPAK } from "@/lib/gorsel";
import GorselResim from "@/components/GorselResim";
import {
  addLeaderboardEntry,
  addPenalty,
  buildResultCode,
  formatElapsed,
  loadEndTime,
  loadPenaltySeconds,
  loadProgress,
  loadSceneState,
  markStopComplete,
  nicknameKey,
  saveEndTime,
  saveSceneState,
  type GameProgress,
  type LeaderboardEntry,
  type SceneState,
} from "@/lib/gameState";
import { buildLeaderboardEntry, sendPlayerRating, sendPlayerResult } from "@/lib/playerResult";
import TaskView from "./TaskView";

// Yaş profiline göre zemin (docs/URUN-BAGLAMI.md §5): lise daha olgun ve atmosferik, ortaokul canlı.
const ZEMIN: Record<YasProfili, string> = {
  PRESCHOOL_3_5: "from-indigo-900 via-purple-900 to-pink-900",
  PRIMARY_6_10: "from-sky-800 via-indigo-800 to-fuchsia-800",
  MIDDLE_11_14: "from-indigo-900 via-purple-900 to-pink-900",
  HIGH_15_18: "from-slate-950 via-indigo-950 to-slate-900",
};
// İlkokulda yazı ve dokunma alanları orantılı büyür: bileşenler rem ölçüsü kullandığından kök yazı boyutu büyütülür
// (oyun ekranından çıkınca eski değer geri gelir).
const KOK_YAZI: Partial<Record<YasProfili, string>> = { PRESCHOOL_3_5: "125%", PRIMARY_6_10: "112.5%" };
function useKokYazi(sinif: number) {
  useEffect(() => {
    const boyut = KOK_YAZI[yasProfiliOf(sinif)];
    if (!boyut) return;
    const kok = document.documentElement;
    const onceki = kok.style.fontSize;
    kok.style.fontSize = boyut;
    return () => {
      kok.style.fontSize = onceki;
    };
  }, [sinif]);
}
const shellOf = (sinif: number) => `min-h-screen bg-gradient-to-br ${ZEMIN[yasProfiliOf(sinif)]} px-4 py-6`;
const kart = "bg-white/10 border border-white/20 rounded-2xl p-5";

// Görsel zenginleştirilmiş oyunda kapak ya da durak görseli; yoksa hiçbir şey.
function SahneGorseli({ def, hedef, alt, className }: { def: GameDefinition; hedef: string; alt: string; className: string }) {
  const src = gorselAdresi(def, hedef);
  return src ? <GorselResim src={src} alt={alt} className={className} /> : null;
}
const devam = "w-full bg-white text-indigo-900 font-bold py-3 rounded-xl";

const PUAN_ETIKETI = ["Hiç beğenmedim", "Beğenmedim", "Fena değil", "Beğendim", "Çok beğendim"];
const puanBayragi = (gameCode: string, nickname: string) => `dersera:puan-verildi:${gameCode}:${nicknameKey(nickname)}`;

// Anonim oyun puanı: yalnız toplam ve ortalama saklanır; öğretmen tek tek puanları görmez.
function OyunPuani({ gameCode, nickname }: { gameCode: string; nickname: string }) {
  const [secili, setSecili] = useState(0);
  const [onizleme, setOnizleme] = useState(0);
  const [durum, setDurum] = useState<"secim" | "gonderiliyor" | "tamam" | "zaten" | "hata">(() => {
    try {
      return localStorage.getItem(puanBayragi(gameCode, nickname)) ? "tamam" : "secim";
    } catch {
      return "secim";
    }
  });

  async function gonder() {
    setDurum("gonderiliyor");
    const r = await sendPlayerRating(gameCode, nickname, secili);
    if (r === "kaydedildi" || r === "zaten") {
      try {
        localStorage.setItem(puanBayragi(gameCode, nickname), "1");
      } catch {
        /* ignore */
      }
    }
    setDurum(r === "kaydedildi" ? "tamam" : r === "zaten" ? "zaten" : "hata");
  }

  if (durum === "tamam" || durum === "zaten") {
    return (
      <div className={kart}>
        <p role="status" className="text-green-200 text-sm font-semibold">
          {durum === "tamam" ? "Teşekkürler! Puanın isimsiz olarak kaydedildi." : "Bu oyuna zaten puan vermişsin. Teşekkürler!"}
        </p>
      </div>
    );
  }
  const gorunen = onizleme || secili;
  return (
    <div className={kart}>
      <fieldset disabled={durum === "gonderiliyor"}>
        <legend className="text-white font-semibold text-sm mb-2">Oyunu nasıl buldun?</legend>
        <div className="flex justify-center" onMouseLeave={() => setOnizleme(0)}>
          {PUAN_ETIKETI.map((etiket, i) => (
            <button
              key={etiket}
              type="button"
              aria-pressed={secili === i + 1}
              aria-label={`${i + 1} yıldız: ${etiket}`}
              onClick={() => setSecili(i + 1)}
              onMouseEnter={() => setOnizleme(i + 1)}
              onFocus={() => setOnizleme(i + 1)}
              onBlur={() => setOnizleme(0)}
              className={`w-11 h-11 text-3xl leading-none transition-transform hover:scale-110 ${i < gorunen ? "" : "opacity-30 grayscale"}`}
            >
              <span aria-hidden="true">⭐</span>
            </button>
          ))}
        </div>
        <p className="text-purple-200 text-xs mt-1 h-4">{gorunen ? PUAN_ETIKETI[gorunen - 1] : ""}</p>
        <button type="button" onClick={gonder} disabled={!secili} className="mt-2 bg-white text-indigo-900 font-bold text-sm px-5 py-2 rounded-lg disabled:opacity-40">
          {durum === "gonderiliyor" ? "Gönderiliyor…" : "Puanı gönder"}
        </button>
        {durum === "hata" && (
          <p role="alert" className="text-red-200 text-xs mt-2">
            Puan gönderilemedi. Tekrar dene.
          </p>
        )}
      </fieldset>
    </div>
  );
}

export default function ComposerPlayer({
  def,
  gameCode,
  nickname,
  startTime,
  qr,
}: {
  def: GameDefinition;
  gameCode: string;
  nickname: string;
  startTime: number;
  qr: number | null;
}) {
  useKokYazi(def.meta.sinif);
  const [scene, setScene] = useState<SceneState>(() => loadSceneState());
  const [progress, setProgress] = useState<GameProgress>(() => loadProgress());
  const [ceza, setCeza] = useState(() => loadPenaltySeconds());
  const [bitis, setBitis] = useState<number | null>(() => loadEndTime());
  const [simdi, setSimdi] = useState(() => Date.now());
  const [yeniNesne, setYeniNesne] = useState<string | null>(null);
  const [gonderim, setGonderim] = useState<"gonderiliyor" | "gonderildi" | "hata">("gonderiliyor");
  const [deneme, setDeneme] = useState(0);

  const step = currentStep(def, scene, progress, bitis !== null);
  const esyalar = inventory(def, progress);

  const guncelle = useCallback((s: SceneState) => {
    saveSceneState(s);
    setScene(s);
  }, []);

  useEffect(() => {
    if (bitis) return;
    const id = setInterval(() => setSimdi(Date.now()), 1000);
    return () => clearInterval(id);
  }, [bitis]);

  // Okul macerasında hedefin QR'ı az önce tarandıysa varış otomatik gerçekleşir.
  useEffect(() => {
    if (step.tur === "gecis" && needsScan(def, step.hedef) && qr === qrOf(def, step.hedef)) {
      const t = setTimeout(() => guncelle(arrive(scene, step.hedef)));
      return () => clearTimeout(t);
    }
  }, [step, qr, def, scene, guncelle]);

  const entry: LeaderboardEntry | null = bitis ? buildLeaderboardEntry(nickname, startTime, bitis, ceza, progress) : null;

  useEffect(() => {
    if (!entry) return;
    let iptal = false;
    sendPlayerResult(gameCode, entry).then((ok) => !iptal && setGonderim(ok ? "gonderildi" : "hata"));
    return () => {
      iptal = true;
    };
    // entry her render'da yeniden kurulur; gönderim yalnız bitişte ve "Tekrar dene"de tetiklenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bitis, deneme, gameCode]);

  function yanlis() {
    addPenalty(15);
    setCeza((c) => c + 15);
  }

  function gorevBitti(durakId: string, yanlisSayisi: number, odul: string | null) {
    markStopComplete(durakId, yanlisSayisi);
    setProgress(loadProgress());
    if (odul && !esyalar.includes(odul)) setYeniNesne(def.envanter.find((e) => e.id === odul)?.isim ?? null);
  }

  function finalBitti() {
    const t = Date.now();
    saveEndTime(t);
    const son = buildLeaderboardEntry(nickname, startTime, t, loadPenaltySeconds(), loadProgress());
    addLeaderboardEntry(son);
    setBitis(t);
  }

  const ustBar = (
    <div className="flex items-center justify-between mb-4 text-xs">
      <span className="text-purple-200 font-semibold">
        {/* Dallanan oyunda toplam, seçilen rotaya göre değişir; yalnız tamamlanan sayı gösterilir. */}
        ✅ {Object.keys(progress).filter((id) => durakById(def, id)).length} görev · 🔍 {esyalar.length}
      </span>
      <span className="font-mono text-white bg-white/10 px-2.5 py-0.5 rounded-lg">
        ⏱ {formatElapsed(Math.max(0, Math.floor(((bitis ?? simdi) - startTime) / 1000)) + ceza)}
      </span>
    </div>
  );

  return (
    <div className={shellOf(def.meta.sinif)}>
      <div className="w-full max-w-md mx-auto">
        {ustBar}

        {yeniNesne && (
          <div role="status" className="bg-yellow-400 text-gray-900 font-bold rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
            <span>🔍 {yeniNesne} toplandı!</span>
            <button onClick={() => setYeniNesne(null)} aria-label="Kapat" className="text-gray-700">
              ✕
            </button>
          </div>
        )}

        {step.tur === "gecis" && (
          <div className="space-y-4">
            {step.onceki === null ? (
              <div className={kart}>
                <SahneGorseli def={def} hedef={KAPAK} alt={`${def.meta.baslik} kapak görseli`} className="mb-4" />
                <h1 className="text-xl font-bold text-white mb-2">{def.meta.baslik}</h1>
                <p className="text-white/85 text-sm leading-relaxed mb-3">{def.hikaye_giris}</p>
                <p className="text-yellow-200 text-sm font-semibold">🎯 {def.oyun_amaci}</p>
              </div>
            ) : (
              step.hedef !== FINAL_ID && (
                <div className={kart}>
                  <p className="text-white/85 text-sm">{step.onceki.mekan.sonraki_durak_tarifi}</p>
                </div>
              )
            )}
            {step.hedef === FINAL_ID ? (
              <div className={kart}>
                <p className="text-white font-bold mb-2">🏁 Final kapısı açıldı</p>
                <ul className="text-sm text-white/80 space-y-1 mb-4">
                  {def.final.gerekli_nesneler.map((id) => (
                    <li key={id}>
                      {esyalar.includes(id) ? "✅" : "⬜"} {def.envanter.find((e) => e.id === id)?.isim ?? id}
                    </li>
                  ))}
                </ul>
                <button onClick={() => guncelle(arrive(scene, FINAL_ID))} className={devam}>
                  Finale geç
                </button>
              </div>
            ) : needsScan(def, step.hedef) ? (
              <div className={`${kart} text-center`}>
                <p className="text-4xl mb-2" aria-hidden="true">📱</p>
                <p className="text-white font-bold">{qrOf(def, step.hedef)} numaralı QR kodu bul ve tara</p>
              </div>
            ) : (
              <button onClick={() => guncelle(arrive(scene, step.hedef))} className={devam}>
                {step.onceki === null ? "Maceraya başla" : "Devam"}
              </button>
            )}
          </div>
        )}

        {step.tur === "gorev" && (
          <div className="space-y-4">
            <div className={kart}>
              <SahneGorseli def={def} hedef={step.durak.id} alt={`${step.durak.isim} sahnesi`} className="mb-3" />
              <h2 className="text-lg font-bold text-white mb-1">{step.durak.isim}</h2>
              <p className="text-white/80 text-sm leading-relaxed italic">📖 {step.durak.hikaye_metni}</p>
            </div>
            <TaskView
              key={step.durak.id}
              gorev={{
                tur: step.durak.gorev.tur,
                soru: step.durak.gorev.soru,
                secenekler: step.durak.gorev.secenekler,
                dogru_cevap: step.durak.gorev.dogru_cevap,
                ipucu_1: step.durak.gorev.ipucu_1,
                ipucu_2: step.durak.gorev.ipucu_2,
                destek: step.durak.gorev.destek_gorevi,
              }}
              onWrong={yanlis}
              onDone={(n) => gorevBitti(step.durak.id, n, step.durak.gorev.odul_id)}
            />
          </div>
        )}

        {step.tur === "secim" && (
          <div className="space-y-3">
            <div className={kart}>
              <SahneGorseli def={def} hedef={step.durak.id} alt={`${step.durak.isim} sahnesi`} className="mb-3" />
              <p className="text-yellow-200 text-xs font-semibold uppercase tracking-wide mb-1">Karar zamanı</p>
              <p className="text-white text-sm leading-relaxed">{step.durak.hikaye_metni}</p>
            </div>
            {step.durak.secimler.map((s) => (
              <button key={s.hedef_durak_id} onClick={() => guncelle(choose(scene, s.hedef_durak_id))} className="w-full text-left bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl px-4 py-3 text-white font-semibold">
                🔀 {s.metin}
              </button>
            ))}
          </div>
        )}

        {step.tur === "final" && (
          <div className="space-y-4">
            <div className={kart}>
              <h2 className="text-lg font-bold text-white mb-1">🏁 Final</h2>
              <p className="text-white/85 text-sm leading-relaxed">{def.final.hikaye_metni}</p>
              {esyalar.length > 0 && <p className="text-yellow-200 text-xs mt-2">Topladıkların: {esyalar.map((id) => def.envanter.find((e) => e.id === id)?.isim).join(", ")}</p>}
            </div>
            <TaskView
              gorev={{ tur: def.final.gorev_turu, soru: def.final.soru, secenekler: def.final.secenekler, dogru_cevap: def.final.dogru_cevap }}
              onWrong={yanlis}
              onDone={finalBitti}
            />
          </div>
        )}

        {step.tur === "bitti" && entry && (
          <div className="space-y-4 text-center">
            <div className={kart}>
              <p className="text-5xl mb-2" aria-hidden="true">🏆</p>
              <p className="text-white font-bold text-lg mb-2">{def.final.basari_metni}</p>
              <p className="font-mono text-4xl text-white font-bold">{formatElapsed(entry.netSeconds + entry.penaltySeconds)}</p>
              {entry.penaltySeconds > 0 && <p className="text-red-200 text-xs">+{formatElapsed(entry.penaltySeconds)} ceza dahil</p>}
            </div>
            <div role="status" className={`${kart} ${gonderim === "hata" ? "border-red-300/50" : ""}`}>
              {gonderim === "gonderiliyor" && <p className="text-white/80 text-sm">Sonucun iletiliyor…</p>}
              {gonderim === "gonderildi" && <p className="text-green-200 text-sm font-semibold">✅ Sonucun iletildi</p>}
              {gonderim === "hata" && (
                <>
                  <p className="text-red-200 text-sm mb-2">Sonucun iletilemedi. Kodu öğretmenine göster.</p>
                  <button
                    onClick={() => {
                      setGonderim("gonderiliyor");
                      setDeneme((n) => n + 1);
                    }}
                    className="text-xs font-semibold text-white bg-white/20 px-3 py-1.5 rounded-lg"
                  >
                    Tekrar dene
                  </button>
                </>
              )}
              <p className="text-indigo-200 text-xs mt-3">Sonuç kodun</p>
              <p className="font-mono font-bold text-2xl text-white tracking-widest">{buildResultCode(nickname, entry.netSeconds + entry.penaltySeconds)}</p>
            </div>
            {gonderim === "gonderildi" && <OyunPuani gameCode={gameCode} nickname={nickname} />}
          </div>
        )}
      </div>
    </div>
  );
}

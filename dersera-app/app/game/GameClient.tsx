"use client";

import { useState, useEffect } from "react";
import type { Stop } from "@/data/stops";
import {
  loadProgress,
  markStopComplete,
  loadEndTime,
  saveEndTime,
  formatElapsed,
  GameProgress,
  loadPenaltySeconds,
  addPenalty,
  addLeaderboardEntry,
  buildResultCode,
  type LeaderboardEntry,
} from "@/lib/gameState";
import { buildLeaderboardEntry, sendPlayerResult } from "@/lib/playerResult";
import { getSorular, DERS_ADI, AYLAR } from "@/data/mufredat";
import type { Soru } from "@/data/mufredat";

// ── Konfeti parçacıkları — mount'ta hesaplanır, her render'da değişmez ────────
const PARCALAR = Array.from({ length: 60 }, (_, i) => ({
  id: i,
  left: `${(i * 17 + 3) % 100}%`,
  delay: `${(i * 0.05) % 1}s`,
  dur: `${1 + (i * 0.04) % 1.5}s`,
  color: ["#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#c77dff", "#ff922b"][i % 6],
  size: `${5 + (i % 4)}px`,
  circle: i % 3 === 0,
}));

function ConfettiRain({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      <style>{`
        @keyframes kfall {
          0%   { transform: translateY(-20px) rotate(0deg);   opacity: 1; }
          100% { transform: translateY(110vh)  rotate(720deg); opacity: 0; }
        }
      `}</style>
      {PARCALAR.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: p.left,
            top: "-10px",
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            animation: `kfall ${p.dur} ${p.delay} ease-in forwards`,
            borderRadius: p.circle ? "50%" : "2px",
          }}
        />
      ))}
    </div>
  );
}

function KanitAnimasyon({ show, count }: { show: boolean; count: number }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 pointer-events-none z-40 flex items-center justify-center">
      <style>{`
        @keyframes kpop {
          from { transform: scale(0.4); opacity: 0; }
          60%  { transform: scale(1.15); opacity: 1; }
          to   { transform: scale(1);   opacity: 1; }
        }
      `}</style>
      <div
        className="bg-yellow-400 text-gray-900 font-bold text-xl px-8 py-5 rounded-2xl shadow-2xl"
        style={{ animation: "kpop 0.4s ease-out" }}
      >
        🔍 Kanıt #{count} Toplandı!
      </div>
    </div>
  );
}

// ── Özet (final) ekranı ───────────────────────────────────────────────────────
type SendStatus = "sending" | "sent" | "failed";

function SummaryScreen({
  nickname,
  netSeconds,
  penaltySeconds,
  progress,
  allStops,
  resultCode,
  sendStatus,
  onRetry,
}: {
  allStops: Stop[];
  nickname: string;
  netSeconds: number;
  penaltySeconds: number;
  progress: GameProgress;
  resultCode: string;
  sendStatus: SendStatus;
  onRetry: () => void;
}) {
  const totalHints = Object.values(progress).reduce(
    (sum, p) => sum + p.hintsUsed,
    0
  );
  const totalSeconds = netSeconds + penaltySeconds;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col items-center justify-center px-5 py-10">
      <ConfettiRain active />
      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-6">
          <div className="text-6xl mb-2">🗂️</div>
          <h1 className="text-2xl font-bold text-white">Dosya Tamamlandı!</h1>
          <p className="text-purple-300 text-sm mt-1">
            Tebrikler, {nickname}! Gizem çözüldü.
          </p>
        </div>

        {/* Süre kartı */}
        <div className="bg-yellow-500/20 border border-yellow-400/40 rounded-2xl p-5 mb-3">
          <p className="text-yellow-300 text-xs font-semibold uppercase tracking-widest mb-3 text-center">
            Süre Özeti
          </p>
          <div className="flex justify-between items-center mb-2">
            <span className="text-yellow-200/70 text-sm">Net süre</span>
            <span className="text-white font-mono font-bold text-lg">
              {formatElapsed(netSeconds)}
            </span>
          </div>
          {penaltySeconds > 0 && (
            <div className="flex justify-between items-center mb-2">
              <span className="text-red-300/80 text-sm">Ceza</span>
              <span className="text-red-300 font-mono font-bold text-lg">
                +{formatElapsed(penaltySeconds)}
              </span>
            </div>
          )}
          <div className="border-t border-yellow-400/30 pt-2 mt-2 flex justify-between items-center">
            <span className="text-yellow-300 text-sm font-semibold">Toplam</span>
            <span className="text-4xl font-bold text-white font-mono">
              {formatElapsed(totalSeconds)}
            </span>
          </div>
          <p className="text-yellow-200/50 text-xs text-center mt-2">
            {totalHints === 0
              ? "İpucu kullanmadan tamamladın! 🌟"
              : `${totalHints} ipucu kullandın`}
          </p>
        </div>

        {/* Kanıt listesi */}
        <div className="bg-white/10 border border-white/20 rounded-2xl overflow-hidden mb-4">
          {allStops.map((s, i) => {
            const p = progress[s.id];
            return (
              <div
                key={s.id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  i < allStops.length - 1 ? "border-b border-white/10" : ""
                }`}
              >
                <span className="text-xl">{s.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">{s.name}</p>
                  <p className="text-white/40 text-xs">{s.subject}</p>
                </div>
                <span className="text-green-400 text-xs font-semibold">
                  {p
                    ? `✅ ${p.hintsUsed > 0 ? `${p.hintsUsed}✗` : "Temiz!"}`
                    : "—"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Gönderim durumu */}
        <div
          role="status"
          className={`rounded-xl p-4 mb-3 text-center border ${
            sendStatus === "sent"
              ? "bg-green-500/20 border-green-400/40"
              : sendStatus === "failed"
              ? "bg-red-500/20 border-red-400/40"
              : "bg-white/10 border-white/20"
          }`}
        >
          {sendStatus === "sending" && (
            <p className="text-white/80 text-sm font-semibold">Sonucun iletiliyor…</p>
          )}
          {sendStatus === "sent" && (
            <p className="text-green-200 text-sm font-semibold">✅ Sonucun iletildi</p>
          )}
          {sendStatus === "failed" && (
            <>
              <p className="text-red-200 text-sm font-semibold mb-2">
                Sonucun iletilemedi. Aşağıdaki kodu öğretmenine göster.
              </p>
              <button
                onClick={onRetry}
                className="text-xs font-semibold text-white bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors"
              >
                Tekrar dene
              </button>
            </>
          )}
        </div>

        {/* Sonuç kodu (yedek) */}
        <div className="bg-indigo-600/40 border border-indigo-400/40 rounded-xl p-4 mb-4 text-center">
          <p className="text-indigo-300 text-xs font-semibold mb-1">
            Sonuç Kodun
          </p>
          <p className="text-white font-mono font-bold text-2xl tracking-widest">
            {resultCode}
          </p>
          <p className="text-indigo-300/70 text-xs mt-1">
            Yedek kod: sonuç sisteme ulaşmazsa öğretmenin bununla doğrular.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────
interface Props {
  stop: Stop;
  allStops: Stop[];
  gameCode: string;
  nickname: string;
  startTime: number;
  aylar: string[];
}

type Screen =
  | "loading"
  | "question"
  | "backup-question"
  | "already-done"
  | "correct"
  | "summary";

function computeElapsed(startTime: number, endTime?: number): number {
  return Math.floor(((endTime ?? Date.now()) - startTime) / 1000);
}

// Olay işleyicilerinden çağrılır (render sırasında değil); saf olmayan çağrılar bileşen dışında tutulur.
const rastgeleSec = <T,>(dizi: T[]): T => dizi[Math.floor(Math.random() * dizi.length)];
const simdi = () => Date.now();

export default function GameClient({ stop, allStops, gameCode, nickname, startTime, aylar }: Props) {
  const [screen, setScreen] = useState<Screen>("loading");
  const [soru, setSoru] = useState<Soru | null>(null);
  const [backupSoru, setBackupSoru] = useState<Soru | null>(null);
  const [wrongCount, setWrongCount] = useState(0);
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [backupSelectedIndex, setBackupSelectedIndex] = useState<number | null>(null);
  const [backupFailed, setBackupFailed] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [penaltySeconds, setPenaltySeconds] = useState(0);
  const [progress, setProgress] = useState<GameProgress>({});
  const [showKanitAnim, setShowKanitAnim] = useState(false);
  const [kanitCount, setKanitCount] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [summaryData, setSummaryData] = useState<LeaderboardEntry | null>(null);
  const [sendStatus, setSendStatus] = useState<SendStatus>("sending");
  const [sendAttempt, setSendAttempt] = useState(0);

  const ayAdi = aylar
    .map((slug) => AYLAR.find((a) => a.ay === slug)?.ad ?? slug)
    .join(", ");

  // İlk yükleme: kayıtlı ilerleme tarayıcıdan ilk render'dan sonra okunur (sunucuda localStorage yok).
  useEffect(() => {
    const t = setTimeout(() => {
      const saved = loadProgress();
      const savedPenalty = loadPenaltySeconds();
      setProgress(saved);
      setPenaltySeconds(savedPenalty);
      setKanitCount(Object.keys(saved).length);

      if (saved[stop.id]) {
        const endTime = loadEndTime();
        if (stop.nextStopId === null && endTime) {
          const entry = buildLeaderboardEntry(nickname, startTime, endTime, savedPenalty, saved);
          setSummaryData(entry);
          setElapsedSeconds(entry.netSeconds);
          setScreen("summary");
        } else {
          setScreen("already-done");
        }
        return;
      }

      const sorular = getSorular(stop.dersKey, aylar);
      if (!sorular.length) {
        setScreen("question");
        return;
      }
      setSoru(rastgeleSec(sorular));
      setScreen("question");
    });
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop.id]);

  // Kronometre
  useEffect(() => {
    if (screen === "summary" || screen === "loading") return;
    const endTime = loadEndTime();
    if (endTime) {
      const t = setTimeout(() => setElapsedSeconds(computeElapsed(startTime, endTime)));
      return () => clearTimeout(t);
    }
    const id = setInterval(
      () => setElapsedSeconds(computeElapsed(startTime)),
      1000
    );
    return () => clearInterval(id);
  }, [startTime, screen]);

  // Konfeti otomatik kapat
  useEffect(() => {
    if (!showConfetti) return;
    const t = setTimeout(() => setShowConfetti(false), 3500);
    return () => clearTimeout(t);
  }, [showConfetti]);

  // Kanıt animasyonu otomatik kapat
  useEffect(() => {
    if (!showKanitAnim) return;
    const t = setTimeout(() => setShowKanitAnim(false), 2000);
    return () => clearTimeout(t);
  }, [showKanitAnim]);

  // Sunucu aynı takma adın kaydını üzerine yazar; yeniden yüklemede tekrar göndermek güvenli.
  useEffect(() => {
    if (screen !== "summary" || !summaryData) return;
    let cancelled = false;
    sendPlayerResult(gameCode, summaryData).then((ok) => {
      if (!cancelled) setSendStatus(ok ? "sent" : "failed");
    });
    return () => {
      cancelled = true;
    };
  }, [screen, summaryData, sendAttempt, gameCode]);

  function applyPenalty() {
    addPenalty(15);
    setPenaltySeconds((p) => p + 15);
  }

  function completeStop(hintsUsed: number) {
    markStopComplete(stop.id, hintsUsed);
    const updated = loadProgress();
    const newKanitCount = Object.keys(updated).length;
    setProgress(updated);
    setKanitCount(newKanitCount);
    setShowKanitAnim(true);

    if (stop.nextStopId === null) {
      const endTs = simdi();
      saveEndTime(endTs);
      const entry = buildLeaderboardEntry(nickname, startTime, endTs, loadPenaltySeconds(), updated);
      addLeaderboardEntry(entry);
      setSummaryData(entry);
      setElapsedSeconds(entry.netSeconds);
      setShowConfetti(true);
      setTimeout(() => setScreen("summary"), 2100);
    } else {
      setShowConfetti(true);
      setTimeout(() => setScreen("correct"), 600);
    }
  }

  function handleAnswer(index: number) {
    if (!soru) return;
    setSelectedIndex(index);

    if (index === soru.dogruIndex) {
      completeStop(wrongCount);
      return;
    }

    // Yanlış cevap
    const newWrong = wrongCount + 1;
    setWrongCount(newWrong);
    applyPenalty();

    if (newWrong < 3) {
      setHintsRevealed(newWrong); // 1. yanlış → ipucu1, 2. yanlış → ipucu2
    } else {
      // 3. yanlış → yedek soru
      const sorular = getSorular(stop.dersKey, aylar);
      const alternatives = sorular.filter((s) => s.soru !== soru.soru);
      if (alternatives.length > 0) {
        setBackupSoru(rastgeleSec(alternatives));
      } else {
        setBackupSoru(soru); // havuzda başka soru yok, aynısını ver
      }
      setBackupSelectedIndex(null);
      setBackupFailed(false);
      setScreen("backup-question");
    }
  }

  function handleBackupAnswer(index: number) {
    if (!backupSoru) return;
    setBackupSelectedIndex(index);

    if (index === backupSoru.dogruIndex) {
      completeStop(wrongCount);
    } else {
      // Yedek de yanlış → açıklama göster, durak geçilecek
      applyPenalty();
      setBackupFailed(true);
    }
  }

  function handleForceAdvance() {
    completeStop(wrongCount + 1);
  }

  const displaySeconds = elapsedSeconds + penaltySeconds;
  const visibleHint =
    hintsRevealed >= 2 ? soru?.ipucu2 : hintsRevealed === 1 ? soru?.ipucu1 : null;

  // ── SUMMARY ─────────────────────────────────────────────────────────────────
  if (screen === "summary" && summaryData) {
    return (
      <SummaryScreen
        allStops={allStops}
        nickname={nickname}
        netSeconds={summaryData.netSeconds}
        penaltySeconds={summaryData.penaltySeconds}
        progress={progress}
        resultCode={buildResultCode(nickname, summaryData.netSeconds + summaryData.penaltySeconds)}
        sendStatus={sendStatus}
        onRetry={() => {
          setSendStatus("sending");
          setSendAttempt((n) => n + 1);
        }}
      />
    );
  }

  // ── LOADING ──────────────────────────────────────────────────────────────────
  if (screen === "loading" || (!soru && screen === "question")) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="text-white/40 text-sm">Soru yükleniyor...</div>
      </div>
    );
  }

  // ── ORTAK SARMALAYICI ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col items-center px-4 py-6">
      <ConfettiRain active={showConfetti} />
      <KanitAnimasyon show={showKanitAnim} count={kanitCount} />

      <div className="w-full max-w-md">
        {/* Üst çubuk: Süre + Kanıt sayacı */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1">
            <span className="text-xs font-semibold text-purple-300 uppercase tracking-widest">
              Durak {stop.order} / {allStops.length}
            </span>
            <span className="ml-2 text-xs text-yellow-300 font-semibold">
              🔍 {kanitCount}/{allStops.length}
            </span>
          </div>
          <div className="text-right">
            <span className="font-mono text-white text-sm bg-white/10 px-2.5 py-0.5 rounded-lg">
              ⏱ {formatElapsed(displaySeconds)}
            </span>
            {penaltySeconds > 0 && (
              <div className="text-red-300 text-xs font-mono mt-0.5 text-right">
                +{formatElapsed(penaltySeconds)} ceza
              </div>
            )}
          </div>
        </div>

        {/* Oyuncu / Dönem */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-purple-400 text-xs">
            Oyuncu:{" "}
            <span className="text-purple-200 font-semibold">{nickname}</span>
          </p>
          <p className="text-purple-400 text-xs">
            Dönem:{" "}
            <span className="text-purple-200 font-semibold">{ayAdi}</span>
          </p>
        </div>

        {/* Durak başlığı */}
        <div className="text-center mb-4">
          <div className="text-5xl mb-2">{stop.emoji}</div>
          <h1 className="text-xl font-bold text-white">{stop.name}</h1>
          <span className="inline-block mt-1 px-2.5 py-0.5 bg-purple-700/60 text-purple-200 text-xs rounded-full">
            {DERS_ADI[stop.dersKey]}
          </span>
        </div>

        {/* İlerleme noktaları */}
        <div className="flex justify-center gap-2 mb-4">
          {Array.from({ length: allStops.length }).map((_, i) => (
            <div
              key={i}
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                i + 1 < stop.order
                  ? "bg-green-400"
                  : i + 1 === stop.order
                  ? "bg-white scale-125"
                  : "bg-white/20"
              }`}
            />
          ))}
        </div>

        {/* ── Hikaye metni ── */}
        {(screen === "question" || screen === "backup-question") && stop.hikaye && (
          <div className="bg-blue-900/40 border border-blue-500/30 rounded-xl px-4 py-3 mb-4">
            <p className="text-blue-200 text-xs leading-relaxed italic">
              📖 {stop.hikaye}
            </p>
          </div>
        )}

        {/* ── ALREADY DONE ── */}
        {screen === "already-done" && (
          <div className="bg-green-500/20 border border-green-400/40 rounded-2xl p-5 text-center">
            <div className="text-3xl mb-2">✅</div>
            <p className="text-green-200 font-bold mb-2">
              Bu durağı zaten tamamladın!
            </p>
            <p className="text-green-100/70 text-sm leading-relaxed">
              {stop.nextStopId
                ? stop.nextClue
                : "Tüm durakları tamamladın!"}
            </p>
          </div>
        )}

        {/* ── SORU EKRANI ── */}
        {screen === "question" && soru && (
          <>
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-5 mb-4">
              <p className="text-white font-medium text-base leading-relaxed">
                {soru.soru}
              </p>
            </div>

            {visibleHint && (
              <div className="bg-amber-500/20 border border-amber-400/40 rounded-xl px-4 py-3 mb-4">
                <p className="text-amber-200 text-sm leading-relaxed">
                  {visibleHint}
                </p>
              </div>
            )}

            {wrongCount >= 2 && !visibleHint && (
              <div className="bg-red-500/20 border border-red-400/40 rounded-xl px-4 py-2 mb-4 text-center">
                <p className="text-red-300 text-xs">
                  ⚠️ Bir sonraki yanlış cevapta yedek soru verilecek (+15sn ceza)
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2.5 mb-4">
              {soru.secenekler.map((option, index) => {
                const wasWrong =
                  selectedIndex === index && index !== soru.dogruIndex;
                return (
                  <button
                    key={index}
                    onClick={() => handleAnswer(index)}
                    className={`w-full text-left px-4 py-3.5 rounded-xl font-medium text-sm transition-all duration-150 active:scale-95 ${
                      wasWrong
                        ? "bg-red-500/30 border border-red-400/60 text-red-200"
                        : "bg-white/10 border border-white/20 text-white hover:bg-white/20 hover:border-white/40"
                    }`}
                  >
                    <span className="text-purple-300 mr-2">
                      {String.fromCharCode(65 + index)})
                    </span>
                    {option}
                  </button>
                );
              })}
            </div>

            {wrongCount > 0 && (
              <p className="text-center text-red-300/70 text-xs">
                {wrongCount} yanlış cevap — +{wrongCount * 15}sn ceza
              </p>
            )}
          </>
        )}

        {/* ── YEDEK SORU EKRANI ── */}
        {screen === "backup-question" && backupSoru && (
          <>
            <div className="bg-orange-500/20 border border-orange-400/40 rounded-xl px-4 py-3 mb-4 text-center">
              <p className="text-orange-200 text-sm font-semibold">
                🔄 Ek Görev! 3 yanlış sonucu yedek soru verildi.
              </p>
            </div>

            {!backupFailed ? (
              <>
                <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-5 mb-4">
                  <p className="text-white font-medium text-base leading-relaxed">
                    {backupSoru.soru}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2.5 mb-4">
                  {backupSoru.secenekler.map((option, index) => {
                    const wasWrong =
                      backupSelectedIndex === index &&
                      index !== backupSoru.dogruIndex;
                    return (
                      <button
                        key={index}
                        onClick={() => handleBackupAnswer(index)}
                        className={`w-full text-left px-4 py-3.5 rounded-xl font-medium text-sm transition-all duration-150 active:scale-95 ${
                          wasWrong
                            ? "bg-red-500/30 border border-red-400/60 text-red-200"
                            : "bg-white/10 border border-white/20 text-white hover:bg-white/20 hover:border-white/40"
                        }`}
                      >
                        <span className="text-purple-300 mr-2">
                          {String.fromCharCode(65 + index)})
                        </span>
                        {option}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              // Yedek de yanlış → açıklama
              <div className="space-y-4">
                <div className="bg-red-500/20 border border-red-400/40 rounded-2xl p-5">
                  <p className="text-red-200 font-bold mb-2">Yedek Soru da Yanlış</p>
                  <p className="text-white/80 text-sm">
                    Doğru cevap:{" "}
                    <span className="font-bold text-green-300">
                      {backupSoru.secenekler[backupSoru.dogruIndex]}
                    </span>
                  </p>
                  <p className="text-white/50 text-xs mt-2 leading-relaxed">
                    {backupSoru.ipucu2}
                  </p>
                </div>
                <button
                  onClick={handleForceAdvance}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-sm transition-colors"
                >
                  Bir Sonraki Durağa Devam Et →
                </button>
              </div>
            )}
          </>
        )}

        {/* ── DOĞRU / SONRAKI DURAK ── */}
        {screen === "correct" && soru && (
          <div>
            <div className="bg-green-500/20 border border-green-400/40 rounded-2xl p-5 text-center mb-4">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-green-200 font-bold text-lg mb-1">
                Doğru Cevap! Kanıt toplandı 🔍
              </p>
              <p className="text-green-100/70 text-sm">
                {soru.secenekler[soru.dogruIndex]}
              </p>
            </div>
            <div className="bg-blue-500/20 border border-blue-400/40 rounded-2xl p-5">
              <p className="text-blue-100 text-sm leading-relaxed font-medium">
                {stop.nextClue}
              </p>
            </div>
            <p className="text-center text-white/40 text-xs mt-4">
              Bir sonraki durağa git ve QR kodu tara!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

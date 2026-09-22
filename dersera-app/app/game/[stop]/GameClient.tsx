"use client";

import { useState, useEffect } from "react";
import { Stop, stops } from "@/data/stops";
import {
  loadProgress,
  markStopComplete,
  loadEndTime,
  saveEndTime,
  formatElapsed,
  GameProgress,
} from "@/lib/gameState";
import {
  getSorular,
  DERS_ADI,
  AYLAR,
} from "@/data/mufredat";
import type { Soru } from "@/data/mufredat";

interface Props {
  stop: Stop;
  nickname: string;
  startTime: number;
  aylar: string[];
}

type Screen = "loading" | "question" | "already-done" | "correct" | "summary";

function computeElapsed(startTime: number, endTime?: number): number {
  return Math.floor(((endTime ?? Date.now()) - startTime) / 1000);
}

function SummaryScreen({
  nickname,
  elapsedSeconds,
  progress,
}: {
  nickname: string;
  elapsedSeconds: number;
  progress: GameProgress;
}) {
  const totalHints = Object.values(progress).reduce(
    (sum, p) => sum + p.hintsUsed,
    0
  );
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-6xl mb-3">🏆</div>
          <h1 className="text-2xl font-bold text-white">Tebrikler, {nickname}!</h1>
          <p className="text-purple-300 text-sm mt-1">Okulun şifresi çözüldü!</p>
        </div>
        <div className="bg-yellow-500/20 border border-yellow-400/40 rounded-2xl p-5 mb-4 text-center">
          <p className="text-yellow-300 text-xs font-semibold uppercase tracking-widest mb-1">
            Toplam Süre
          </p>
          <p className="text-4xl font-bold text-white font-mono">
            {formatElapsed(elapsedSeconds)}
          </p>
          <p className="text-yellow-200/60 text-xs mt-1">
            {totalHints === 0
              ? "İpucu kullanmadan tamamladın! 🌟"
              : `${totalHints} ipucu kullandın`}
          </p>
        </div>
        <div className="bg-white/10 border border-white/20 rounded-2xl overflow-hidden mb-6">
          {stops.map((s, i) => {
            const p = progress[s.id];
            return (
              <div
                key={s.id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  i < stops.length - 1 ? "border-b border-white/10" : ""
                }`}
              >
                <span className="text-xl">{s.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">{s.name}</p>
                  <p className="text-white/40 text-xs">{s.subject}</p>
                </div>
                <span className="text-green-400 text-xs font-semibold">
                  {p
                    ? `✅ ${p.hintsUsed > 0 ? `${p.hintsUsed} ipucu` : "Temiz!"}`
                    : "—"}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-center text-white/50 text-sm">
          Öğretmenine giderek ödülünü al! 🎁
        </p>
      </div>
    </div>
  );
}

export default function GameClient({ stop, nickname, startTime, aylar }: Props) {
  const [screen, setScreen] = useState<Screen>("loading");
  const [soru, setSoru] = useState<Soru | null>(null);
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [progress, setProgress] = useState<GameProgress>({});

  const ayAdi = aylar
    .map((slug) => AYLAR.find((a) => a.ay === slug)?.ad ?? slug)
    .join(", ");

  useEffect(() => {
    const saved = loadProgress();
    setProgress(saved);

    if (saved[stop.id]) {
      const endTime = loadEndTime();
      if (stop.nextStopId === null && endTime) {
        setElapsedSeconds(computeElapsed(startTime, endTime));
        setScreen("summary");
      } else {
        setScreen("already-done");
      }
      return;
    }

    const sorular = getSorular(stop.dersKey, aylar);
    if (!sorular.length) {
      // No questions for this subject/month combination — show already-done
      setScreen("question");
      return;
    }
    const picked = sorular[Math.floor(Math.random() * sorular.length)];
    setSoru(picked);
    setScreen("question");
  }, [stop.id, stop.nextStopId, stop.dersKey, startTime, aylar]);

  useEffect(() => {
    if (screen === "summary" || screen === "loading") return;
    const endTime = loadEndTime();
    if (endTime) {
      setElapsedSeconds(computeElapsed(startTime, endTime));
      return;
    }
    const id = setInterval(
      () => setElapsedSeconds(computeElapsed(startTime)),
      1000
    );
    return () => clearInterval(id);
  }, [startTime, screen]);

  const isLastStop = stop.nextStopId === null;
  const visibleHint =
    hintsRevealed >= 2
      ? soru?.ipucu2
      : hintsRevealed === 1
      ? soru?.ipucu1
      : null;

  function handleAnswer(index: number) {
    if (!soru) return;
    setSelectedIndex(index);
    if (index === soru.dogruIndex) {
      const hintsUsed = hintsRevealed;
      markStopComplete(stop.id, hintsUsed);
      const updated = loadProgress();
      if (isLastStop) {
        const endTs = Date.now();
        saveEndTime(endTs);
        setElapsedSeconds(computeElapsed(startTime, endTs));
        setProgress(updated);
        setScreen("summary");
      } else {
        setProgress(updated);
        setScreen("correct");
      }
    } else {
      setHintsRevealed((h) => Math.min(h + 1, 2));
    }
  }

  if (screen === "summary") {
    return (
      <SummaryScreen
        nickname={nickname}
        elapsedSeconds={elapsedSeconds}
        progress={progress}
      />
    );
  }

  if (screen === "loading" || !soru) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="text-white/40 text-sm">Soru yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col items-center px-4 py-6">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-purple-300 uppercase tracking-widest">
            Durak {stop.order} / 5
          </span>
          <span className="font-mono text-white/80 text-sm bg-white/10 px-2.5 py-0.5 rounded-lg">
            ⏱ {formatElapsed(elapsedSeconds)}
          </span>
        </div>
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

        <div className="text-center mb-5">
          <div className="text-5xl mb-2">{stop.emoji}</div>
          <h1 className="text-xl font-bold text-white">{stop.name}</h1>
          <span className="inline-block mt-1 px-2.5 py-0.5 bg-purple-700/60 text-purple-200 text-xs rounded-full">
            {DERS_ADI[stop.dersKey]}
          </span>
        </div>

        <div className="flex justify-center gap-2 mb-5">
          {Array.from({ length: 5 }).map((_, i) => (
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

        {screen === "already-done" && (
          <div className="bg-green-500/20 border border-green-400/40 rounded-2xl p-5 text-center">
            <div className="text-3xl mb-2">✅</div>
            <p className="text-green-200 font-bold mb-2">
              Bu durağı zaten tamamladın!
            </p>
            <p className="text-green-100/70 text-sm leading-relaxed">
              {stop.nextStopId
                ? stop.nextClue
                : "Tüm durakları tamamladın! Öğretmenine git."}
            </p>
          </div>
        )}

        {screen === "question" && (
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

            {hintsRevealed < 2 && (
              <button
                onClick={() => setHintsRevealed((h) => Math.min(h + 1, 2))}
                className="w-full py-2.5 bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/40 text-amber-200 text-sm font-semibold rounded-xl transition-all duration-200 active:scale-95"
              >
                {hintsRevealed === 0
                  ? "💡 İpucu Al (1. kademe)"
                  : "💡 Daha Güçlü İpucu (2. kademe)"}
              </button>
            )}
          </>
        )}

        {screen === "correct" && (
          <div>
            <div className="bg-green-500/20 border border-green-400/40 rounded-2xl p-5 text-center mb-4">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-green-200 font-bold text-lg mb-1">
                Doğru Cevap!
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

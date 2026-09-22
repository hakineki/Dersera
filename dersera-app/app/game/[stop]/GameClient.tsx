"use client";

import { useState } from "react";
import { Stop } from "@/data/stops";

interface Props {
  stop: Stop;
}

type GameState = "question" | "hint" | "correct";

export default function GameClient({ stop }: Props) {
  const [gameState, setGameState] = useState<GameState>("question");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);

  function handleAnswer(index: number) {
    setSelectedIndex(index);
    if (index === stop.correctIndex) {
      setGameState("correct");
    } else {
      setAttempts((a) => a + 1);
      setGameState("hint");
    }
  }

  function handleRetry() {
    setSelectedIndex(null);
    setGameState("question");
  }

  const isLastStop = stop.nextStopId === null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col items-center justify-start px-4 py-8">
      {/* Header */}
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-purple-300 uppercase tracking-widest">
            Durak {stop.order} / 5
          </span>
        </div>

        <div className="text-center mb-6">
          <div className="text-6xl mb-3">{stop.emoji}</div>
          <h1 className="text-2xl font-bold text-white">{stop.name}</h1>
          <span className="inline-block mt-1 px-3 py-0.5 bg-purple-700/60 text-purple-200 text-xs rounded-full">
            {stop.subject}
          </span>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-6">
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

        {/* Question card */}
        {gameState !== "correct" && (
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-5 mb-4">
            <p className="text-white font-medium text-base leading-relaxed">
              {stop.question}
            </p>
          </div>
        )}

        {/* Hint state */}
        {gameState === "hint" && (
          <div className="bg-amber-500/20 border border-amber-400/40 rounded-xl p-4 mb-4 animate-pulse-once">
            <p className="text-amber-200 text-sm leading-relaxed">{stop.hint}</p>
            {attempts >= 2 && (
              <p className="text-amber-300/70 text-xs mt-2">
                Doğru cevap:{" "}
                <span className="font-bold text-amber-200">
                  {stop.options[stop.correctIndex]}
                </span>
              </p>
            )}
          </div>
        )}

        {/* Answer options */}
        {gameState !== "correct" && (
          <div className="grid grid-cols-1 gap-3">
            {stop.options.map((option, index) => {
              let btnClass =
                "w-full text-left px-4 py-3.5 rounded-xl font-medium text-sm transition-all duration-200 ";
              if (gameState === "hint" && selectedIndex === index) {
                btnClass +=
                  "bg-red-500/30 border border-red-400/60 text-red-200 cursor-default";
              } else {
                btnClass +=
                  "bg-white/10 border border-white/20 text-white hover:bg-white/20 hover:border-white/40 active:scale-95";
              }
              return (
                <button
                  key={index}
                  onClick={() =>
                    gameState === "question" ? handleAnswer(index) : undefined
                  }
                  disabled={gameState === "hint"}
                  className={btnClass}
                >
                  <span className="text-purple-300 mr-2">
                    {String.fromCharCode(65 + index)})
                  </span>
                  {option}
                </button>
              );
            })}
          </div>
        )}

        {/* Retry button */}
        {gameState === "hint" && (
          <button
            onClick={handleRetry}
            className="w-full mt-4 py-3 bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-semibold rounded-xl transition-all duration-200"
          >
            Tekrar Dene 🔄
          </button>
        )}

        {/* Correct state */}
        {gameState === "correct" && (
          <div className="animate-fade-in">
            <div className="bg-green-500/20 border border-green-400/40 rounded-2xl p-6 text-center mb-4">
              <div className="text-4xl mb-3">{isLastStop ? "🏆" : "✅"}</div>
              <p className="text-green-200 font-bold text-lg mb-1">
                {isLastStop ? "Macera Tamamlandı!" : "Doğru Cevap!"}
              </p>
              <p className="text-green-100/80 text-sm">
                Cevap:{" "}
                <span className="font-semibold text-green-200">
                  {stop.options[stop.correctIndex]}
                </span>
              </p>
            </div>

            <div
              className={`rounded-2xl p-5 border ${
                isLastStop
                  ? "bg-yellow-500/20 border-yellow-400/40"
                  : "bg-blue-500/20 border-blue-400/40"
              }`}
            >
              <p
                className={`text-sm leading-relaxed font-medium ${
                  isLastStop ? "text-yellow-100" : "text-blue-100"
                }`}
              >
                {stop.nextClue}
              </p>
            </div>

            {!isLastStop && (
              <p className="text-center text-white/50 text-xs mt-4">
                Bir sonraki durağa git ve QR kodu tara!
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

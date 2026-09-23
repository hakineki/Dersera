"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import type { Stop } from "@/data/stops";
import {
  loadNickname,
  loadStartTime,
  loadEndTime,
  saveNickname,
  saveStartTime,
  savePlayerToken,
  loadProgress,
  isPreviousStopsComplete,
  loadGameSnapshot,
  saveGameSnapshot,
  switchToGame,
  restartGame,
} from "@/lib/gameState";
import { isGameActive, parseQrParam, stopId, toStops, type PublicGame } from "@/lib/games";
import { fetchGame, joinGameRequest } from "@/lib/gamesClient";
import NicknameEntry from "./[stop]/NicknameEntry";
import GameClient from "./GameClient";
import CodeEntry from "./CodeEntry";

type View =
  | { kind: "loading" }
  | { kind: "code"; notice?: string }
  | { kind: "message"; icon: string; title: string; text: string }
  | { kind: "choice" }
  | { kind: "nickname"; notice?: string }
  | { kind: "game" };

// Son bilinen kopya varsa sunucudan tazelenir; ağ yoksa yerel kopyayla devam edilir.
async function refreshSnapshot(snap: PublicGame): Promise<PublicGame | null> {
  const r = await fetchGame(snap.code, 3000);
  if (r.status === "ok") {
    saveGameSnapshot(r.game);
    return r.game;
  }
  return r.status === "not-found" ? null : snap;
}

export default function GameWrapper() {
  const qr = parseQrParam(useSearchParams().get("qr"));
  const [view, setView] = useState<View>({ kind: "loading" });
  const [game, setGame] = useState<PublicGame | null>(null);
  const [stop, setStop] = useState<Stop | null>(null);
  const [allStops, setAllStops] = useState<Stop[]>([]);
  const [nickname, setNickname] = useState("");
  const [startTime, setStartTime] = useState(0);
  const [joining, setJoining] = useState(false);
  // Takma ad formu onConfirm'u beklemeden yeniden etkinleşir; çift dokunuş öğrencinin kendi adı için 409 üretmesin.
  const joiningRef = useRef(false);

  const resolve = useCallback(
    (g: PublicGame) => {
      const started = Boolean(loadNickname() && loadStartTime());
      const finished = loadEndTime() !== null;

      if (!isGameActive(g) && !started) {
        setView({ kind: "code", notice: "Bu oyun sona erdi. Öğretmeninden yeni kodu iste." });
        return;
      }
      if (!isGameActive(g) && !finished) {
        setView({
          kind: "message",
          icon: "⏰",
          title: "Oyun Sona Erdi",
          text: "Öğretmenin oyunu kapattı ya da süre doldu. Yeni soru açılamaz.",
        });
        return;
      }

      const stops = toStops(g.stops);
      const current = stops.find((s) => s.id === stopId(qr ?? 0));
      if (!current) {
        setView({
          kind: "message",
          icon: "🔍",
          title: "Bu QR Bu Oyunda Yok",
          text: `${qr} numaralı QR kod bu oyunda kullanılmıyor. Sıradaki durağın ipucunu takip et.`,
        });
        return;
      }

      if (current.order > 1 && !isPreviousStopsComplete(current.order, loadProgress(), stops)) {
        setView({
          kind: "message",
          icon: "🔒",
          title: "Henüz Bu Durağa Ulaşmadın",
          text: "Bu durağa geçmeden önce önceki durağı tamamlaman gerekiyor. Önceki durağın QR kodunu tara!",
        });
        return;
      }

      setGame(g);
      setAllStops(stops);
      setStop(current);

      if (started) {
        setNickname(loadNickname() ?? "");
        setStartTime(loadStartTime() ?? 0);
        setView({ kind: current.order === 1 && isGameActive(g) ? "choice" : "game" });
      } else {
        setView({ kind: "nickname" });
      }
    },
    [qr]
  );

  useEffect(() => {
    if (qr === null) {
      setTimeout(() =>
        setView({
          kind: "message",
          icon: "🔍",
          title: "Geçersiz QR",
          text: "Bu QR kodu geçerli bir durağa ait değil.",
        })
      );
      return;
    }
    const snap = loadGameSnapshot();
    if (!snap) {
      setTimeout(() => setView({ kind: "code" }));
      return;
    }
    let cancelled = false;
    refreshSnapshot(snap).then((g) => {
      if (cancelled) return;
      if (g) resolve(g);
      else setView({ kind: "code", notice: "Önceki oyun artık yok. Yeni oyun kodunu gir." });
    });
    return () => {
      cancelled = true;
    };
  }, [qr, resolve]);

  function handleCode(g: PublicGame) {
    switchToGame(g);
    resolve(g);
  }

  async function handleNicknameConfirm(nick: string) {
    if (!game || joiningRef.current) return;
    joiningRef.current = true;
    setJoining(true);
    const joined = await joinGameRequest(game.code, nick);
    joiningRef.current = false;
    setJoining(false);
    if (joined.status === "taken") {
      setView({ kind: "nickname", notice: `“${nick}” bu oyunda başka bir öğrencide. Farklı bir takma ad seç.` });
      return;
    }
    if (joined.status === "joined") savePlayerToken(joined.playerToken);
    const now = Date.now();
    saveNickname(nick);
    saveStartTime(now);
    setNickname(nick);
    setStartTime(now);
    setView({ kind: "game" });
  }

  function handleRestart() {
    const now = Date.now();
    restartGame(now);
    setStartTime(now);
    setView({ kind: "game" });
  }

  const shell = "min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center px-5";

  switch (view.kind) {
    case "loading":
      return (
        <div className={shell}>
          <div className="text-white/40 text-sm">Yükleniyor...</div>
        </div>
      );
    case "code":
      return <CodeEntry onValid={handleCode} notice={view.notice} />;
    case "message":
      return (
        <div className={shell}>
          <div className="text-center max-w-sm">
            <div className="text-5xl mb-3">{view.icon}</div>
            <h1 className="text-xl font-bold text-white mb-2">{view.title}</h1>
            <p className="text-purple-300 text-sm leading-relaxed">{view.text}</p>
          </div>
        </div>
      );
    case "choice":
      return (
        <div className={shell}>
          <div className="w-full max-w-sm text-center">
            <div className="text-5xl mb-3">👋</div>
            <h1 className="text-xl font-bold text-white mb-2">Tekrar hoş geldin, {nickname}!</h1>
            <p className="text-purple-300 text-sm mb-6">Bu cihazda devam eden bir oyunun var.</p>
            <div className="space-y-3">
              <button
                onClick={() => setView({ kind: "game" })}
                className="w-full bg-white text-indigo-900 font-bold py-3 rounded-xl hover:bg-purple-50 transition-colors"
              >
                ▶ Devam et
              </button>
              <button
                onClick={handleRestart}
                className="w-full border border-white/30 text-white font-semibold py-3 rounded-xl hover:bg-white/10 transition-colors"
              >
                ↺ Yeniden başla
              </button>
              <p className="text-white/40 text-xs">Yeniden başlarsan süre, ilerleme ve ceza sıfırlanır.</p>
            </div>
          </div>
        </div>
      );
    case "nickname":
      return (
        <>
          {view.notice && (
            <div role="alert" className="fixed top-4 inset-x-4 z-50 mx-auto max-w-sm bg-amber-400 text-gray-900 text-sm font-semibold rounded-xl px-4 py-3 shadow-lg">
              {view.notice}
            </div>
          )}
          <NicknameEntry key={view.notice ?? "ilk"} onConfirm={handleNicknameConfirm} />
          {joining && (
            <div role="status" className="fixed inset-0 z-50 bg-indigo-950/70 flex items-center justify-center text-white text-sm font-semibold">
              Oyuna katılınıyor…
            </div>
          )}
        </>
      );
    case "game":
      if (!stop || !game) return null;
      return (
        <GameClient
          key={startTime}
          stop={stop}
          allStops={allStops}
          gameCode={game.code}
          nickname={nickname}
          startTime={startTime}
          aylar={game.aylar}
        />
      );
  }
}

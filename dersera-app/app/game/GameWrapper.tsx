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
  loadPlayerToken,
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
import ComposerPlayer from "./composer/ComposerPlayer";
import { qrOf } from "@/lib/composer/scene";

type View =
  | { kind: "loading" }
  | { kind: "code"; notice?: string }
  | { kind: "message"; icon: string; title: string; text: string }
  | { kind: "choice" }
  | { kind: "nickname"; notice?: string }
  | { kind: "game" };

// Bu cihazda bu oyuna katılmış öğrencinin kimliği (Composer oyununun içeriği yalnız onunla gelir).
function oyuncuKimligi(): { ad: string; anahtar: string } | null {
  const ad = loadNickname();
  const anahtar = loadPlayerToken();
  return ad && anahtar ? { ad, anahtar } : null;
}

// Son bilinen kopya varsa sunucudan tazelenir; ağ yoksa yerel kopyayla devam edilir. Sunucu içeriği artık vermiyorsa
// (oyun bitti) katılırken alınmış tanım korunur: öğrenci sonucunu görmeye devam eder.
async function refreshSnapshot(snap: PublicGame): Promise<PublicGame | null> {
  const r = await fetchGame(snap.code, 3000, oyuncuKimligi());
  if (r.status === "ok") {
    const { icerikKilitli, ...acik } = r.game;
    const g: PublicGame = icerikKilitli && snap.definition ? { ...acik, definition: snap.definition } : r.game;
    saveGameSnapshot(g);
    return g;
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

      // Composer oyunu: sahneleri kendi oynatıcısı yönetir; tek sınıf oyununda QR gerekmez. İçerik katılımdan sonra gelir.
      if (g.definition || g.icerikKilitli) {
        setGame(g);
        if (!started) {
          setView({ kind: "nickname" });
          return;
        }
        if (!g.definition) {
          setView({ kind: "message", icon: "🔒", title: "Oyun Açılamadı", text: "Bu cihazda oyunun içeriği yok. Öğretmeninden yeni oyun kodunu iste." });
          return;
        }
        setNickname(loadNickname() ?? "");
        setStartTime(loadStartTime() ?? 0);
        const baslangicQr = qrOf(g.definition, g.definition.duraklar[0].id);
        const basta = qr === null || qr === baslangicQr;
        setView({ kind: basta && !finished && isGameActive(g) ? "choice" : "game" });
        return;
      }

      if (qr === null) {
        setView({ kind: "message", icon: "🔍", title: "QR Kodu Tara", text: "Bu oyunda duraklar QR kodlarla açılır. Bulunduğun durağın QR kodunu tara." });
        return;
      }

      const stops = toStops(g.stops);
      const current = stops.find((s) => s.id === stopId(qr));
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
    // Composer oyununun soruları katılımdan sonra, oyuncu anahtarıyla alınır (kod bilen herkese gönderilmez).
    const icerik =
      game.icerikKilitli && joined.status === "joined" ? await fetchGame(game.code, 5000, { ad: nick, anahtar: joined.playerToken }) : null;
    joiningRef.current = false;
    setJoining(false);
    if (joined.status === "taken") {
      setView({ kind: "nickname", notice: `“${nick}” bu oyunda başka bir öğrencide. Farklı bir takma ad seç.` });
      return;
    }
    if (game.icerikKilitli) {
      if (!icerik || icerik.status !== "ok" || !icerik.game.definition) {
        setView({ kind: "nickname", notice: "Oyun yüklenemedi. Bağlantını kontrol edip tekrar dene." });
        return;
      }
      setGame(icerik.game);
      saveGameSnapshot(icerik.game);
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
      if (game?.definition) {
        return (
          <ComposerPlayer key={startTime} def={game.definition} gameCode={game.code} nickname={nickname} startTime={startTime} qr={qr} />
        );
      }
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

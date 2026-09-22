"use client";

import { useState, useEffect } from "react";
import { Stop, stops, getStop } from "@/data/stops";
import type { Ders } from "@/data/mufredat";
import {
  loadNickname,
  loadStartTime,
  saveNickname,
  saveStartTime,
  loadProgress,
  loadCustomStops,
  isPreviousStopsComplete,
} from "@/lib/gameState";
import NicknameEntry from "./NicknameEntry";
import GameClient from "./GameClient";

interface Props {
  stopId: string;
  aylar: string[];
}

type View = "loading" | "not-found" | "locked" | "nickname" | "game";

export default function GameWrapper({ stopId, aylar }: Props) {
  const [view, setView] = useState<View>("loading");
  const [stop, setStop] = useState<Stop | null>(null);
  const [nickname, setNickname] = useState("");
  const [startTime, setStartTime] = useState(0);

  useEffect(() => {
    // 1. Durağı çöz: önce statik, sonra localStorage özel duraklar
    const staticStop = getStop(stopId);
    let resolvedStop: Stop | null = staticStop ?? null;

    if (!resolvedStop) {
      const customStops = loadCustomStops();
      const cs = customStops.find((c) => c.id === stopId);
      if (cs) {
        resolvedStop = {
          id: cs.id,
          order: cs.order,
          name: cs.name,
          emoji: cs.emoji,
          subject: cs.subject,
          dersKey: cs.dersKey as Ders,
          nextStopId: cs.nextStopId,
          nextClue: cs.nextClue,
        };
      }
    }

    if (!resolvedStop) {
      setView("not-found");
      return;
    }
    setStop(resolvedStop);

    // 2. Sıra kilidi: önceki duraklar tamamlanmış mı?
    const savedProgress = loadProgress();
    if (resolvedStop.order > 1) {
      const customStops = loadCustomStops();
      const allStopRefs = [
        ...stops.map((s) => ({ id: s.id, order: s.order })),
        ...customStops.map((cs) => ({ id: cs.id, order: cs.order })),
      ];
      if (!isPreviousStopsComplete(resolvedStop.order, savedProgress, allStopRefs)) {
        setView("locked");
        return;
      }
    }

    // 3. Takma ad: yalnızca 1. durakta girilir; diğerleri localStorage'dan okunur
    const savedNick = loadNickname();
    const savedStart = loadStartTime();

    if (resolvedStop.order === 1) {
      if (savedNick && savedStart) {
        setNickname(savedNick);
        setStartTime(savedStart);
        setView("game");
      } else {
        setView("nickname");
      }
    } else {
      if (savedNick && savedStart) {
        setNickname(savedNick);
        setStartTime(savedStart);
        setView("game");
      } else {
        setView("locked");
      }
    }
  }, [stopId]);

  function handleNicknameConfirm(nick: string) {
    const now = Date.now();
    saveNickname(nick);
    saveStartTime(now);
    setNickname(nick);
    setStartTime(now);
    setView("game");
  }

  if (view === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="text-white/40 text-sm">Yükleniyor...</div>
      </div>
    );
  }

  if (view === "not-found") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center px-5">
        <div className="text-center">
          <div className="text-5xl mb-3">🔍</div>
          <h1 className="text-xl font-bold text-white mb-2">Durak Bulunamadı</h1>
          <p className="text-purple-300 text-sm">
            Bu QR kodu geçerli bir durağa ait değil.
          </p>
        </div>
      </div>
    );
  }

  if (view === "locked") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center px-5">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-3">🔒</div>
          <h1 className="text-xl font-bold text-white mb-2">
            Henüz Bu Durağa Ulaşmadın
          </h1>
          <p className="text-purple-300 text-sm leading-relaxed">
            Bu durağa geçmeden önce önceki durağı tamamlaman gerekiyor.
            Önceki durağın QR kodunu tara!
          </p>
        </div>
      </div>
    );
  }

  if (view === "nickname") {
    return <NicknameEntry onConfirm={handleNicknameConfirm} />;
  }

  if (!stop) return null;

  return (
    <GameClient stop={stop} nickname={nickname} startTime={startTime} aylar={aylar} />
  );
}

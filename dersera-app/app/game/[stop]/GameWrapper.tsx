"use client";

import { useState, useEffect } from "react";
import { Stop } from "@/data/stops";
import {
  loadNickname,
  loadStartTime,
  saveNickname,
  saveStartTime,
} from "@/lib/gameState";
import NicknameEntry from "./NicknameEntry";
import GameClient from "./GameClient";

interface Props {
  stop: Stop;
  ay: string;
}

type View = "loading" | "nickname" | "game";

export default function GameWrapper({ stop, ay }: Props) {
  const [view, setView] = useState<View>("loading");
  const [nickname, setNickname] = useState("");
  const [startTime, setStartTime] = useState(0);

  useEffect(() => {
    const savedNick = loadNickname();
    const savedStart = loadStartTime();
    if (savedNick && savedStart) {
      setNickname(savedNick);
      setStartTime(savedStart);
      setView("game");
    } else {
      setView("nickname");
    }
  }, []);

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

  if (view === "nickname") {
    return <NicknameEntry onConfirm={handleNicknameConfirm} />;
  }

  return (
    <GameClient stop={stop} nickname={nickname} startTime={startTime} ay={ay} />
  );
}

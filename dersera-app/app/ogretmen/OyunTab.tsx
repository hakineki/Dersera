"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DERS_ADI, type Ders } from "@/data/mufredat";
import {
  DURATION_PRESETS_MIN,
  MAX_DURATION_MIN,
  MIN_DURATION_MIN,
  QR_COUNT,
  defaultGameStop,
  durakDersAdi,
  formatRemaining,
  isGameActive,
  remainingSeconds,
  type GameStop,
  type PublicGame,
} from "@/lib/games";
import { endGameRequest, fetchGame, publishGameRequest } from "@/lib/gamesClient";
import type { TeacherGame } from "@/lib/teacherGame";
import AySecici from "./AySecici";

const ALL_DERSLER = Object.keys(DERS_ADI) as Ders[];
const GAME_REFRESH_MS = 30_000;
const QR_OPTIONS = Array.from({ length: QR_COUNT }, (_, i) => i + 1);

function durationLabel(min: number): string {
  return min % 60 === 0 ? `${min / 60} saat` : `${min} dk`;
}

// ── Aktif oyun görünümü ───────────────────────────────────────────────────────
function ActiveGame({
  tg,
  finishedCount,
  onGameChange,
  onNewGame,
}: {
  tg: TeacherGame;
  finishedCount: number;
  onGameChange: (game: PublicGame) => void;
  onNewGame: () => void;
}) {
  const { game, adminToken } = tg;
  const [now, setNow] = useState(() => Date.now());
  const [players, setPlayers] = useState<number | null>(null);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const onGameChangeRef = useRef(onGameChange);
  // Yerel oyun (tanımıyla): sunucu tanımı yalnız katılan öğrenciye verdiğinden durum yenilenince yerel tanım korunur.
  const oyunRef = useRef(game);

  useEffect(() => {
    onGameChangeRef.current = onGameChange;
    oyunRef.current = game;
  });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchGame(game.code).then((r) => {
        if (cancelled) return;
        if (r.status === "not-found") setMissing(true);
        if (r.status !== "ok") return;
        setMissing(false);
        setPlayers(r.players);
        if (r.game.endedAt !== game.endedAt) onGameChangeRef.current({ ...oyunRef.current, endedAt: r.game.endedAt });
      });
    const first = setTimeout(load, 0);
    const id = setInterval(load, GAME_REFRESH_MS);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(id);
    };
  }, [game.code, game.endedAt]);

  const active = !missing && isGameActive(game, now);
  const left = remainingSeconds(game, now);

  async function handleEnd() {
    if (!window.confirm("Oyunu şimdi bitirmek istiyor musun? Öğrenciler yeni soru açamaz.")) return;
    setEnding(true);
    setError("");
    const ok = await endGameRequest(game.code, adminToken);
    setEnding(false);
    if (ok) onGameChange({ ...game, endedAt: Date.now() });
    else setError("Oyun bitirilemedi. Bağlantını kontrol edip tekrar dene.");
  }

  return (
    <div className="space-y-4">
      <div
        className={`rounded-2xl p-5 text-center border ${
          active ? "bg-indigo-900 text-white border-indigo-900" : "bg-gray-100 text-gray-700 border-gray-200"
        }`}
      >
        {game.definition && <p className="text-sm font-semibold mb-2">🧭 {game.definition.meta.baslik}</p>}
        <p className={`text-xs font-semibold uppercase tracking-widest mb-1 ${active ? "text-indigo-300" : "text-gray-500"}`}>
          Oyun Kodu
        </p>
        <p className="font-mono font-bold text-5xl tracking-widest mb-3" aria-live="polite">
          {game.code}
        </p>
        <p role="status" className={`text-sm font-semibold ${active ? "text-green-300" : "text-gray-500"}`}>
          {missing
            ? "⚠️ Bu oyun sunucuda bulunamadı — yeni oyun yayınla"
            : active
              ? `🟢 Oyun aktif — ${formatRemaining(left)} kaldı`
              : "⏹ Oyun sona erdi — yeni giriş yapılamaz"}
        </p>
        {active && (
          <p className="text-indigo-300 text-xs mt-2">
            {game.definition?.meta.alan === "sinif"
              ? "Öğrenciler dersera.vercel.app/game adresine girip bu kodu yazar."
              : "Öğrenciler QR kodu tarayınca bu kodu girer."}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Katılan öğrenci</p>
          <p className="text-2xl font-bold text-gray-900">{players ?? "—"}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Bitiren öğrenci</p>
          <p className="text-2xl font-bold text-gray-900">{finishedCount}</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <p className="px-4 py-2.5 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-100">
          {game.definition ? `Sahneler (${game.stops.length})` : `Durak sırası (${game.stops.length} durak)`}
        </p>
        <ol>
          {game.stops.map((s, i) => (
            <li key={s.qr} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0 text-sm">
              <span className="text-gray-400 w-5">{i + 1}.</span>
              {game.definition?.meta.alan !== "sinif" && (
                <span className="bg-[#3B2F9E] text-white text-xs font-bold rounded-md px-2 py-0.5">QR {s.qr}</span>
              )}
              <span>{s.emoji}</span>
              <span className="font-medium text-gray-900 flex-1">{s.name}</span>
              <span className="text-xs text-gray-400">{durakDersAdi(s.dersKey)}</span>
            </li>
          ))}
        </ol>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {active ? (
        <button
          onClick={handleEnd}
          disabled={ending}
          className="w-full border border-red-300 text-red-600 font-semibold py-2.5 rounded-lg hover:bg-red-50 disabled:opacity-60 transition-colors"
        >
          {ending ? "Bitiriliyor…" : "⏹ Oyunu Bitir"}
        </button>
      ) : (
        <button
          onClick={onNewGame}
          className="w-full bg-indigo-600 text-white font-semibold py-2.5 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          + Yeni Oyun Yayınla
        </button>
      )}
    </div>
  );
}

// ── Yayınlama formu ──────────────────────────────────────────────────────────
function PublishForm({
  selectedAylar,
  toggleAy,
  onPublished,
}: {
  selectedAylar: string[];
  toggleAy: (slug: string) => void;
  onPublished: (tg: TeacherGame, persistent: boolean) => void;
}) {
  const [stops, setStops] = useState<GameStop[]>(() => Array.from({ length: 5 }, (_, i) => defaultGameStop(i)));
  const [preset, setPreset] = useState<number | "ozel">(60);
  const [customMin, setCustomMin] = useState(45);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const durationMinutes = preset === "ozel" ? customMin : preset;
  const qrCounts = stops.reduce<Record<number, number>>((acc, s) => ({ ...acc, [s.qr]: (acc[s.qr] ?? 0) + 1 }), {});
  const duplicateQr = Object.values(qrCounts).some((c) => c > 1);
  const emptyName = stops.some((s) => !s.name.trim() || !s.emoji.trim());
  const badDuration =
    !Number.isInteger(durationMinutes) || durationMinutes < MIN_DURATION_MIN || durationMinutes > MAX_DURATION_MIN;

  function setCount(count: number) {
    setStops((prev) => {
      if (count <= prev.length) return prev.slice(0, count);
      const used = new Set(prev.map((s) => s.qr));
      const extra: GameStop[] = [];
      for (let i = prev.length; i < count; i++) {
        const base = defaultGameStop(i);
        const qr = QR_OPTIONS.find((q) => !used.has(q)) ?? base.qr;
        used.add(qr);
        extra.push({ ...base, qr });
      }
      return [...prev, ...extra];
    });
  }

  function update(i: number, patch: Partial<GameStop>) {
    setStops((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  async function handlePublish() {
    setBusy(true);
    setError("");
    const res = await publishGameRequest({
      durationMinutes,
      aylar: selectedAylar,
      stops: stops.map((s) => ({ ...s, name: s.name.trim(), emoji: s.emoji.trim() })),
    });
    setBusy(false);
    if ("error" in res) setError(res.error);
    else onPublished({ game: res.game, adminToken: res.adminToken }, res.persistent);
  }

  return (
    <div>
      <Link
        href="/composer"
        className="flex items-center gap-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl p-4 mb-4 hover:opacity-95 transition-opacity"
      >
        <span className="text-2xl" aria-hidden="true">✨</span>
        <span className="flex-1">
          <span className="block font-bold">Yeni Oyun Oluştur</span>
          <span className="block text-xs text-indigo-100">Sınıf, ders ve konuyu seçin; Dersera hikâyeli oyunu tasarlasın.</span>
        </span>
        <span aria-hidden="true">›</span>
      </Link>
      <p className="text-xs text-gray-400 mb-3">ya da soru bankasıyla klasik oyun yayınlayın:</p>
      <AySecici selectedAylar={selectedAylar} toggleAy={toggleAy} />

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <label htmlFor="durak-sayisi" className="text-sm font-semibold text-gray-700">
            📍 Duraklar
          </label>
          <div className="flex items-center gap-2 text-sm">
            <select
              id="durak-sayisi"
              value={stops.length}
              onChange={(e) => setCount(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-2 py-1"
            >
              {QR_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span className="text-gray-500">durak</span>
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Her durak için okula astığın QR numarasını seç. Öğrenciler durakları bu sırayla dolaşır.{" "}
          <Link href="/qr-kutuphane" className="text-indigo-600 underline">
            QR Kütüphanesi
          </Link>
        </p>
        <div className="space-y-2">
          {stops.map((s, i) => (
            <div key={i} className="grid grid-cols-[1.5rem_4.5rem_2.75rem_1fr] sm:grid-cols-[1.5rem_4.5rem_2.75rem_1fr_11rem] gap-2 items-center">
              <span className="text-xs text-gray-400">{i + 1}.</span>
              <select
                aria-label={`${i + 1}. durak QR numarası`}
                value={s.qr}
                onChange={(e) => update(i, { qr: Number(e.target.value) })}
                className={`border rounded-lg px-1.5 py-1.5 text-sm ${qrCounts[s.qr] > 1 ? "border-red-400 bg-red-50" : "border-gray-300"}`}
              >
                {QR_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    QR {n}
                  </option>
                ))}
              </select>
              <input
                aria-label={`${i + 1}. durak simgesi`}
                value={s.emoji}
                maxLength={8}
                onChange={(e) => update(i, { emoji: e.target.value })}
                className="border border-gray-300 rounded-lg px-1 py-1.5 text-center text-sm"
              />
              <input
                aria-label={`${i + 1}. durak yeri`}
                value={s.name}
                maxLength={40}
                placeholder="Yer adı"
                onChange={(e) => update(i, { name: e.target.value })}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm min-w-0"
              />
              <select
                aria-label={`${i + 1}. durak dersi`}
                value={s.dersKey}
                onChange={(e) => update(i, { dersKey: e.target.value as Ders })}
                className="col-span-3 col-start-2 sm:col-span-1 sm:col-start-auto border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              >
                {ALL_DERSLER.map((d) => (
                  <option key={d} value={d}>
                    {DERS_ADI[d]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        {duplicateQr && <p className="text-xs text-red-600 mt-2">Aynı QR numarası iki durakta kullanılamaz.</p>}
        {emptyName && <p className="text-xs text-red-600 mt-2">Her durağın yer adı ve simgesi olmalı.</p>}
      </div>

      <fieldset className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <legend className="text-sm font-semibold text-gray-700 px-1">⏱ Oyun süresi</legend>
        <div className="flex flex-wrap gap-2">
          {[...DURATION_PRESETS_MIN, "ozel" as const].map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={preset === p}
              onClick={() => setPreset(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                preset === p ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {p === "ozel" ? "Özel" : durationLabel(p)}
            </button>
          ))}
          {preset === "ozel" && (
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="number"
                min={MIN_DURATION_MIN}
                max={MAX_DURATION_MIN}
                value={customMin}
                onChange={(e) => setCustomMin(Math.round(Number(e.target.value)))}
                className="w-20 border border-gray-300 rounded-lg px-2 py-1.5"
              />
              dakika
            </label>
          )}
        </div>
        {badDuration && (
          <p className="text-xs text-red-600 mt-2">
            Süre {MIN_DURATION_MIN}–{MAX_DURATION_MIN} dakika arasında olmalı.
          </p>
        )}
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-red-600 mb-3">
          {error}
        </p>
      )}

      <button
        onClick={handlePublish}
        disabled={busy || duplicateQr || emptyName || badDuration}
        className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-bold py-3 rounded-xl transition-colors"
      >
        {busy ? "Yayınlanıyor…" : `🚀 Yayınla (${durationLabel(durationMinutes || 0)})`}
      </button>
    </div>
  );
}

export default function OyunTab({
  teacherGame,
  finishedCount,
  selectedAylar,
  toggleAy,
  onTeacherGameChange,
}: {
  teacherGame: TeacherGame | null;
  finishedCount: number;
  selectedAylar: string[];
  toggleAy: (slug: string) => void;
  onTeacherGameChange: (tg: TeacherGame) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [notPersistent, setNotPersistent] = useState(false);

  if (!teacherGame || showForm) {
    return (
      <PublishForm
        selectedAylar={selectedAylar}
        toggleAy={toggleAy}
        onPublished={(tg, persistent) => {
          onTeacherGameChange(tg);
          setNotPersistent(!persistent);
          setShowForm(false);
        }}
      />
    );
  }

  return (
    <>
      {notPersistent && (
        <div role="alert" className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2 mb-3">
          Kalıcı depolama bağlı değil: oyun ve sonuçlar sunucu yeniden başlarsa kaybolabilir.
        </div>
      )}
      <ActiveGame
        tg={teacherGame}
        finishedCount={finishedCount}
        onGameChange={(game) => onTeacherGameChange({ ...teacherGame, game })}
        onNewGame={() => setShowForm(true)}
      />
    </>
  );
}

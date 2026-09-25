"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import DerseraLogo from "@/components/DerseraLogo";
import Link from "next/link";
import { fetchResults } from "@/lib/resultsClient";
import { stops as stopTemplates, type Stop } from "@/data/stops";
import { getSorular } from "@/data/mufredat";
import { formatElapsed, buildResultCode, type LeaderboardEntry } from "@/lib/gameState";
import { toStops } from "@/lib/games";
import { definitionPanelStops } from "@/lib/composer/scene";
import OgrenmeRaporuKarti from "./OgrenmeRaporu";
import { loadTeacherGame, saveTeacherGame, type TeacherGame } from "@/lib/teacherGame";
import AySecici from "./AySecici";
import OyunTab from "./OyunTab";
import KutuphaneTab from "./KutuphaneTab";
import OkulTab from "./OkulTab";
import OgrenmeTakibiTab from "./OgrenmeTakibiTab";
import { cikisYap, eskiYerelGirisiTemizle, girisYap, kayitOl, kullaniciAdiDegistir, oturumBilgisi, sifreDegistir, type HesapOzeti } from "@/lib/authClient";
import { eskiKutuphaneSayisi, eskiKutuphaneyiTasi } from "@/lib/libraryClient";
import {
  loadPilotInfo,
  savePilotInfo,
  type PilotInfo,
} from "@/lib/pilotInfo";

const SIFRE_MIN_ISTEMCI = 8;
// "Benim değil" seçimi bu tarayıcı oturumu boyunca hatırlanır.
const ESKI_KUTUPHANE_RED = "dersera:eski-kutuphane-red";

export type Tab = "oyun" | "kutuphane" | "takip" | "okul" | "sorular" | "siralama" | "ayarlar";

// ── Giriş / kayıt ekranı ─────────────────────────────────────────────────────
function LoginScreen({ onLogin, davetGerekli, kayitKapali }: { onLogin: (h: HesapOzeti) => void; davetGerekli: boolean; kayitKapali: boolean }) {
  const [mod, setMod] = useState<"giris" | "kayit">("giris");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [davet, setDavet] = useState("");
  const [kosulOnayi, setKosulOnayi] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (mod === "kayit" && password !== password2) {
      setError("Şifreler eşleşmiyor.");
      return;
    }
    setLoading(true);
    const r = mod === "giris" ? await girisYap(username, password) : await kayitOl(username, password, davet, kosulOnayi);
    setLoading(false);
    if ("error" in r) setError(r.error);
    else onLogin(r.hesap);
  }

  const alan = "w-full bg-white/10 border border-white/20 text-white placeholder-white/30 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400";

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <DerseraLogo />
          </div>
          <h1 className="text-xl font-bold text-white mt-2">{mod === "giris" ? "Öğretmen Girişi" : "Öğretmen Hesabı Oluştur"}</h1>
          <p className="text-purple-300 text-sm mt-1">{mod === "giris" ? "Panele erişmek için giriş yapın" : "Kütüphanen hesabına bağlanır ve her cihazdan açılır"}</p>
        </div>

        {kayitKapali ? (
          <p className="text-center text-xs text-purple-300 mb-5">Yeni öğretmen kaydı şu anda kapalı. Hesabın yoksa okul yöneticinden davet iste.</p>
        ) : (
        <div role="tablist" className="grid grid-cols-2 bg-white/10 rounded-xl p-1 mb-5">
          {(["giris", "kayit"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mod === m}
              onClick={() => {
                setMod(m);
                setError("");
              }}
              className={`py-2 rounded-lg text-sm font-semibold ${mod === m ? "bg-white text-indigo-900" : "text-purple-200"}`}
            >
              {m === "giris" ? "Giriş yap" : "Kayıt ol"}
            </button>
          ))}
        </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="kullanici-adi" className="block text-sm text-purple-200 mb-1.5">Kullanıcı Adı</label>
            <input id="kullanici-adi" type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" className={alan} placeholder="ayse.yilmaz" />
          </div>

          <div>
            <label htmlFor="sifre" className="block text-sm text-purple-200 mb-1.5">Şifre</label>
            <input id="sifre" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mod === "giris" ? "current-password" : "new-password"} className={alan} placeholder="••••••••" />
          </div>

          {mod === "kayit" && (
            <>
              <div>
                <label htmlFor="sifre2" className="block text-sm text-purple-200 mb-1.5">Şifre (Tekrar)</label>
                <input id="sifre2" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" className={alan} placeholder="••••••••" />
                <p className="text-xs text-purple-300 mt-1">En az {SIFRE_MIN_ISTEMCI} karakter.</p>
              </div>
              {davetGerekli && (
                <div>
                  <label htmlFor="davet" className="block text-sm text-purple-200 mb-1.5">Davet Kodu</label>
                  <input id="davet" type="text" value={davet} onChange={(e) => setDavet(e.target.value)} autoComplete="off" className={alan} />
                </div>
              )}
              <label className="flex items-start gap-2 text-sm text-purple-200">
                <input type="checkbox" checked={kosulOnayi} onChange={(e) => setKosulOnayi(e.target.checked)} className="mt-1 h-4 w-4 accent-indigo-400" />
                <span>
                  <Link href="/kosullar" target="_blank" className="underline text-white">
                    Kullanım koşullarını
                  </Link>{" "}
                  okudum; oyunları ve soruları platform dışında paylaşmayacağımı kabul ediyorum.
                </span>
              </label>
            </>
          )}

          {error && (
            <div role="alert" className="bg-red-500/20 border border-red-400/40 rounded-lg px-4 py-2">
              <p className="text-red-200 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username.trim() || !password || (mod === "kayit" && (!password2 || !kosulOnayi))}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:text-white/40 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
          >
            {loading ? "Kontrol ediliyor..." : mod === "giris" ? "Giriş Yap" : "Hesap Oluştur"}
          </button>
        </form>

        <Link href="/" className="block text-center text-purple-400 text-sm mt-6 hover:text-purple-200 transition-colors">
          ← Ana sayfaya dön
        </Link>
      </div>
    </div>
  );
}

// ── Soru Bankası sekmesi ──────────────────────────────────────────────────────
function SorularTab({
  selectedAylar,
  toggleAy,
}: {
  selectedAylar: string[];
  toggleAy: (slug: string) => void;
}) {
  const [selectedStopId, setSelectedStopId] = useState(stopTemplates[0]?.id ?? "");
  const stop = stopTemplates.find((s) => s.id === selectedStopId);
  const sorular = stop ? getSorular(stop.dersKey, selectedAylar) : [];

  return (
    <div>
      <AySecici selectedAylar={selectedAylar} toggleAy={toggleAy} />
      {/* Durak seçici */}
      <div className="flex flex-wrap gap-2 mb-5">
        {stopTemplates.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelectedStopId(s.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedStopId === s.id
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <span>{s.emoji}</span>
            <span>{s.name}</span>
          </button>
        ))}
      </div>

      {stop && (
        <div className="mb-3">
          <p className="text-sm text-gray-500 mb-1">
            <span className="font-semibold text-gray-700">{stop.subject}</span> —{" "}
            {sorular.length} soru
            {selectedAylar.length > 1 ? ` (${selectedAylar.length} ay birleşimi)` : ""}
          </p>
        </div>
      )}

      {sorular.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
          <p className="text-gray-400 text-sm">Bu ders için seçili dönemde soru yok.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sorular.map((s, qi) => (
            <div key={qi} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <div className="flex items-start gap-2 mb-3">
                <span className="flex-shrink-0 bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  S{qi + 1}
                </span>
                <p className="text-gray-900 text-sm font-medium leading-relaxed">{s.soru}</p>
              </div>
              <div className="grid grid-cols-1 gap-1.5 mb-3">
                {s.secenekler.map((opt, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                      i === s.dogruIndex
                        ? "bg-green-50 border border-green-200 text-green-800 font-semibold"
                        : "bg-gray-50 text-gray-600"
                    }`}
                  >
                    <span className={`font-bold ${i === s.dogruIndex ? "text-green-600" : "text-gray-400"}`}>
                      {String.fromCharCode(65 + i)})
                    </span>
                    {opt}
                    {i === s.dogruIndex && <span className="ml-auto text-green-500 text-xs">✓ Doğru</span>}
                  </div>
                ))}
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5 space-y-1">
                <p className="text-xs text-amber-700">
                  <span className="font-semibold">İpucu 1:</span> {s.ipucu1}
                </p>
                <p className="text-xs text-amber-600">
                  <span className="font-semibold">İpucu 2:</span> {s.ipucu2}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const RESULTS_REFRESH_MS = 30_000;

interface ResultsSync {
  status: "loading" | "ok" | "error";
  persistent: boolean;
  lastUpdated: number | null;
}

// ── CSV indirme ───────────────────────────────────────────────────────────────
function downloadCSV(leaderboard: LeaderboardEntry[], stops: Stop[], gameCode: string) {
  const stopHeaders = stops.map((s) => `${s.name} (yanlış)`);
  const headers = [
    "Sıra", "Takma Ad", "Başlangıç (tahmini)", "Tamamlama",
    "Net Süre", "Ceza", "Toplam", "Yanlış Sayısı", "İpucu",
    "Son Durak", "Sonuç Kodu",
    ...stopHeaders,
  ];

  const rows = leaderboard.map((e, i) => {
    const startTs = e.completedAt - e.netSeconds * 1000;
    const total = e.netSeconds + e.penaltySeconds;
    const wrongCount = Math.round(e.penaltySeconds / 15);
    const lastStopEntry = e.stopDetails
      ? Object.entries(e.stopDetails).sort((a, b) => b[1].completedAt - a[1].completedAt)[0]
      : null;
    const lastStop = lastStopEntry
      ? (stops.find((s) => s.id === lastStopEntry[0])?.name ?? lastStopEntry[0])
      : stops[stops.length - 1]?.name ?? "";
    const resultCode = buildResultCode(e.nickname, total);
    const stopCols = stops.map((s) => e.stopDetails?.[s.id]?.hintsUsed ?? "");

    return [
      i + 1,
      e.nickname,
      new Date(startTs).toLocaleString("tr-TR"),
      new Date(e.completedAt).toLocaleString("tr-TR"),
      formatElapsed(e.netSeconds),
      e.penaltySeconds > 0 ? `+${formatElapsed(e.penaltySeconds)}` : "0",
      formatElapsed(total),
      wrongCount,
      e.hintsUsed,
      lastStop,
      resultCode,
      ...stopCols,
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
  });

  const csv = [headers.map((h) => `"${h}"`).join(","), ...rows].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dersera-${gameCode}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Sınıf Sıralaması sekmesi ──────────────────────────────────────────────────
function SiralamaTabs({
  leaderboard,
  stops,
  gameCode,
  sync,
  onRefresh,
}: {
  leaderboard: LeaderboardEntry[];
  stops: Stop[];
  gameCode: string;
  sync: ResultsSync;
  onRefresh: () => void;
}) {
  const [selectedNick, setSelectedNick] = useState<string | null>(null);

  const selectedEntry = leaderboard.find((e) => e.nickname === selectedNick);

  if (selectedEntry) {
    const total = selectedEntry.netSeconds + selectedEntry.penaltySeconds;
    const startTs = selectedEntry.completedAt - selectedEntry.netSeconds * 1000;
    const wrongCount = Math.round(selectedEntry.penaltySeconds / 15);
    const resultCode = buildResultCode(selectedEntry.nickname, total);

    return (
      <div>
        <button
          onClick={() => setSelectedNick(null)}
          className="flex items-center gap-1.5 text-indigo-600 text-sm font-medium mb-5 hover:text-indigo-800"
        >
          ← Tüm liste
        </button>

        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
              {selectedEntry.nickname[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-lg">{selectedEntry.nickname}</p>
              <p className="text-indigo-500 text-xs">
                Sonuç Kodu: <span className="font-mono font-bold">{resultCode}</span>
              </p>
            </div>
          </div>

          {/* Süre kartları */}
          <div className="grid grid-cols-3 gap-2 text-center mb-3">
            <div className="bg-white rounded-xl p-2.5">
              <p className="text-xs text-gray-500 mb-0.5">Net</p>
              <p className="font-mono font-bold text-gray-900 text-sm">{formatElapsed(selectedEntry.netSeconds)}</p>
            </div>
            <div className="bg-white rounded-xl p-2.5">
              <p className="text-xs text-gray-500 mb-0.5">Ceza</p>
              <p className={`font-mono font-bold text-sm ${selectedEntry.penaltySeconds > 0 ? "text-red-500" : "text-gray-400"}`}>
                {selectedEntry.penaltySeconds > 0 ? `+${formatElapsed(selectedEntry.penaltySeconds)}` : "—"}
              </p>
            </div>
            <div className="bg-white rounded-xl p-2.5">
              <p className="text-xs text-gray-500 mb-0.5">Toplam</p>
              <p className="font-mono font-bold text-indigo-700 text-sm">{formatElapsed(total)}</p>
            </div>
          </div>

          {/* Meta bilgileri */}
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
            <div className="bg-white rounded-lg p-2">
              <span className="text-gray-400 block">Başlangıç (tahmini)</span>
              {new Date(startTs).toLocaleString("tr-TR")}
            </div>
            <div className="bg-white rounded-lg p-2">
              <span className="text-gray-400 block">Tamamlama</span>
              {new Date(selectedEntry.completedAt).toLocaleString("tr-TR")}
            </div>
            <div className="bg-white rounded-lg p-2">
              <span className="text-gray-400 block">Yanlış Cevap</span>
              {wrongCount} kez
            </div>
            <div className="bg-white rounded-lg p-2">
              <span className="text-gray-400 block">Kullanılan İpucu</span>
              {selectedEntry.hintsUsed}
            </div>
          </div>
        </div>

        {/* Durak bazlı detay */}
        <h3 className="font-semibold text-gray-700 text-sm mb-3">Durak Performansı</h3>
        <div className="space-y-2">
          {stops.map((s) => {
            const detail = selectedEntry.stopDetails?.[s.id];
            return (
              <div
                key={s.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                  detail ? "bg-white border-gray-100" : "bg-gray-50 border-gray-100 opacity-50"
                }`}
              >
                <span className="text-xl">{s.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{s.name}</p>
                  <p className="text-xs text-gray-400">{s.subject}</p>
                </div>
                {detail ? (
                  <div className="text-right">
                    <p className="text-xs font-semibold text-green-600">✅ Tamamlandı</p>
                    <p className="text-xs text-gray-400">{detail.hintsUsed} yanlış</p>
                    {detail.completedAt > 0 && (
                      <p className="text-xs text-gray-300">
                        {new Date(detail.completedAt).toLocaleTimeString("tr-TR")}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">—</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{leaderboard.length} öğrenci tamamladı</p>
        <div className="flex items-center gap-3">
          {leaderboard.length > 0 && (
            <button
              onClick={() => downloadCSV(leaderboard, stops, gameCode)}
              className="text-xs bg-green-600 hover:bg-green-700 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              ⬇ CSV İndir
            </button>
          )}
          <button
            onClick={onRefresh}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Yenile
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-3">
        {sync.lastUpdated
          ? `Son güncelleme ${new Date(sync.lastUpdated).toLocaleTimeString("tr-TR")} · 30 sn'de bir otomatik yenilenir`
          : "Sonuçlar yükleniyor…"}
      </p>
      {sync.status === "error" && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-3">
          Sunucuya ulaşılamadı. Son bilinen liste gösteriliyor; öğrencilerin sonuç kodlarıyla doğrulayabilirsin.
        </div>
      )}
      {sync.status === "ok" && !sync.persistent && (
        <div role="alert" className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2 mb-3">
          Kalıcı depolama bağlı değil: sonuçlar sunucu yeniden başlarsa kaybolabilir.
        </div>
      )}

      {leaderboard.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <div className="text-3xl mb-3">🏆</div>
          <p className="text-gray-400 text-sm">Henüz tamamlayan öğrenci yok.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 w-8">#</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Takma Ad</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500">Toplam</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500">Ceza</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500">Yanlış</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500">İpucu</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Sonuç Kodu</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((e, i) => {
                const total = e.netSeconds + e.penaltySeconds;
                const wrongCount = Math.round(e.penaltySeconds / 15);
                const resultCode = buildResultCode(e.nickname, total);
                return (
                  <tr
                    key={e.nickname + e.completedAt}
                    onClick={() => setSelectedNick(e.nickname)}
                    className={`border-b border-gray-50 cursor-pointer hover:bg-indigo-50 transition-colors ${
                      i === 0 ? "bg-yellow-50" : ""
                    }`}
                  >
                    <td className="px-3 py-3 text-gray-400 text-xs">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                    </td>
                    <td className="px-3 py-3 font-semibold text-gray-900">{e.nickname}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-indigo-700 text-xs">
                      {formatElapsed(total)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs text-red-400">
                      {e.penaltySeconds > 0 ? `+${formatElapsed(e.penaltySeconds)}` : "—"}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-500 text-xs">{wrongCount}</td>
                    <td className="px-3 py-3 text-right text-gray-500 text-xs">{e.hintsUsed}</td>
                    <td className="px-3 py-3 font-mono text-xs text-gray-500">{resultCode}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Ayarlar sekmesi ──────────────────────────────────────────────────────────
function Mesaj({ msg }: { msg: { type: "ok" | "err"; text: string } | null }) {
  if (!msg) return null;
  return (
    <div role={msg.type === "err" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${msg.type === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
      {msg.text}
    </div>
  );
}

function AyarlarTab({ hesap, onHesap, onLogout }: { hesap: HesapOzeti; onHesap: (h: HesapOzeti) => void; onLogout: () => void }) {
  const [yeniAd, setYeniAd] = useState("");
  const [adSifre, setAdSifre] = useState("");
  const [adMsg, setAdMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [bekliyor, setBekliyor] = useState(false);

  const [pilot, setPilot] = useState<PilotInfo>(() => loadPilotInfo());
  const [pilotMsg, setPilotMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function handleSavePilot(e: React.FormEvent) {
    e.preventDefault();
    savePilotInfo(pilot);
    setPilotMsg({ type: "ok", text: "Pilot bilgileri kaydedildi." });
    setTimeout(() => setPilotMsg(null), 3000);
  }

  async function handleAd(e: React.FormEvent) {
    e.preventDefault();
    setAdMsg(null);
    setBekliyor(true);
    const r = await kullaniciAdiDegistir(yeniAd, adSifre);
    setBekliyor(false);
    if ("error" in r) return setAdMsg({ type: "err", text: r.error });
    onHesap(r.hesap);
    setAdMsg({ type: "ok", text: `Kullanıcı adın artık "${r.hesap.kullaniciAdi}".` });
    setYeniAd("");
    setAdSifre("");
  }

  async function handleSifre(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (newPassword !== newPassword2) return setMsg({ type: "err", text: "Yeni şifreler eşleşmiyor." });
    setBekliyor(true);
    const r = await sifreDegistir(oldPassword, newPassword);
    setBekliyor(false);
    if ("error" in r) return setMsg({ type: "err", text: r.error });
    setMsg({ type: "ok", text: "Şifre değiştirildi. Diğer cihazlardaki oturumlar kapatıldı." });
    setOldPassword("");
    setNewPassword("");
    setNewPassword2("");
  }

  const girdi = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const etiket = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <div className="max-w-md space-y-8">
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
        <p className="text-xs text-indigo-600">Giriş yapılan hesap</p>
        <p className="font-bold text-indigo-900">{hesap.kullaniciAdi}</p>
      </div>

      {/* Pilot Bilgileri */}
      <div>
        <h3 className="font-semibold text-gray-700 mb-4">Pilot Bilgileri</h3>
        <form onSubmit={handleSavePilot} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Okul Adı</label>
            <input
              type="text"
              value={pilot.schoolName}
              onChange={(e) => setPilot({ ...pilot, schoolName: e.target.value })}
              placeholder="Örn. Atatürk Anadolu Lisesi"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sınıf</label>
            <input
              type="text"
              value={pilot.className}
              onChange={(e) => setPilot({ ...pilot, className: e.target.value })}
              placeholder="Örn. 10-A"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sorumlu Öğretmen</label>
            <input
              type="text"
              value={pilot.teacherName}
              onChange={(e) => setPilot({ ...pilot, teacherName: e.target.value })}
              placeholder="Örn. Ayşe Yılmaz"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Uygulama Tarihi</label>
            <input
              type="date"
              value={pilot.pilotDate}
              onChange={(e) => setPilot({ ...pilot, pilotDate: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {pilotMsg && (
            <div className={`rounded-lg px-3 py-2 text-sm ${pilotMsg.type === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {pilotMsg.text}
            </div>
          )}
          <button
            type="submit"
            className="w-full bg-indigo-600 text-white font-semibold py-2 rounded-lg text-sm hover:bg-indigo-700 transition-colors"
          >
            Kaydet
          </button>
        </form>
      </div>


      <div className="border-t border-gray-200 pt-6">
        <h3 className="font-semibold text-gray-700 mb-4">Kullanıcı Adını Değiştir</h3>
        <form onSubmit={handleAd} className="space-y-3">
          <div>
            <label htmlFor="yeni-ad" className={etiket}>Yeni Kullanıcı Adı</label>
            <input id="yeni-ad" type="text" value={yeniAd} onChange={(e) => setYeniAd(e.target.value)} autoComplete="username" className={girdi} />
          </div>
          <div>
            <label htmlFor="ad-sifre" className={etiket}>Şifre</label>
            <input id="ad-sifre" type="password" value={adSifre} onChange={(e) => setAdSifre(e.target.value)} autoComplete="current-password" className={girdi} />
          </div>
          <Mesaj msg={adMsg} />
          <button type="submit" disabled={bekliyor || !yeniAd.trim() || !adSifre} className="w-full bg-indigo-600 disabled:bg-indigo-300 text-white font-semibold py-2 rounded-lg text-sm hover:bg-indigo-700 transition-colors">
            Kullanıcı Adını Güncelle
          </button>
        </form>
      </div>

      <div className="border-t border-gray-200 pt-6">
        <h3 className="font-semibold text-gray-700 mb-4">Şifre Değiştir</h3>
        <form onSubmit={handleSifre} className="space-y-3">
          <div>
            <label htmlFor="mevcut-sifre" className={etiket}>Mevcut Şifre</label>
            <input id="mevcut-sifre" type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} autoComplete="current-password" className={girdi} />
          </div>
          <div>
            <label htmlFor="yeni-sifre" className={etiket}>Yeni Şifre</label>
            <input id="yeni-sifre" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" className={girdi} />
          </div>
          <div>
            <label htmlFor="yeni-sifre2" className={etiket}>Yeni Şifre (Tekrar)</label>
            <input id="yeni-sifre2" type="password" value={newPassword2} onChange={(e) => setNewPassword2(e.target.value)} autoComplete="new-password" className={girdi} />
          </div>
          <Mesaj msg={msg} />
          <button type="submit" disabled={bekliyor || !oldPassword || !newPassword || !newPassword2} className="w-full bg-indigo-600 disabled:bg-indigo-300 text-white font-semibold py-2 rounded-lg text-sm hover:bg-indigo-700 transition-colors">
            Şifreyi Güncelle
          </button>
        </form>
      </div>

      <div className="pt-6 border-t border-gray-200">
        <button
          onClick={async () => {
            await cikisYap();
            onLogout();
          }}
          className="w-full border border-red-200 text-red-600 font-semibold py-2 rounded-lg text-sm hover:bg-red-50 transition-colors"
        >
          Çıkış Yap
        </button>
      </div>
    </div>
  );
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────
export default function OgretmenClient({ baslangicSekmesi = "oyun" }: { baslangicSekmesi?: Tab } = {}) {
  const [hesap, setHesap] = useState<HesapOzeti | null>(null);
  const loggedIn = hesap !== null;
  const [davetGerekli, setDavetGerekli] = useState(false);
  const [kayitKapali, setKayitKapali] = useState(false);
  const [yonetici, setYonetici] = useState(false);
  const [baglantiHatasi, setBaglantiHatasi] = useState(false);
  const [bekleyenOyun, setBekleyenOyun] = useState(0);
  const [tasinanOyun, setTasinanOyun] = useState(0);
  const [tasimaMesaji, setTasimaMesaji] = useState("");
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>(baslangicSekmesi);
  const [selectedAylar, setSelectedAylar] = useState<string[]>(["eylul"]);
  const [teacherGame, setTeacherGame] = useState<TeacherGame | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [sync, setSync] = useState<ResultsSync>({ status: "loading", persistent: true, lastUpdated: null });

  useEffect(() => {
    eskiYerelGirisiTemizle();
    // Kayıtlı oyun tarayıcıdan ilk render'dan sonra okunur (sunucuda localStorage yok).
    const t = setTimeout(() => setTeacherGame(loadTeacherGame()));
    oturumBilgisi().then((o) => {
      if (o) {
        setHesap(o.hesap);
        setDavetGerekli(o.davetGerekli);
        setKayitKapali(o.kayitKapali);
        setYonetici(o.yonetici);
      } else setBaglantiHatasi(true);
      setReady(true);
    });
    return () => clearTimeout(t);
  }, []);

  // Hesap öncesinde bu tarayıcıda kaydedilmiş kütüphane varsa öğretmene sorulur (ortak bilgisayarda başkasına ait olabilir).
  const hesapAdi = hesap?.kullaniciAdi ?? null;
  useEffect(() => {
    if (!hesapAdi) return;
    let iptal = false;
    try {
      if (sessionStorage.getItem(ESKI_KUTUPHANE_RED) === "1") return;
    } catch {
      /* ignore */
    }
    eskiKutuphaneSayisi().then((n) => {
      if (!iptal) setBekleyenOyun(n);
    });
    return () => {
      iptal = true;
    };
  }, [hesapAdi]);

  async function eskiOyunlariTasi() {
    const r = await eskiKutuphaneyiTasi();
    if (!r) return setTasimaMesaji("Oyunlar taşınamadı. Tekrar deneyin.");
    setBekleyenOyun(r.kalan);
    setTasinanOyun((n) => n + r.tasinan);
    setTasimaMesaji(r.kalan ? `${r.tasinan} oyun taşındı; kütüphanen dolu olduğu için ${r.kalan} oyun bekliyor.` : `${r.tasinan} oyun hesabının kütüphanesine taşındı.`);
  }

  const latestRequest = useRef(0);
  const gameCode = teacherGame?.game.code ?? null;

  const refreshLeaderboard = useCallback(() => {
    const requestId = ++latestRequest.current;
    if (!gameCode) {
      setLeaderboard([]);
      return;
    }
    fetchResults(gameCode).then((data) => {
      if (requestId !== latestRequest.current) return;
      if (data) {
        setLeaderboard(data.results);
        setSync({ status: "ok", persistent: data.persistent, lastUpdated: Date.now() });
      } else {
        setSync((s) => ({ ...s, status: "error" }));
      }
    });
  }, [gameCode]);

  const handleTeacherGameChange = useCallback((tg: TeacherGame) => {
    saveTeacherGame(tg);
    setTeacherGame(tg);
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    const requests = latestRequest;
    const first = setTimeout(refreshLeaderboard, 0);
    const id = setInterval(refreshLeaderboard, RESULTS_REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      requests.current++;
    };
  }, [loggedIn, refreshLeaderboard]);

  function toggleAy(slug: string) {
    setSelectedAylar((prev) =>
      prev.includes(slug)
        ? prev.length > 1
          ? prev.filter((a) => a !== slug)
          : prev
        : [...prev, slug]
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="text-white/40 text-sm">Yükleniyor...</div>
      </div>
    );
  }

  if (baglantiHatasi) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center px-6 text-center">
        <div role="alert" className="text-white">
          <p className="font-semibold">Sunucuya ulaşılamadı.</p>
          <button onClick={() => window.location.reload()} className="mt-4 bg-white text-indigo-900 font-semibold px-4 py-2 rounded-lg text-sm">
            Tekrar dene
          </button>
        </div>
      </div>
    );
  }

  if (!hesap) {
    return (
      <LoginScreen
        onLogin={(h) => {
          setHesap(h);
          // Yönetici bilgisi giriş yanıtında yok; oturumdan okunur.
          oturumBilgisi().then((o) => setYonetici(!!o?.yonetici));
        }}
        davetGerekli={davetGerekli}
        kayitKapali={kayitKapali}
      />
    );
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "oyun", label: "Oyun", icon: "🎮" },
    { id: "kutuphane", label: "Kütüphane", icon: "📚" },
    { id: "takip", label: "Öğrenme", icon: "📈" },
    { id: "okul", label: "Okulum", icon: "🏫" },
    { id: "sorular", label: "Sorular", icon: "📝" },
    { id: "siralama", label: "Sınıf", icon: "🏆" },
    { id: "ayarlar", label: "Ayarlar", icon: "⚙️" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-indigo-900 text-white px-6 py-4 print:hidden">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DerseraLogo />
            <div className="border-l border-indigo-700 pl-3">
              <p className="text-xs font-semibold text-indigo-200 leading-tight">Öğretmen Paneli</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {yonetici && loggedIn && (
              <Link href="/moderasyon" className="text-sm font-semibold text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                🛡 Moderasyon
              </Link>
            )}
            <Link href="/library" className="text-sm font-semibold text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
              📚 Topluluk
            </Link>
            <Link href="/qr-kutuphane" className="text-sm font-semibold text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
              ▦ QR Kütüphanesi
            </Link>
            <Link href="/" className="hidden sm:inline text-indigo-300 hover:text-white text-sm transition-colors">
              ← Ana sayfa
            </Link>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 print:hidden">
        <div className="max-w-4xl mx-auto px-4 flex gap-0 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === t.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* İçerik */}
      <div className="max-w-4xl mx-auto px-4 py-6 print:px-0">
        {activeTab === "oyun" && (
          <OyunTab
            teacherGame={teacherGame}
            finishedCount={leaderboard.length}
            selectedAylar={selectedAylar}
            toggleAy={toggleAy}
            onTeacherGameChange={handleTeacherGameChange}
          />
        )}
        {activeTab === "kutuphane" && bekleyenOyun > 0 && (
          <div role="region" aria-label="Eski kütüphane" className="mb-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-sm">
            <p>
              Bu tarayıcıda hesaba bağlı olmayan <strong>{bekleyenOyun} oyun</strong> var (hesaplardan önce kaydedilmiş). Bu oyunlar sana aitse
              hesabının kütüphanesine taşıyabilirsin. Ortak bir bilgisayardaysan ve oyunlar başkasınınsa taşıma.
            </p>
            <div className="flex gap-2 mt-2">
              <button onClick={eskiOyunlariTasi} className="bg-amber-600 text-white font-semibold px-3 py-1.5 rounded-lg">
                Hesabıma taşı
              </button>
              <button
                onClick={() => {
                  try {
                    sessionStorage.setItem(ESKI_KUTUPHANE_RED, "1");
                  } catch {
                    /* ignore */
                  }
                  setBekleyenOyun(0);
                }}
                className="border border-amber-300 font-semibold px-3 py-1.5 rounded-lg">
                Benim değil, dokunma
              </button>
            </div>
          </div>
        )}
        {activeTab === "kutuphane" && tasimaMesaji && (
          <p role="status" className="mb-4 bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-2 text-sm">
            {tasimaMesaji}
          </p>
        )}
        {activeTab === "kutuphane" && (
          <KutuphaneTab
            key={tasinanOyun}
            onYayinlandi={(tg) => {
              handleTeacherGameChange(tg);
              setActiveTab("oyun");
            }}
          />
        )}
        {activeTab === "takip" && <OgrenmeTakibiTab />}
        {activeTab === "okul" && <OkulTab />}
        {activeTab === "sorular" && <SorularTab selectedAylar={selectedAylar} toggleAy={toggleAy} />}
        {activeTab === "siralama" &&
          (teacherGame ? (
            <>
              {teacherGame.game.definition && <OgrenmeRaporuKarti definition={teacherGame.game.definition} leaderboard={leaderboard} gameCode={teacherGame.game.code} />}
              <SiralamaTabs
                leaderboard={leaderboard}
                stops={teacherGame.game.definition ? definitionPanelStops(teacherGame.game.definition) : toStops(teacherGame.game.stops)}
                gameCode={teacherGame.game.code}
                sync={sync}
                onRefresh={refreshLeaderboard}
              />
            </>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-500">
              Önce <strong>Oyun</strong> sekmesinden bir oyun yayınla; sonuçlar burada görünür.
            </div>
          ))}
        {activeTab === "ayarlar" && (
          <AyarlarTab hesap={hesap} onHesap={setHesap} onLogout={() => setHesap(null)} />
        )}
      </div>
    </div>
  );
}

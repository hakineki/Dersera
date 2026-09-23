"use client";

import { useState, useEffect } from "react";
import { stops } from "@/data/stops";
import { AYLAR, DERS_ADI, CORE_DERSLER, getSorular, sinif10 } from "@/data/mufredat";
import type { Ders } from "@/data/mufredat";
import { QRCodeSVG } from "qrcode.react";
import {
  loadCustomStops,
  addCustomStop,
  loadLeaderboard,
  formatElapsed,
  type CustomStop,
  type LeaderboardEntry,
} from "@/lib/gameState";
import {
  verifyTeacher,
  loadTeacherSession,
  setTeacherSession,
  saveTeacherCreds,
} from "@/lib/teacherAuth";

type Tab = "qr" | "sorular" | "siralama" | "ayarlar";

const ALL_DERSLER = Object.keys(DERS_ADI) as Ders[];

interface NewStopForm {
  name: string;
  emoji: string;
  dersKey: string;
  konuAdi: string;
}

// ── Giriş ekranı ──────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setTimeout(() => {
      if (verifyTeacher(username, password)) {
        setTeacherSession(true);
        onLogin();
      } else {
        setError("Kullanıcı adı veya şifre hatalı.");
      }
      setLoading(false);
    }, 300);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">👩‍🏫</div>
          <h1 className="text-xl font-bold text-white">Öğretmen Girişi</h1>
          <p className="text-purple-300 text-sm mt-1">Panele erişmek için giriş yapın</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-purple-200 mb-1.5">Kullanıcı Adı</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="w-full bg-white/10 border border-white/20 text-white placeholder-white/30 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="ogretmen"
            />
          </div>

          <div>
            <label className="block text-sm text-purple-200 mb-1.5">Şifre</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full bg-white/10 border border-white/20 text-white placeholder-white/30 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-400/40 rounded-lg px-4 py-2">
              <p className="text-red-200 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username.trim() || !password}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:text-white/40 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
          >
            {loading ? "Kontrol ediliyor..." : "Giriş Yap"}
          </button>
        </form>

        <a href="/" className="block text-center text-purple-400 text-sm mt-6 hover:text-purple-200 transition-colors">
          ← Ana sayfaya dön
        </a>
      </div>
    </div>
  );
}

// ── QR Kodlar sekmesi ─────────────────────────────────────────────────────────
function QrTab({
  selectedAylar,
  toggleAy,
  customStops,
  setCustomStops,
}: {
  selectedAylar: string[];
  toggleAy: (slug: string) => void;
  customStops: CustomStop[];
  setCustomStops: React.Dispatch<React.SetStateAction<CustomStop[]>>;
}) {
  const [baseUrl, setBaseUrl] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [newStop, setNewStop] = useState<NewStopForm>({
    name: "",
    emoji: "📍",
    dersKey: "matematik",
    konuAdi: "",
  });

  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);

  const aylarParam = selectedAylar.join(",");
  const allStops = [...stops, ...customStops];
  const firstAyIndex = AYLAR.findIndex((a) => a.ay === selectedAylar[0]);
  const seciliAyPlan = sinif10[firstAyIndex];

  function handleAddDurak() {
    if (!newStop.name.trim()) return;
    const maxOrder = Math.max(...allStops.map((s) => s.order), 0);
    const id = `custom-${Date.now()}`;
    const cs: CustomStop = {
      id,
      order: maxOrder + 1,
      name: newStop.name.trim(),
      emoji: newStop.emoji || "📍",
      subject: DERS_ADI[newStop.dersKey as Ders] ?? newStop.dersKey,
      dersKey: newStop.dersKey,
      nextStopId: null,
      nextClue: `✅ ${newStop.name.trim()} durağını tamamladın!`,
    };
    addCustomStop(cs);
    setCustomStops((prev) => [...prev, cs]);
    setShowModal(false);
    setNewStop({ name: "", emoji: "📍", dersKey: "matematik", konuAdi: "" });
  }

  return (
    <>
      {/* Ay seçici */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">
          📅 Dönem Seç — seçilen ayların sorularından havuz oluşturulur
        </p>
        <div className="flex flex-wrap gap-2">
          {AYLAR.map((a) => (
            <button
              key={a.ay}
              onClick={() => toggleAy(a.ay)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedAylar.includes(a.ay)
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {a.ad}
            </button>
          ))}
        </div>
        {seciliAyPlan && (
          <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CORE_DERSLER.map((ders) => (
              <div key={ders} className="text-xs text-gray-500">
                <span className="font-semibold text-gray-700">{DERS_ADI[ders]}:</span>{" "}
                {seciliAyPlan.dersler[ders]?.ad ?? "—"}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Talimatlar */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-sm text-blue-800">
        <p className="font-semibold mb-1">📋 Kurulum Talimatları</p>
        <ol className="list-decimal list-inside space-y-1 text-blue-700">
          <li>Dönem seçin, ardından QR kodlarını yazdırın.</li>
          <li>Her QR kodu keserek ilgili okul mekânına yapıştırın.</li>
          <li>Oyun <strong>Bahçe</strong> durağından başlar — sadece ilk durağın yerini söyleyin.</li>
          <li>5 durağı tamamlayan öğrenci geri döner ve sonuç kodunu gösterir.</li>
        </ol>
      </div>

      {/* QR Kartları */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-4">
        {allStops.map((stop) => {
          const url = baseUrl
            ? `${baseUrl}/game/${stop.id}?aylar=${aylarParam}`
            : `/game/${stop.id}?aylar=${aylarParam}`;
          const konuAdi = seciliAyPlan?.dersler[stop.dersKey as Ders]?.ad ?? "—";
          const isCustom = !stops.find((s) => s.id === stop.id);

          return (
            <div key={stop.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{stop.emoji}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-indigo-600 uppercase tracking-wide">
                      Durak {stop.order}
                    </span>
                    {isCustom && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                        Özel
                      </span>
                    )}
                  </div>
                  <h2 className="font-bold text-gray-900">{stop.name}</h2>
                  <p className="text-xs text-gray-500">{stop.subject}</p>
                </div>
              </div>
              <div className="flex justify-center mb-3">
                {baseUrl ? (
                  <div className="p-2 bg-white border-2 border-gray-200 rounded-xl">
                    <QRCodeSVG value={url} size={140} bgColor="#ffffff" fgColor="#1e1b4b" level="M" />
                  </div>
                ) : (
                  <div className="w-[156px] h-[156px] bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 text-xs">
                    Yükleniyor...
                  </div>
                )}
              </div>
              <p className="text-center text-xs text-gray-400 font-mono break-all mb-2">{url}</p>
              <div className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-xs font-semibold text-gray-500 mb-0.5">
                  {AYLAR.find((a) => a.ay === selectedAylar[0])?.ad} konusu:
                </p>
                <p className="text-xs text-gray-700">{konuAdi}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-3 mb-6">
        <button
          onClick={() => setShowModal(true)}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
        >
          ➕ Durak Ekle
        </button>
        <button
          onClick={() => window.print()}
          className="flex-1 border border-gray-300 text-gray-700 font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors"
        >
          🖨️ Yazdır
        </button>
      </div>

      {/* Durak Ekle Modalı */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold text-gray-900 mb-5">➕ Yeni Durak Ekle</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Durak Adı</label>
                <input
                  type="text"
                  value={newStop.name}
                  onChange={(e) => setNewStop((s) => ({ ...s, name: e.target.value }))}
                  placeholder="ör. Spor Salonu"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Emoji</label>
                <input
                  type="text"
                  value={newStop.emoji}
                  onChange={(e) => setNewStop((s) => ({ ...s, emoji: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ders</label>
                <select
                  value={newStop.dersKey}
                  onChange={(e) => setNewStop((s) => ({ ...s, dersKey: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {ALL_DERSLER.map((d) => (
                    <option key={d} value={d}>{DERS_ADI[d]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alt Konu</label>
                <input
                  type="text"
                  value={newStop.konuAdi}
                  onChange={(e) => setNewStop((s) => ({ ...s, konuAdi: e.target.value }))}
                  placeholder="ör. Hücre Biyolojisi"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2 rounded-lg text-sm hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleAddDurak}
                disabled={!newStop.name.trim()}
                className="flex-1 bg-indigo-600 disabled:bg-indigo-300 text-white font-semibold py-2 rounded-lg text-sm hover:bg-indigo-700"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Soru Bankası sekmesi ──────────────────────────────────────────────────────
function SorularTab({ selectedAylar }: { selectedAylar: string[] }) {
  const [selectedStopId, setSelectedStopId] = useState(stops[0]?.id ?? "");
  const stop = stops.find((s) => s.id === selectedStopId);
  const sorular = stop ? getSorular(stop.dersKey, selectedAylar) : [];

  return (
    <div>
      {/* Durak seçici */}
      <div className="flex flex-wrap gap-2 mb-5">
        {stops.map((s) => (
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

// ── Sınıf Sıralaması sekmesi ──────────────────────────────────────────────────
function SiralamaTabs({ leaderboard, onRefresh }: { leaderboard: LeaderboardEntry[]; onRefresh: () => void }) {
  const [selectedNick, setSelectedNick] = useState<string | null>(null);

  const selectedEntry = leaderboard.find((e) => e.nickname === selectedNick);

  if (selectedEntry) {
    const total = selectedEntry.netSeconds + selectedEntry.penaltySeconds;
    return (
      <div>
        <button
          onClick={() => setSelectedNick(null)}
          className="flex items-center gap-1.5 text-indigo-600 text-sm font-medium mb-5 hover:text-indigo-800"
        >
          ← Tüm liste
        </button>

        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 mb-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
              {selectedEntry.nickname[0]?.toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-gray-900 text-lg">{selectedEntry.nickname}</p>
              <p className="text-indigo-500 text-xs">
                {new Date(selectedEntry.completedAt).toLocaleString("tr-TR")}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-white rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">Net Süre</p>
              <p className="font-mono font-bold text-gray-900">{formatElapsed(selectedEntry.netSeconds)}</p>
            </div>
            <div className="bg-white rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">Ceza</p>
              <p className={`font-mono font-bold ${selectedEntry.penaltySeconds > 0 ? "text-red-500" : "text-gray-400"}`}>
                {selectedEntry.penaltySeconds > 0 ? `+${formatElapsed(selectedEntry.penaltySeconds)}` : "—"}
              </p>
            </div>
            <div className="bg-white rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">Toplam</p>
              <p className="font-mono font-bold text-indigo-700">{formatElapsed(total)}</p>
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
        <button
          onClick={onRefresh}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
        >
          Yenile
        </button>
      </div>

      {leaderboard.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <div className="text-3xl mb-3">🏆</div>
          <p className="text-gray-400 text-sm">Henüz tamamlayan öğrenci yok.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 w-8">#</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Takma Ad</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500">Net</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500">Ceza</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500">Toplam</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500">✗</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((e, i) => (
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
                  <td className="px-3 py-3 text-right font-mono text-gray-600 text-xs">
                    {formatElapsed(e.netSeconds)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-xs text-red-400">
                    {e.penaltySeconds > 0 ? `+${formatElapsed(e.penaltySeconds)}` : "—"}
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-indigo-700 text-xs">
                    {formatElapsed(e.netSeconds + e.penaltySeconds)}
                  </td>
                  <td className="px-3 py-3 text-right text-gray-500 text-xs">{e.hintsUsed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Ayarlar sekmesi ──────────────────────────────────────────────────────────
function AyarlarTab({ onLogout }: { onLogout: () => void }) {
  const [username, setUsername] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!verifyTeacher(username, oldPassword)) {
      setMsg({ type: "err", text: "Mevcut bilgiler hatalı." });
      return;
    }
    if (newPassword.length < 6) {
      setMsg({ type: "err", text: "Yeni şifre en az 6 karakter olmalı." });
      return;
    }
    if (newPassword !== newPassword2) {
      setMsg({ type: "err", text: "Yeni şifreler eşleşmiyor." });
      return;
    }
    saveTeacherCreds(username, newPassword);
    setMsg({ type: "ok", text: "Kimlik bilgileri güncellendi." });
    setOldPassword(""); setNewPassword(""); setNewPassword2("");
  }

  return (
    <div className="max-w-md">
      <h3 className="font-semibold text-gray-700 mb-4">Giriş Bilgilerini Değiştir</h3>

      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Kullanıcı Adı</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ogretmen"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Mevcut Şifre</label>
          <input
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Yeni Şifre</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Yeni Şifre (Tekrar)</label>
          <input
            type="password"
            value={newPassword2}
            onChange={(e) => setNewPassword2(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {msg && (
          <div className={`rounded-lg px-3 py-2 text-sm ${msg.type === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {msg.text}
          </div>
        )}

        <button
          type="submit"
          disabled={!username.trim() || !oldPassword || !newPassword || !newPassword2}
          className="w-full bg-indigo-600 disabled:bg-indigo-300 text-white font-semibold py-2 rounded-lg text-sm hover:bg-indigo-700 transition-colors"
        >
          Güncelle
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-gray-200">
        <button
          onClick={() => { setTeacherSession(false); onLogout(); }}
          className="w-full border border-red-200 text-red-600 font-semibold py-2 rounded-lg text-sm hover:bg-red-50 transition-colors"
        >
          Çıkış Yap
        </button>
      </div>
    </div>
  );
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────
export default function OgretmenClient() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("qr");
  const [selectedAylar, setSelectedAylar] = useState<string[]>(["eylul"]);
  const [customStops, setCustomStops] = useState<CustomStop[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    setLoggedIn(loadTeacherSession());
    setCustomStops(loadCustomStops());
    setLeaderboard(loadLeaderboard());
    setReady(true);
  }, []);

  function toggleAy(slug: string) {
    setSelectedAylar((prev) =>
      prev.includes(slug)
        ? prev.length > 1
          ? prev.filter((a) => a !== slug)
          : prev
        : [...prev, slug]
    );
  }

  function refreshLeaderboard() {
    setLeaderboard(loadLeaderboard());
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="text-white/40 text-sm">Yükleniyor...</div>
      </div>
    );
  }

  if (!loggedIn) {
    return <LoginScreen onLogin={() => setLoggedIn(true)} />;
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "qr", label: "QR Kodlar", icon: "📱" },
    { id: "sorular", label: "Sorular", icon: "📝" },
    { id: "siralama", label: "Sınıf", icon: "🏆" },
    { id: "ayarlar", label: "Ayarlar", icon: "⚙️" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-indigo-900 text-white px-6 py-4 print:hidden">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">🗺️ Okulun Şifresi</h1>
            <p className="text-indigo-300 text-xs mt-0.5">Öğretmen Paneli</p>
          </div>
          <a href="/" className="text-indigo-300 hover:text-white text-sm transition-colors">
            ← Ana sayfa
          </a>
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
        {activeTab === "qr" && (
          <QrTab
            selectedAylar={selectedAylar}
            toggleAy={toggleAy}
            customStops={customStops}
            setCustomStops={setCustomStops}
          />
        )}
        {activeTab === "sorular" && <SorularTab selectedAylar={selectedAylar} />}
        {activeTab === "siralama" && (
          <SiralamaTabs leaderboard={leaderboard} onRefresh={refreshLeaderboard} />
        )}
        {activeTab === "ayarlar" && (
          <AyarlarTab onLogout={() => setLoggedIn(false)} />
        )}
      </div>
    </div>
  );
}

"use client";

import { stops } from "@/data/stops";
import { AYLAR, DERS_ADI, CORE_DERSLER, sinif10 } from "@/data/mufredat";
import type { Ders } from "@/data/mufredat";
import { QRCodeSVG } from "qrcode.react";
import { useState, useEffect } from "react";
import {
  loadCustomStops,
  addCustomStop,
  loadLeaderboard,
  formatElapsed,
  type CustomStop,
  type LeaderboardEntry,
} from "@/lib/gameState";

const ALL_DERSLER = Object.keys(DERS_ADI) as Ders[];

interface NewStopForm {
  name: string;
  emoji: string;
  dersKey: string;
  konuAdi: string;
}

export default function AdminPage() {
  const [baseUrl, setBaseUrl] = useState("");
  const [selectedAylar, setSelectedAylar] = useState<string[]>(["eylul"]);
  const [customStops, setCustomStops] = useState<CustomStop[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newStop, setNewStop] = useState<NewStopForm>({
    name: "",
    emoji: "📍",
    dersKey: "matematik",
    konuAdi: "",
  });

  useEffect(() => {
    setBaseUrl(window.location.origin);
    setCustomStops(loadCustomStops());
    setLeaderboard(loadLeaderboard());
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

  const aylarParam = selectedAylar.join(",");
  const allStops = [...stops, ...customStops];

  const firstAyIndex = AYLAR.findIndex((a) => a.ay === selectedAylar[0]);
  const seciliAyPlan = sinif10[firstAyIndex];

  function handlePrint() {
    window.print();
  }

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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-indigo-900 text-white px-6 py-5 print:hidden">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">🗺️ Okulun Şifresi</h1>
            <p className="text-indigo-300 text-sm mt-0.5">
              Öğretmen Paneli — QR Kod Yönetimi
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowModal(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
            >
              ➕ Durak Ekle
            </button>
            <button
              onClick={handlePrint}
              className="bg-white text-indigo-900 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-indigo-50 transition-colors"
            >
              🖨️ Yazdır
            </button>
          </div>
        </div>
      </div>

      {/* Çoklu ay seçici */}
      <div className="max-w-4xl mx-auto px-6 pt-6 print:hidden">
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">
            📅 Dönem Seç — seçilen ayların sorularından havuz oluşturulur (birden fazla seçilebilir)
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
          {selectedAylar.length > 0 && seciliAyPlan && (
            <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CORE_DERSLER.map((ders) => (
                <div key={ders} className="text-xs text-gray-500">
                  <span className="font-semibold text-gray-700">
                    {DERS_ADI[ders]}:
                  </span>{" "}
                  {seciliAyPlan.dersler[ders]?.ad ?? "—"}
                </div>
              ))}
            </div>
          )}
          {selectedAylar.length > 1 && (
            <p className="mt-2 text-xs text-indigo-600">
              Seçili: {selectedAylar.map((s) => AYLAR.find((a) => a.ay === s)?.ad).join(", ")}
            </p>
          )}
        </div>
      </div>

      {/* Talimatlar */}
      <div className="max-w-4xl mx-auto px-6 pb-4 print:hidden">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
          <p className="font-semibold mb-1">📋 Kurulum Talimatları</p>
          <ol className="list-decimal list-inside space-y-1 text-blue-700">
            <li>Dönem seçin, ardından QR kodlarını yazdırın.</li>
            <li>Her QR kodu keserek ilgili okul mekânına yapıştırın.</li>
            <li>
              Oyun <strong>Bahçe</strong> durağından başlar — öğrencilere sadece
              ilk durağın yerini söyleyin.
            </li>
            <li>5 durağı tamamlayan öğrenci öğretmene geri döner.</li>
          </ol>
        </div>
      </div>

      {/* QR Kartları */}
      <div className="max-w-4xl mx-auto px-6 pb-10 grid grid-cols-1 sm:grid-cols-2 gap-6 print:grid-cols-2 print:px-0">
        {allStops.map((stop) => {
          const url = baseUrl
            ? `${baseUrl}/game/${stop.id}?aylar=${aylarParam}`
            : `/game/${stop.id}?aylar=${aylarParam}`;
          const konuAdi =
            seciliAyPlan?.dersler[stop.dersKey as Ders]?.ad ?? "—";
          const isCustom = !stops.find((s) => s.id === stop.id);
          return (
            <div
              key={stop.id}
              className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 print:shadow-none print:border print:rounded-lg"
              style={{ breakInside: "avoid" }}
            >
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">{stop.emoji}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-600 uppercase tracking-wide">
                      Durak {stop.order}
                    </span>
                    {isCustom && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                        Özel
                      </span>
                    )}
                    <span className="text-xs text-gray-400">•</span>
                    <span className="text-xs text-gray-500">{stop.subject}</span>
                  </div>
                  <h2 className="font-bold text-gray-900 text-lg">{stop.name}</h2>
                </div>
              </div>

              <div className="flex justify-center mb-4">
                {baseUrl ? (
                  <div className="p-3 bg-white border-2 border-gray-200 rounded-xl">
                    <QRCodeSVG
                      value={url}
                      size={160}
                      bgColor="#ffffff"
                      fgColor="#1e1b4b"
                      level="M"
                    />
                  </div>
                ) : (
                  <div className="w-[184px] h-[184px] bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 text-xs">
                    Yükleniyor...
                  </div>
                )}
              </div>

              <p className="text-center text-xs text-gray-400 font-mono break-all mb-3">
                {url}
              </p>

              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 mb-1">
                  {AYLAR.find((a) => a.ay === selectedAylar[0])?.ad} konusu:
                </p>
                <p className="text-xs text-gray-700">{konuAdi}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sınıf Sıralaması */}
      <div className="max-w-4xl mx-auto px-6 pb-10 print:hidden">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-indigo-50 border-b border-gray-200">
            <h2 className="font-bold text-gray-900 text-sm">🏆 Sınıf Sıralaması</h2>
            <button
              onClick={() => setLeaderboard(loadLeaderboard())}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              Yenile
            </button>
          </div>
          {leaderboard.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              Henüz tamamlayan öğrenci yok
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 w-8">#</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500">Takma Ad</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">Net</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">Ceza</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">Toplam</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">İpucu</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((e, i) => (
                  <tr
                    key={e.nickname + e.completedAt}
                    className={`border-b border-gray-50 ${i === 0 ? "bg-yellow-50" : ""}`}
                  >
                    <td className="px-4 py-2 text-gray-400 font-mono text-xs">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                    </td>
                    <td className="px-4 py-2 font-semibold text-gray-900">{e.nickname}</td>
                    <td className="px-4 py-2 text-right font-mono text-gray-700">
                      {formatElapsed(e.netSeconds)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-red-500">
                      {e.penaltySeconds > 0 ? `+${formatElapsed(e.penaltySeconds)}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-bold text-indigo-700">
                      {formatElapsed(e.netSeconds + e.penaltySeconds)}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500">{e.hintsUsed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Durak Ekle Modalı */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold text-gray-900 mb-5">
              ➕ Yeni Durak Ekle
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Durak Adı (Konum)
                </label>
                <input
                  type="text"
                  value={newStop.name}
                  onChange={(e) =>
                    setNewStop((s) => ({ ...s, name: e.target.value }))
                  }
                  placeholder="ör. Spor Salonu"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Emoji
                </label>
                <input
                  type="text"
                  value={newStop.emoji}
                  onChange={(e) =>
                    setNewStop((s) => ({ ...s, emoji: e.target.value }))
                  }
                  placeholder="📍"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ders
                </label>
                <select
                  value={newStop.dersKey}
                  onChange={(e) =>
                    setNewStop((s) => ({ ...s, dersKey: e.target.value }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {ALL_DERSLER.map((d) => (
                    <option key={d} value={d}>
                      {DERS_ADI[d]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Alt Konu
                </label>
                <input
                  type="text"
                  value={newStop.konuAdi}
                  onChange={(e) =>
                    setNewStop((s) => ({ ...s, konuAdi: e.target.value }))
                  }
                  placeholder="ör. Hücre Biyolojisi"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleAddDurak}
                disabled={!newStop.name.trim()}
                className="flex-1 bg-indigo-600 disabled:bg-indigo-300 text-white font-semibold py-2 rounded-lg text-sm hover:bg-indigo-700 transition-colors"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

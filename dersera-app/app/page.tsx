"use client";

import { stops } from "@/data/stops";
import { AYLAR, DERS_ADI, sinif10 } from "@/data/mufredat";
import { QRCodeSVG } from "qrcode.react";
import { useState, useEffect } from "react";

export default function AdminPage() {
  const [baseUrl, setBaseUrl] = useState("");
  const [selectedAy, setSelectedAy] = useState<string>("eylul");

  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);

  const ayIndex = AYLAR.findIndex((a) => a.ay === selectedAy);
  const seciliAyPlan = sinif10[ayIndex];

  function handlePrint() {
    window.print();
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
          <button
            onClick={handlePrint}
            className="bg-white text-indigo-900 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-indigo-50 transition-colors"
          >
            🖨️ Yazdır
          </button>
        </div>
      </div>

      {/* Ay seçici */}
      <div className="max-w-4xl mx-auto px-6 pt-6 print:hidden">
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">
            📅 Dönem Seç — sorular seçilen aya kadar birikimli konulardan gelir
          </p>
          <div className="flex flex-wrap gap-2">
            {AYLAR.map((a) => (
              <button
                key={a.ay}
                onClick={() => setSelectedAy(a.ay)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedAy === a.ay
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
              {(["matematik", "fizik", "kimya", "edebiyat"] as const).map(
                (ders) => (
                  <div key={ders} className="text-xs text-gray-500">
                    <span className="font-semibold text-gray-700">
                      {DERS_ADI[ders]}:
                    </span>{" "}
                    {seciliAyPlan.dersler[ders].ad}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* Talimatlar */}
      <div className="max-w-4xl mx-auto px-6 pb-4 print:hidden">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
          <p className="font-semibold mb-1">📋 Kurulum Talimatları</p>
          <ol className="list-decimal list-inside space-y-1 text-blue-700">
            <li>Dönem seçin, ardından QR kodlarını yazdırın.</li>
            <li>
              Her QR kodu keserek ilgili okul mekânına yapıştırın.
            </li>
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
        {stops.map((stop) => {
          const url = baseUrl
            ? `${baseUrl}/game/${stop.id}?ay=${selectedAy}`
            : `/game/${stop.id}?ay=${selectedAy}`;
          const konuAdi =
            seciliAyPlan?.dersler[stop.dersKey]?.ad ?? "—";
          return (
            <div
              key={stop.id}
              className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 print:shadow-none print:border print:rounded-lg"
              style={{ breakInside: "avoid" }}
            >
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">{stop.emoji}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-600 uppercase tracking-wide">
                      Durak {stop.order}
                    </span>
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
                  {AYLAR[ayIndex]?.ad} konusu:
                </p>
                <p className="text-xs text-gray-700">{konuAdi}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

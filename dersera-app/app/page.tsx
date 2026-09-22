"use client";

import { stops } from "@/data/stops";
import { QRCodeSVG } from "qrcode.react";
import { useState, useEffect } from "react";

export default function AdminPage() {
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-indigo-900 text-white px-6 py-5 print:hidden">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">🗺️ Dersera Macera Oyunu</h1>
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

      {/* Instructions */}
      <div className="max-w-4xl mx-auto px-6 py-6 print:hidden">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
          <p className="font-semibold mb-1">📋 Kurulum Talimatları</p>
          <ol className="list-decimal list-inside space-y-1 text-blue-700">
            <li>Her QR kodu keserek ilgili okul mekânına yapıştırın.</li>
            <li>
              Oyun <strong>Bahçe</strong> durağından başlar — öğrencilere sadece
              ilk durağın yerini söyleyin.
            </li>
            <li>
              Doğru cevap sonraki durağın ipucunu verir; öğrenciler oraya
              yürüyüp QR kodu tarar.
            </li>
            <li>5 durağı tamamlayan öğrenci öğretmene geri döner.</li>
          </ol>
        </div>
      </div>

      {/* QR Cards */}
      <div className="max-w-4xl mx-auto px-6 pb-10 grid grid-cols-1 sm:grid-cols-2 gap-6 print:grid-cols-2 print:px-0">
        {stops.map((stop) => {
          const url = baseUrl ? `${baseUrl}/game/${stop.id}` : `/game/${stop.id}`;
          return (
            <div
              key={stop.id}
              className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 print:shadow-none print:border print:rounded-lg"
              style={{ breakInside: "avoid" }}
            >
              {/* Stop header */}
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

              {/* QR Code */}
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

              {/* URL */}
              <p className="text-center text-xs text-gray-400 font-mono break-all mb-3">
                {url}
              </p>

              {/* Question preview */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 mb-1">
                  Soru Önizleme:
                </p>
                <p className="text-xs text-gray-700 line-clamp-2">
                  {stop.question}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

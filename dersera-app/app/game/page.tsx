import { Suspense } from "react";
import GameWrapper from "./GameWrapper";
import OfflineSupport from "./OfflineSupport";

export const metadata = {
  title: "Okulun Şifresi — Dersera",
  description: "QR kodu tara, soruyu çöz, bir sonraki durağa geç!",
};

// Sayfa QR numarasından bağımsız statik bir kabuktur; numara tarayıcıda okunur.
// Böylece çevrimdışıyken önbellekteki tek kopya her QR için açılabilir.
export default function GamePage() {
  return (
    <>
      <OfflineSupport />
      <Suspense
        fallback={
          <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
            <div className="text-white/40 text-sm">Yükleniyor...</div>
          </div>
        }
      >
        <GameWrapper />
      </Suspense>
    </>
  );
}

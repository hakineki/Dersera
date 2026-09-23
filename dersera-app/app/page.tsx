"use client";

import { useRouter } from "next/navigation";
import DerseraLogo from "@/components/DerseraLogo";

export default function RoleSelector() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <DerseraLogo />
          </div>
          <h1 className="text-xl font-bold text-white mt-3">Okulun Şifresi</h1>
          <p className="text-purple-300 text-sm mt-1">Rolünüzü seçin</p>
        </div>

        <div className="space-y-4">
          <button
            onClick={() => router.push("/ogrenci")}
            className="w-full flex items-center gap-4 bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40 rounded-2xl px-6 py-5 transition-all group"
          >
            <span className="text-4xl">🎒</span>
            <div className="text-left">
              <p className="text-white font-bold text-lg">Öğrenci</p>
              <p className="text-purple-300 text-sm">QR kodu tarayarak oyuna gir</p>
            </div>
            <span className="ml-auto text-purple-400 group-hover:text-white transition-colors">→</span>
          </button>

          <button
            onClick={() => router.push("/ogretmen")}
            className="w-full flex items-center gap-4 bg-indigo-600/50 hover:bg-indigo-600/70 border border-indigo-400/40 hover:border-indigo-400/70 rounded-2xl px-6 py-5 transition-all group"
          >
            <span className="text-4xl">👩‍🏫</span>
            <div className="text-left">
              <p className="text-white font-bold text-lg">Öğretmen</p>
              <p className="text-indigo-300 text-sm">Panele giriş yap, QR kodları yönet</p>
            </div>
            <span className="ml-auto text-indigo-400 group-hover:text-white transition-colors">→</span>
          </button>
        </div>

        <p className="text-center text-purple-400/50 text-xs mt-8">
          Okulun Şifresi v3
        </p>
      </div>
    </div>
  );
}

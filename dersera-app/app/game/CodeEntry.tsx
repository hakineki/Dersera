"use client";

import { useState } from "react";
import DerseraLogo from "@/components/DerseraLogo";
import { normalizeGameCode, type PublicGame } from "@/lib/games";
import { fetchGame } from "@/lib/gamesClient";

export default function CodeEntry({
  onValid,
  notice,
}: {
  onValid: (game: PublicGame) => void;
  notice?: string;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = normalizeGameCode(value);
    if (!code) {
      setError("Geçersiz kod. Örnek biçim: MRS-482");
      return;
    }
    setError("");
    setLoading(true);
    const r = await fetchGame(code);
    setLoading(false);
    if (r.status === "not-found") setError("Geçersiz kod");
    else if (r.status === "error") setError("Sunucuya ulaşılamadı. Bağlantını kontrol et.");
    else if (!r.active) setError("Bu oyun sona erdi. Öğretmeninden yeni kodu iste.");
    else onValid(r.game);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center mb-6">
          <DerseraLogo />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Oyun Kodunu Gir</h1>
        <p className="text-purple-300 text-sm mb-6">Öğretmeninin tahtaya yazdığı kodu gir.</p>
        {notice && (
          <div role="status" className="bg-amber-400/20 border border-amber-300/40 text-amber-100 text-sm rounded-xl px-4 py-3 mb-4">
            {notice}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <label htmlFor="game-code" className="sr-only">Oyun kodu</label>
          <input
            id="game-code"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="MRS-482"
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={8}
            className="w-full bg-white/10 border border-white/20 text-white text-center text-2xl font-mono tracking-widest placeholder-white/25 rounded-xl px-4 py-3 uppercase focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {error && (
            <p role="alert" className="text-red-300 text-sm">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || !value.trim()}
            className="w-full bg-white text-indigo-900 font-bold py-3 rounded-xl disabled:opacity-50 hover:bg-purple-50 transition-colors"
          >
            {loading ? "Kontrol ediliyor…" : "Oyuna Gir"}
          </button>
        </form>
      </div>
    </div>
  );
}

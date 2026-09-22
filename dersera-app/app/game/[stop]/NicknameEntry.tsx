"use client";

import { useState } from "react";

interface Props {
  onConfirm: (nickname: string) => void;
}

export default function NicknameEntry({ onConfirm }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: trimmed }),
      });
      const data = (await res.json()) as { ok?: boolean; nickname?: string; error?: string };

      if (res.ok && data.ok && data.nickname) {
        onConfirm(data.nickname);
      } else {
        setError(data.error ?? "Bir hata oluştu, tekrar dene.");
      }
    } catch {
      setError("Sunucuya ulaşılamadı. Bağlantını kontrol et.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Title */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🔐</div>
          <h1 className="text-2xl font-bold text-white">Okulun Şifresi</h1>
          <p className="text-purple-300 text-sm mt-2">
            Maceraya başlamak için bir takma kod seç.
            <br />
            Süren bu andan itibaren sayılacak!
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-purple-200 text-xs font-semibold mb-1.5 uppercase tracking-widest">
              Takma Kod
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError("");
              }}
              placeholder="örn. kahraman42"
              maxLength={20}
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full bg-white/10 border border-white/30 text-white placeholder-white/30 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all"
            />
            <p className="text-white/30 text-xs mt-1.5">
              2–20 karakter, harf/rakam/_ kullanabilirsin.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/20 border border-red-400/40 rounded-xl px-4 py-3">
              <p className="text-red-200 text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || value.trim().length < 2}
            className="w-full py-3.5 bg-purple-600 hover:bg-purple-500 disabled:bg-white/10 disabled:text-white/30 text-white font-bold rounded-xl transition-all duration-200 active:scale-95 text-base"
          >
            {loading ? "Kontrol ediliyor..." : "Maceraya Başla ⚡"}
          </button>
        </form>

        <p className="text-center text-white/30 text-xs mt-6">
          Kodun alınmışsa farklı bir tane seç.
        </p>
      </div>
    </div>
  );
}

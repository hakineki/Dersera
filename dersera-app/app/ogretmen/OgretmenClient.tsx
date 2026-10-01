"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import DerseraLogo from "@/components/DerseraLogo";
import Link from "next/link";
import { fetchResults } from "@/lib/resultsClient";
import type { Stop } from "@/data/stops";
import { formatElapsed, buildResultCode, yanlisSayisi, type LeaderboardEntry } from "@/lib/gameState";
import { toStops } from "@/lib/games";
import { definitionPanelStops } from "@/lib/composer/scene";
import OgrenmeRaporuKarti from "./OgrenmeRaporu";
import { ayniHesap, clearTeacherGame, loadTeacherGame, saveTeacherGame, type TeacherGame } from "@/lib/teacherGame";
import OyunTab from "./OyunTab";
import KutuphaneTab from "./KutuphaneTab";
import OkulTab from "./OkulTab";
import OgrenmeTakibiTab from "./OgrenmeTakibiTab";
import OgretmenMenusu, { IKON_KUTUSU, type MenuBaglantisi } from "./OgretmenMenusu";
import Ikon, { type IkonAdi } from "@/components/Ikon";
import { cikisYap, dogrulamaYenidenGonder, epostaDurumuAl, epostaKaydet, eskiYerelGirisiTemizle, girisYap, hesabimiSil, kayitOl, kullaniciAdiDegistir, oturumBilgisi, sifirlamaIste, sifreDegistir, type EpostaDurumu, type HesapOzeti } from "@/lib/authClient";
import { eskiKutuphaneSayisi, eskiKutuphaneyiTasi } from "@/lib/libraryClient";
import {
  clearPilotInfo,
  loadPilotInfo,
  savePilotInfo,
  type PilotInfo,
} from "@/lib/pilotInfo";

const SIFRE_MIN_ISTEMCI = 8;
// "Benim değil" seçimi bu tarayıcı oturumu boyunca hatırlanır.
const ESKI_KUTUPHANE_RED = "dersera:eski-kutuphane-red";
const BASLIK_DUGMESI = "inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap";

export type Tab = "oyun" | "kutuphane" | "takip" | "okul" | "siralama" | "ayarlar";

// Masaüstünde hepsi üst sekme çubuğunda; telefonda "altta" olanlar ekranın altındaki sabit çubukta, diğerleri başlıktaki ⋮ menüsünde.
const SEKMELER: { id: Tab; label: string; icon: IkonAdi; altta: boolean }[] = [
  { id: "oyun", label: "Oyun", icon: "oyun", altta: true },
  { id: "kutuphane", label: "Kütüphane", icon: "kutuphane", altta: true },
  { id: "takip", label: "Öğrenme", icon: "ogrenme", altta: false },
  { id: "okul", label: "Okulum", icon: "okul", altta: false },
  { id: "siralama", label: "Sınıf", icon: "sinif", altta: true },
  { id: "ayarlar", label: "Ayarlar", icon: "ayarlar", altta: false },
];

// ── Giriş / kayıt ekranı ─────────────────────────────────────────────────────
function LoginScreen({ onLogin, davetGerekli, kayitKapali }: { onLogin: (h: HesapOzeti) => void; davetGerekli: boolean; kayitKapali: boolean }) {
  const [mod, setMod] = useState<"giris" | "kayit">("giris");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [davet, setDavet] = useState("");
  const [eposta, setEposta] = useState("");
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
    const r = mod === "giris" ? await girisYap(username, password) : await kayitOl(username, password, davet, kosulOnayi, eposta.trim());
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
              <div>
                <label htmlFor="kayit-eposta" className="block text-sm text-purple-200 mb-1.5">E-posta</label>
                <input
                  id="kayit-eposta"
                  type="email"
                  value={eposta}
                  onChange={(e) => setEposta(e.target.value)}
                  autoComplete="email"
                  required
                  aria-describedby="kayit-eposta-aciklama"
                  className={alan}
                  placeholder="ayse@okul.k12.tr"
                />
                <p id="kayit-eposta-aciklama" className="text-xs text-purple-300 mt-1">
                  Şifreni unutursan sıfırlama bağlantısı bu adrese gelir; doğrulama bağlantısı gönderilir. Başka bir amaçla kullanılmaz.
                </p>
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
              <p className="text-xs text-purple-300">
                Kişisel verilerin{" "}
                <Link href="/gizlilik" target="_blank" className="underline text-white">
                  Gizlilik ve KVKK Aydınlatma Metni
                </Link>
                {"'ne göre işlenir."}
              </p>
            </>
          )}

          {error && (
            <div role="alert" className="bg-red-500/20 border border-red-400/40 rounded-lg px-4 py-2">
              <p className="text-red-200 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username.trim() || !password || (mod === "kayit" && (!password2 || !eposta.trim() || !kosulOnayi))}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:text-white/40 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
          >
            {loading ? "Kontrol ediliyor..." : mod === "giris" ? "Giriş Yap" : "Hesap Oluştur"}
          </button>
        </form>

        {mod === "giris" && <SifremiUnuttum />}

        <Link href="/" className="block text-center text-purple-400 text-sm mt-6 hover:text-purple-200 transition-colors">
          ← Ana sayfaya dön
        </Link>
      </div>
    </div>
  );
}

// "Şifremi unuttum": doğrulanmış e-postaya sıfırlama bağlantısı. Yanıt her durumda aynı mesajdır.
function SifremiUnuttum() {
  const [acik, setAcik] = useState(false);
  const [girdi, setGirdi] = useState("");
  const [mesaj, setMesaj] = useState<{ tur: "tamam" | "hata"; metin: string } | null>(null);
  const [bekliyor, setBekliyor] = useState(false);

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setBekliyor(true);
    const r = await sifirlamaIste(girdi.trim());
    setBekliyor(false);
    setMesaj("error" in r ? { tur: "hata", metin: r.error } : { tur: "tamam", metin: r.mesaj });
  }

  if (!acik)
    return (
      <button type="button" onClick={() => setAcik(true)} className="block mx-auto mt-4 text-sm text-purple-300 underline hover:text-white">
        Şifremi unuttum
      </button>
    );
  return (
    <form onSubmit={gonder} className="mt-5 space-y-3 bg-white/5 border border-white/10 rounded-xl p-4">
      <label htmlFor="unuttum" className="block text-sm text-purple-200">
        Kullanıcı adın ya da doğrulanmış e-postan
      </label>
      <input id="unuttum" type="text" value={girdi} onChange={(e) => setGirdi(e.target.value)} autoComplete="username" className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
      {mesaj && (
        <p role={mesaj.tur === "hata" ? "alert" : "status"} className={`text-xs rounded-lg px-3 py-2 ${mesaj.tur === "hata" ? "bg-red-500/20 text-red-100" : "bg-white/10 text-purple-100"}`}>
          {mesaj.metin}
        </p>
      )}
      <button type="submit" disabled={bekliyor || !girdi.trim()} className="w-full bg-white/15 hover:bg-white/25 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl text-sm">
        {bekliyor ? "Gönderiliyor…" : "Sıfırlama bağlantısı gönder"}
      </button>
    </form>
  );
}

const RESULTS_REFRESH_MS = 30_000;

interface ResultsSync {
  status: "loading" | "ok" | "error";
  persistent: boolean;
  lastUpdated: number | null;
}

const ILK_SYNC: ResultsSync = { status: "loading", persistent: true, lastUpdated: null };

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
    const wrongCount = yanlisSayisi(e);
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
    const wrongCount = yanlisSayisi(selectedEntry);
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
                const wrongCount = yanlisSayisi(e);
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

function AyarlarTab({
  hesap,
  onHesap,
  onCikis,
  eposta,
  onEposta,
}: {
  hesap: HesapOzeti;
  onHesap: (h: HesapOzeti) => void;
  onCikis: () => void;
  eposta: EpostaDurumu | null | undefined;
  onEposta: (e: EpostaDurumu | null) => void;
}) {
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


      <EpostaAyari durum={eposta} onDurum={onEposta} />

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
          onClick={onCikis}
          className="w-full border border-red-200 text-red-600 font-semibold py-2 rounded-lg text-sm hover:bg-red-50 transition-colors"
        >
          Çıkış Yap
        </button>
      </div>

      <HesapSilme onSilindi={onCikis} />
    </div>
  );
}

// E-posta (zorunlu; eski hesaplar burada ekler): yalnız doğrulandıktan sonra ve yalnız şifre sıfırlama bağlantısı için
// kullanılır. Kaldırılamaz, değiştirilir. Durum panelin üstündeki uyarıyla ortaktır.
function EpostaAyari({ durum, onDurum }: { durum: EpostaDurumu | null | undefined; onDurum: (e: EpostaDurumu | null) => void }) {
  const [adres, setAdres] = useState("");
  const [sifre, setSifre] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [bekliyor, setBekliyor] = useState(false);

  async function kaydet(e: React.FormEvent) {
    e.preventDefault();
    setBekliyor(true);
    setMsg(null);
    const r = await epostaKaydet(adres, sifre);
    setBekliyor(false);
    setSifre("");
    if ("error" in r) return setMsg({ type: "err", text: r.error });
    onDurum(r.eposta);
    setAdres("");
    setMsg(r.eposta.dogrulandi ? { type: "ok", text: "Bu adres zaten doğrulanmış." } : { type: "ok", text: `${r.eposta.adres} adresine doğrulama bağlantısı gönderildi (24 saat geçerli).` });
  }

  const girdi = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
  return (
    <div id="eposta" className="border-t border-gray-200 pt-6 scroll-mt-24">
      <h3 className="font-semibold text-gray-700 mb-1">E-posta</h3>
      <p className="text-xs text-gray-500 mb-4">Şifreni unutursan sıfırlama bağlantısı yalnız doğrulanmış bu adrese gönderilir. Başka bir amaçla kullanılmaz. Kaldırılamaz; değiştirebilirsin.</p>
      {durum && (
        <p className="text-sm mb-3">
          <span className="font-medium break-all">{durum.adres}</span>{" "}
          {durum.dogrulandi ? <span className="text-xs text-green-700 bg-green-50 rounded-full px-2 py-0.5">Doğrulandı</span> : <span className="text-xs text-amber-800 bg-amber-50 rounded-full px-2 py-0.5">Doğrulanmadı: gelen kutunu kontrol et</span>}
        </p>
      )}
      <form onSubmit={kaydet} className="space-y-3">
        <div>
          <label htmlFor="eposta-adres" className="block text-xs font-medium text-gray-600 mb-1">
            {durum ? "Yeni e-posta (ya da aynısını yazıp doğrulamayı yeniden gönder)" : "E-posta"}
          </label>
          <input id="eposta-adres" type="email" value={adres} onChange={(e) => setAdres(e.target.value)} autoComplete="email" className={girdi} />
        </div>
        <div>
          <label htmlFor="eposta-sifre" className="block text-xs font-medium text-gray-600 mb-1">
            Şifre
          </label>
          <input id="eposta-sifre" type="password" value={sifre} onChange={(e) => setSifre(e.target.value)} autoComplete="current-password" className={girdi} />
        </div>
        <Mesaj msg={msg} />
        <button type="submit" disabled={bekliyor || !adres.trim() || !sifre} className="w-full bg-indigo-600 disabled:bg-indigo-300 text-white font-semibold py-2 rounded-lg text-sm hover:bg-indigo-700">
          {durum ? "Adresi değiştir ve doğrulama bağlantısı gönder" : "E-postayı ekle ve doğrulama bağlantısı gönder"}
        </button>
      </form>
    </div>
  );
}

// Panelin üstünde kalıcı uyarı (her sekmede): e-posta yoksa eklemeye, doğrulanmamışsa gelen kutusuna yönlendirir. Şifre
// kurtarma yalnız doğrulanmış e-postayla yapılabildiği için uyarı doğrulanana kadar kalır.
function EpostaUyarisi({ durum, onAyarlar }: { durum: EpostaDurumu | null | undefined; onAyarlar: () => void }) {
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [bekliyor, setBekliyor] = useState(false);
  if (durum === undefined || durum?.dogrulandi) return null;

  async function yenidenGonder() {
    setBekliyor(true);
    setMsg(null);
    const r = await dogrulamaYenidenGonder();
    setBekliyor(false);
    setMsg("error" in r ? { type: "err", text: r.error } : { type: "ok", text: `${r.adres} adresine doğrulama bağlantısı yeniden gönderildi (24 saat geçerli).` });
  }

  const dugme = "text-sm font-semibold rounded-lg px-3 py-1.5 border border-amber-300 bg-white text-amber-900 hover:bg-amber-100 disabled:opacity-60";
  return (
    <section aria-label="E-posta uyarısı" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden">
      {durum === null ? (
        <>
          <p className="font-semibold">Hesabına e-posta ekle</p>
          <p className="mt-0.5">E-posta artık her hesapta zorunlu: şifreni unutursan sıfırlama bağlantısı bu adrese gelir.</p>
          <div className="mt-2">
            <button type="button" onClick={onAyarlar} className={dugme}>
              E-posta ekle
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="font-semibold">E-postanı doğrula</p>
          <p className="mt-0.5">
            <span className="font-medium break-all">{durum.adres}</span> adresine gönderilen bağlantıyı aç (gelmediyse istenmeyen e-posta klasörüne bak).
            Doğrulanmadan şifre sıfırlama bağlantısı gönderilemez.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={yenidenGonder} disabled={bekliyor} className={dugme}>
              {bekliyor ? "Gönderiliyor…" : "Bağlantıyı yeniden gönder"}
            </button>
            <button type="button" onClick={onAyarlar} className={dugme}>
              Adresi değiştir
            </button>
          </div>
        </>
      )}
      {msg && (
        <p role={msg.type === "err" ? "alert" : "status"} className={`mt-2 text-sm ${msg.type === "err" ? "text-red-700" : "text-green-800"}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}

// Hesabı kalıcı olarak silme (KVKK). Ne silinip ne kaldığı açıkça yazılır; şifre ve onay kutusuyla yapılır.
function HesapSilme({ onSilindi }: { onSilindi: () => void }) {
  const [acik, setAcik] = useState(false);
  const [sifre, setSifre] = useState("");
  const [onay, setOnay] = useState(false);
  const [bekliyor, setBekliyor] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function sil(e: React.FormEvent) {
    e.preventDefault();
    setBekliyor(true);
    setMsg(null);
    const r = await hesabimiSil(sifre);
    setBekliyor(false);
    if ("error" in r) return setMsg({ type: "err", text: r.error });
    clearPilotInfo();
    window.alert("Hesabın ve verilerin silindi.");
    onSilindi();
  }

  return (
    <div className="pt-6 border-t border-gray-200">
      {!acik ? (
        <button type="button" onClick={() => setAcik(true)} className="text-sm text-red-600 underline">
          Hesabımı sil…
        </button>
      ) : (
        <form onSubmit={sil} className="space-y-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="text-sm font-bold text-red-800">Hesabımı kalıcı olarak sil</h3>
          <ul className="list-disc pl-5 text-xs text-red-900 space-y-1">
            <li>Hesabın, kütüphanedeki oyunların, koleksiyonların, okul üyeliğin ve okullarda paylaştığın oyunlar, kredi kayıtların ve öğrenme takibi raporların silinir. Kullanıcı adın boşa çıkar; diğer cihazlardaki oturumların kapanır.</li>
            <li>Toplulukta yayındaki ya da incelemedeki bütün oyunların geri çekilir.</li>
            <li>Başka oyunlara verdiğin puanlar, inceleme kararların ve notların kimliksiz olarak kalır; kopya kayıtlarında adın &quot;silinmiş hesap&quot; olur.</li>
            <li>Silinen veriler şifreli yedeklerden en geç 14 gün içinde kalkar. Bu işlem geri alınamaz.</li>
          </ul>
          <div>
            <label htmlFor="silme-sifre" className="block text-xs font-semibold text-red-900 mb-1">
              Şifren
            </label>
            <input id="silme-sifre" type="password" value={sifre} onChange={(e) => setSifre(e.target.value)} autoComplete="current-password" className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <label className="flex items-start gap-2 text-xs text-red-900">
            <input type="checkbox" checked={onay} onChange={(e) => setOnay(e.target.checked)} className="mt-0.5" />
            <span>Hesabımın ve verilerimin kalıcı olarak silineceğini anlıyorum.</span>
          </label>
          <Mesaj msg={msg} />
          <div className="flex gap-2">
            <button type="submit" disabled={bekliyor || !sifre || !onay} className="flex-1 bg-red-600 disabled:bg-red-300 text-white font-semibold py-2 rounded-lg text-sm hover:bg-red-700">
              {bekliyor ? "Siliniyor…" : "Hesabımı sil"}
            </button>
            <button type="button" onClick={() => { setAcik(false); setSifre(""); setOnay(false); setMsg(null); }} className="px-3 text-sm text-gray-600">
              Vazgeç
            </button>
          </div>
        </form>
      )}
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
  // Öğretmenin e-posta durumu (undefined: henüz okunmadı). Üst uyarı ve Ayarlar'daki e-posta bölümü paylaşır.
  const [eposta, setEposta] = useState<EpostaDurumu | null | undefined>(undefined);
  const [selectedAylar, setSelectedAylar] = useState<string[]>(["eylul"]);
  const [teacherGame, setTeacherGame] = useState<TeacherGame | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [sync, setSync] = useState<ResultsSync>(ILK_SYNC);

  useEffect(() => {
    eskiYerelGirisiTemizle();
    oturumBilgisi().then((o) => {
      if (o) {
        setHesap(o.hesap);
        // Kayıtlı oyun ancak giriş bilinince ve yalnız bu hesabınsa okunur (sunucuda localStorage yok).
        setTeacherGame(o.hesap ? loadTeacherGame(o.hesap) : null);
        setDavetGerekli(o.davetGerekli);
        setKayitKapali(o.kayitKapali);
        setYonetici(o.yonetici);
      } else setBaglantiHatasi(true);
      setReady(true);
    });
  }, []);

  // Hesap öncesinde bu tarayıcıda kaydedilmiş kütüphane varsa öğretmene sorulur (ortak bilgisayarda başkasına ait olabilir).
  const hesapAdi = hesap?.kullaniciAdi ?? null;

  // E-posta durumu hesap değişince okunur; önceki hesabın adresi bir an bile görünmesin diye önce sıfırlanır. Okunamazsa
  // (bağlantı hatası) uyarı gösterilmez.
  useEffect(() => {
    let iptal = false;
    const t = setTimeout(async () => {
      setEposta(undefined);
      if (!hesapAdi) return;
      const r = await epostaDurumuAl();
      if (!iptal) setEposta("error" in r ? undefined : r.eposta);
    });
    return () => {
      iptal = true;
      clearTimeout(t);
    };
  }, [hesapAdi]);
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
  const adminToken = teacherGame?.adminToken ?? null;

  const refreshLeaderboard = useCallback(() => {
    const requestId = ++latestRequest.current;
    if (!gameCode || !adminToken) {
      setLeaderboard([]);
      return;
    }
    fetchResults(gameCode, adminToken).then((data) => {
      if (requestId !== latestRequest.current) return;
      if (data) {
        setLeaderboard(data.results);
        setSync({ status: "ok", persistent: data.persistent, lastUpdated: Date.now() });
      } else {
        setSync((s) => ({ ...s, status: "error" }));
      }
    });
  }, [gameCode, adminToken]);

  // Şu an girişli hesap: çıkıştan sonra dönen eski istek (yayın, oyunu bitirme) kaydı geri yazmaz, oyunu sonraki
  // öğretmene göstermez. Çıkış bunu ağ beklenmeden boşaltır.
  const girisliHesap = useRef<HesapOzeti | null>(null);
  useEffect(() => {
    girisliHesap.current = hesap;
  }, [hesap]);

  const handleTeacherGameChange = useCallback(
    (tg: TeacherGame) => {
      if (!hesap || !ayniHesap(girisliHesap.current, hesap)) return false;
      saveTeacherGame(tg, hesap);
      setTeacherGame(tg);
      return true;
    },
    [hesap]
  );

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
          setTeacherGame(loadTeacherGame(h));
          // Yönetici bilgisi giriş yanıtında yok; oturumdan okunur.
          oturumBilgisi().then((o) => setYonetici(!!o?.yonetici));
        }}
        davetGerekli={davetGerekli}
        kayitKapali={kayitKapali}
      />
    );
  }

  const baglantilar: MenuBaglantisi[] = [
    ...(yonetici && loggedIn ? [{ href: "/yonetim", label: "Yönetim", icon: "moderasyon" as const }] : []),
    { href: "/library", label: "Topluluk", icon: "topluluk" },
    { href: "/qr-kutuphane", label: "QR Kütüphanesi", icon: "qr" },
  ];
  // Telefonda ⋮ menüsünden açılan bölümü alt çubuk göstermez; adı içeriğin başında yazar.
  const menuSekmesi = SEKMELER.find((t) => t.id === activeTab && !t.altta);
  // Telefonda bölüm değişince yeni bölüm baştan açılır; ⋮ düğmesi de yeniden görünür.
  function telefondaSec(id: Tab) {
    setActiveTab(id);
    window.scrollTo({ top: 0 });
  }
  // Ayarlar sekmesi ve telefondaki ⋮ menüsü aynı çıkışı kullanır. Ortak bilgisayarda sonraki öğretmen
  // öncekinin son sekmesinde, yönetici görünümünde ya da oyununda açılmasın: oyun kaydı (yönetim belirteciyle) ağ
  // beklenmeden silinir, sonuçlar ve taşıma mesajı bellekten atılır.
  async function cikis() {
    girisliHesap.current = null;
    clearTeacherGame();
    await cikisYap();
    setHesap(null);
    setYonetici(false);
    setActiveTab(baslangicSekmesi);
    setTeacherGame(null);
    setLeaderboard([]);
    setSync(ILK_SYNC);
    setTasimaMesaji("");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header — telefonda tek satır (bağlantılar ⋮ menüsünde); sm ve üstünde sığmazsa düğmeler logonun altına iner */}
      <div className="bg-indigo-900 text-white px-4 sm:px-6 py-3 sm:py-4 print:hidden">
        <div className="max-w-4xl mx-auto flex sm:flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex items-center gap-3">
            <DerseraLogo className="shrink-0" />
            <div className="border-l border-indigo-700 pl-3">
              <p className="text-xs font-semibold text-indigo-200 leading-tight">Öğretmen Paneli</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-4">
            {baglantilar.map((b) => (
              <Link key={b.href} href={b.href} className={BASLIK_DUGMESI}>
                <Ikon ad={b.icon} className="w-4 h-4" />
                {b.label}
              </Link>
            ))}
            <Link href="/" className="text-indigo-300 hover:text-white text-sm transition-colors">
              ← Ana sayfa
            </Link>
          </div>
          <OgretmenMenusu
            sekmeler={SEKMELER.filter((t) => !t.altta)}
            aktif={activeTab}
            onSekme={telefondaSec}
            baglantilar={[...baglantilar, { href: "/", label: "Ana sayfa", icon: "ana-sayfa" }]}
            onCikis={cikis}
          />
        </div>
      </div>

      {/* Tab bar */}
      <div className="hidden sm:block bg-white border-b border-gray-200 sticky top-0 z-10 print:hidden">
        <div className="max-w-4xl mx-auto px-4 flex gap-0 overflow-x-auto">
          {SEKMELER.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              aria-current={activeTab === t.id ? "page" : undefined}
              className={`flex items-center gap-1.5 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === t.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Ikon ad={t.icon} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* İçerik — telefonda alt çubuğun altında kalmaması için alt boşluk */}
      <div className="max-w-4xl mx-auto px-4 pt-6 pb-24 sm:pb-6 print:px-0">
        <EpostaUyarisi
          durum={eposta}
          onAyarlar={() => {
            setActiveTab("ayarlar");
            setTimeout(() => document.getElementById("eposta")?.scrollIntoView({ behavior: "smooth" }), 50);
          }}
        />
        {menuSekmesi && (
          <h2 className="sm:hidden flex items-center gap-2 text-lg font-bold text-gray-900 mb-4">
            <span className={`${IKON_KUTUSU} bg-indigo-50 text-indigo-700`}>
              <Ikon ad={menuSekmesi.icon} />
            </span>
            {menuSekmesi.label}
          </h2>
        )}
        {activeTab === "oyun" && (
          <OyunTab
            teacherGame={teacherGame}
            finishedCount={leaderboard.length}
            selectedAylar={selectedAylar}
            toggleAy={toggleAy}
            onTeacherGameChange={handleTeacherGameChange}
            onKutuphane={() => telefondaSec("kutuphane")}
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
              if (handleTeacherGameChange(tg)) setActiveTab("oyun");
            }}
          />
        )}
        {activeTab === "takip" && <OgrenmeTakibiTab />}
        {activeTab === "okul" && <OkulTab />}
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
          <AyarlarTab hesap={hesap} onHesap={setHesap} onCikis={cikis} eposta={eposta} onEposta={setEposta} />
        )}
      </div>

      {/* Telefonda alt gezinme */}
      <nav
        aria-label="Ana bölümler"
        className="sm:hidden print:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-3">
          {SEKMELER.filter((t) => t.altta).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => telefondaSec(t.id)}
              aria-current={activeTab === t.id ? "page" : undefined}
              className={`flex flex-col items-center gap-1 pt-2 pb-2.5 text-xs transition-colors ${
                activeTab === t.id ? "font-semibold text-indigo-700" : "font-medium text-gray-500"
              }`}
            >
              {/* Seçili bölüm dolgulu mor hapla belli olur */}
              <span
                className={`w-14 h-8 rounded-full flex items-center justify-center transition-colors ${
                  activeTab === t.id ? "bg-indigo-600 text-white" : ""
                }`}
              >
                <Ikon ad={t.icon} />
              </span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

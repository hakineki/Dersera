"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import YonetimBasligi from "@/components/YonetimBasligi";
import YedekDurumu from "@/app/moderasyon/YedekDurumu";
import type { YonetimOzeti } from "@/lib/yonetimOzeti";

const SAYI_ADI: { key: keyof YonetimOzeti["sayilar"]; ad: string }[] = [
  { key: "ogretmen", ad: "Öğretmen hesabı" },
  { key: "okul", ad: "Okul" },
  { key: "toplulukYayinda", ad: "Toplulukta yayında" },
  { key: "toplulukInceleme", ad: "Topluluk incelemesinde" },
  { key: "moderasyonBekleyen", ad: "Moderasyonda bekleyen" },
  { key: "buAyUretim", ad: "Bu ay üretilen oyun" },
  { key: "buAyDeneme", ad: "Bu ay öğrenci denemesi" },
];

// Yapılandırma sağlığı: eksik olan kırmızı, açıklamasıyla.
const SAGLIK_ADI: { key: keyof YonetimOzeti["saglik"]; ad: string; eksik: string }[] = [
  { key: "kaliciDepo", ad: "Kalıcı veritabanı (Redis)", eksik: "Redis bağlı değil: canlıda hiçbir kalıcı işlem çalışmaz." },
  { key: "yapayZeka", ad: "Yapay zekâ anahtarı", eksik: "OPENAI_API_KEY ya da ANTHROPIC_API_KEY yok: oyun oluşturulamaz." },
  { key: "gorselDepo", ad: "Görsel ve yedek deposu (Blob)", eksik: "BLOB_READ_WRITE_TOKEN yok: görsel ve gece yedeği yazılamaz." },
  { key: "yedekAnahtari", ad: "Yedek şifreleme anahtarı", eksik: "YEDEK_ANAHTARI yok: gece yedeği alınmaz." },
  { key: "zamanlayici", ad: "Zamanlanmış görev anahtarı", eksik: "CRON_SECRET yok: gece yedeği tetiklenemez." },
  { key: "davetKodu", ad: "Kayıt davet kodu", eksik: "KAYIT_DAVET_KODU yok: canlıda yeni öğretmen kaydı kapalıdır." },
];

const BOLUMLER = [
  { href: "/moderasyon", ad: "Moderasyon", metin: "İçerik denetiminden uyarı ya da engel alan oyunlar; topluluk başlangıç döneminin incelemesiz oyunları.", rozet: "moderasyonBekleyen" as const },
  { href: "/yonetim/ogrenme", ad: "Öğrenme döngüsü", metin: "Aylık üretim ve öğrenci sonuçları; yapay zekâdan kural önerisi ve onaylı kurallar." },
  { href: "/yonetim/okul-havuzu", ad: "Okul kredi havuzları", metin: "Okullara aylık kredi hakkı atama ve kullanım." },
  { href: "/yonetim/kopya-kaydi", ad: "Kopya kaydı", metin: "Başka öğretmenlerin oyunlarının tam içeriğinin açılma kaydı." },
];

export default function YonetimClient() {
  const [ozet, setOzet] = useState<YonetimOzeti | { error: string; status: number } | null>(null);
  useEffect(() => {
    fetch("/api/yonetim/ozet", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        setOzet(r.ok ? (j as YonetimOzeti) : { error: j.error ?? "Özet okunamadı.", status: r.status });
      })
      .catch(() => setOzet({ error: "Bağlantı kurulamadı.", status: 0 }));
  }, []);
  const hazir = ozet && !("error" in ozet) ? ozet : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <YonetimBasligi baslik="Yönetim" />
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Genel bakış</h1>
          <p className="text-sm text-gray-500">Platformun özeti, sistem sağlığı ve yönetim bölümleri.</p>
        </div>
        {ozet && "error" in ozet && (
          <p role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            {ozet.status === 401 ? "Giriş yap; bu sayfa yöneticilere açık." : ozet.error}
          </p>
        )}
        {!ozet && <p className="text-sm text-gray-400">Yükleniyor…</p>}

        {hazir && (
          <>
            <section aria-label="Özet sayılar">
              <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {SAYI_ADI.map((s) => (
                  <li key={s.key} className="bg-white border border-gray-200 rounded-2xl p-4">
                    <p className="text-2xl font-bold text-gray-900 tabular-nums">{hazir.sayilar[s.key].toLocaleString("tr-TR")}</p>
                    <p className="text-xs text-gray-500 mt-1">{s.ad}</p>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-400 mt-2">Ay: {hazir.ay} (Türkiye saati).</p>
            </section>

            <section aria-label="Sistem sağlığı" className="space-y-2">
              <h2 className="text-sm font-bold text-gray-900">Sistem sağlığı</h2>
              <YedekDurumu />
              <ul className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
                {SAGLIK_ADI.map((s) => {
                  const iyi = hazir.saglik[s.key];
                  return (
                    <li key={s.key} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                      <span aria-hidden="true">{iyi ? "✅" : "⚠️"}</span>
                      <div>
                        <p className="font-medium text-gray-900">
                          {s.ad}
                          <span className="sr-only">{iyi ? ": tamam" : ": eksik"}</span>
                        </p>
                        {!iyi && <p className="text-xs text-red-700">{s.eksik}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}

        <section aria-label="Yönetim bölümleri">
          <h2 className="text-sm font-bold text-gray-900 mb-2">Bölümler</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {BOLUMLER.map((b) => {
              const rozet = b.rozet && hazir ? hazir.sayilar[b.rozet] : 0;
              return (
                <li key={b.href}>
                  <Link href={b.href} className="block bg-white border border-gray-200 rounded-2xl p-4 hover:border-indigo-300 h-full">
                    <p className="font-semibold text-gray-900 flex items-center gap-2">
                      {b.ad}
                      {rozet > 0 && <span className="text-xs bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">{rozet} bekliyor</span>}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">{b.metin}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}

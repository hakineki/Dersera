"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import OgrenciDemo from "@/app/game/composer/OgrenciDemo";
import type { GameDefinition } from "@/lib/composer/definition";
import { kutuphaneOyunu, toplulukOyunu } from "@/lib/libraryClient";
import { okulOyunu } from "@/lib/okulClient";

type Durum = { tur: "yukleniyor" } | { tur: "hata"; mesaj: string } | { tur: "hazir"; def: GameDefinition };

// /demo?kutuphane=<id> | ?topluluk=<id> | ?okul=<id>: oyun, öğretmenin zaten açabildiği uçtan (kendi kütüphanesi,
// topluluk ya da okul kütüphanesi) yüklenir ve öğrenci gözüyle oynatılır. Topluluk oyununun açılması "Oyunu Kullan"
// gibi günlük sınıra ve kopya kaydına sayılır.
export default function DemoClient() {
  const router = useRouter();
  const [durum, setDurum] = useState<Durum>({ tur: "yukleniyor" });

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const id = p.get("kutuphane");
    const topluluk = p.get("topluluk");
    const okul = p.get("okul");
    let iptal = false;
    const t = setTimeout(async () => {
      if (!id && !topluluk && !okul) return setDurum({ tur: "hata", mesaj: "Denenecek oyun seçilmedi." });
      const d = id ? await kutuphaneOyunu(id) : okul ? await okulOyunu(okul) : await toplulukOyunu(topluluk!);
      if (iptal) return;
      if (!d) return setDurum({ tur: "hata", mesaj: "Oyun açılamadı. Öğretmen olarak giriş yaptığından emin ol." });
      if (!d.validation?.gecerli) return setDurum({ tur: "hata", mesaj: "Bu oyunda düzeltilmesi gereken hatalar var; önce Composer'da düzelt." });
      setDurum({ tur: "hazir", def: d.oyun.definition });
    });
    return () => {
      iptal = true;
      clearTimeout(t);
    };
  }, []);

  const cik = () => (window.history.length > 1 ? router.back() : router.push("/ogretmen"));

  if (durum.tur === "hazir") return <OgrenciDemo def={durum.def} onCik={cik} />;
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-sm w-full bg-white border border-gray-200 rounded-2xl p-5 text-center">
        {durum.tur === "yukleniyor" ? (
          <p className="text-sm text-gray-500">Demo hazırlanıyor…</p>
        ) : (
          <>
            <p role="alert" className="text-sm text-red-700">
              {durum.mesaj}
            </p>
            <Link href="/ogretmen" className="inline-block mt-4 text-sm font-semibold text-indigo-700">
              ← Öğretmen paneli
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import DerseraLogo from "@/components/DerseraLogo";

// Platform yöneticisi sayfalarının ortak başlığı: bütün yönetim bölümleri tek menüde, bulunulan sayfa işaretli.
export const YONETIM_BOLUMLERI = [
  { href: "/yonetim", ad: "Genel bakış" },
  { href: "/yonetim/ogretmenler", ad: "Öğretmenler" },
  { href: "/yonetim/okullar", ad: "Okullar" },
  { href: "/moderasyon", ad: "Moderasyon" },
  { href: "/yonetim/ogrenme", ad: "Öğrenme" },
  { href: "/yonetim/okul-havuzu", ad: "Okul havuzları" },
  { href: "/yonetim/kopya-kaydi", ad: "Kopya kaydı" },
  { href: "/yonetim/yz-maliyet", ad: "YZ maliyeti" },
] as const;

export default function YonetimBasligi({ baslik, genislik = "max-w-4xl" }: { baslik: string; genislik?: string }) {
  const yol = usePathname();
  return (
    <header className="bg-indigo-900 text-white px-4 py-4">
      <div className={`${genislik} mx-auto flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex items-center gap-3">
          <DerseraLogo />
          <p className="text-xs font-semibold text-indigo-200 border-l border-indigo-700 pl-3">{baslik}</p>
        </div>
        <nav aria-label="Yönetim" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {YONETIM_BOLUMLERI.map((b) => (
            <Link key={b.href} href={b.href} aria-current={yol === b.href ? "page" : undefined} className={yol === b.href ? "text-white font-semibold" : "text-indigo-300 hover:text-white"}>
              {b.ad}
            </Link>
          ))}
          <Link href="/ogretmen" className="text-indigo-300 hover:text-white">
            ← Öğretmen paneli
          </Link>
        </nav>
      </div>
    </header>
  );
}

"use client";

import { useState } from "react";
import Image from "next/image";

// Oyun görseli (lib/gorsel.ts): yönlendirmeyle depodan gelir; yüklenemezse başlığıyla birlikte yer kaplamaz
// (oyun görselsiz sürer).
export default function GorselResim({ src, alt, altyazi, className = "" }: { src: string; alt: string; altyazi?: string; className?: string }) {
  const [gizli, setGizli] = useState(false);
  if (gizli) return null;
  return (
    <figure className={className}>
      <Image
        unoptimized
        src={src}
        alt={alt}
        width={1024}
        height={768}
        loading="lazy"
        onError={() => setGizli(true)}
        className="w-full h-auto aspect-[4/3] object-cover rounded-xl bg-white/10"
      />
      {altyazi && <figcaption className="text-xs text-gray-600 mt-1">{altyazi}</figcaption>}
    </figure>
  );
}

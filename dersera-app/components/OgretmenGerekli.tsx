import Link from "next/link";
import DerseraLogo from "@/components/DerseraLogo";

// Öğretmene açık sayfa giriş yapmadan açılınca: içerik gösterilmez, girişe yönlendirilir.
export default function OgretmenGerekli({ baslik }: { baslik: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col items-center justify-center px-6 text-center">
      <DerseraLogo />
      <h1 className="text-xl font-bold text-white mt-6">{baslik}</h1>
      <p className="text-purple-200 text-sm mt-2 max-w-sm">Bu sayfa yalnız öğretmenlere açık. Görmek için öğretmen hesabınla giriş yap.</p>
      <Link href="/ogretmen" className="mt-6 bg-white text-indigo-900 font-semibold px-5 py-2.5 rounded-xl text-sm">
        Öğretmen girişi
      </Link>
      <Link href="/" className="mt-4 text-purple-300 text-sm hover:text-white">
        ← Ana sayfa
      </Link>
    </div>
  );
}

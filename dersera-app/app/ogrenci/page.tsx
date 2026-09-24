import Link from "next/link";
import DerseraLogo from "@/components/DerseraLogo";

export default function OgrenciPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center mb-4">
          <DerseraLogo />
        </div>
        <div className="text-5xl mb-4">📱</div>
        <h1 className="text-xl font-bold text-white mb-3">QR Kodu Tara</h1>
        <p className="text-purple-300 text-sm leading-relaxed mb-8">
          Öğretmenin sınıfa koyduğu QR kodunu telefon kameranla tara ve oyunu başlat.
        </p>
        <div className="bg-white/10 border border-white/20 rounded-2xl p-6">
          <p className="text-white/60 text-xs leading-relaxed">
            Henüz bir QR kod taramadıysan öğretmeninden ilk durağın yerini sor.
          </p>
        </div>
        <Link href="/" className="inline-block mt-6 text-purple-400 text-sm hover:text-purple-200 transition-colors">
          ← Geri dön
        </Link>
      </div>
    </div>
  );
}

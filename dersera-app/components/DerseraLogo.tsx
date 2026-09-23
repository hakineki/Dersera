import Image from "next/image";

// Marka kılavuzu logonun yeniden renklendirilmesini yasaklar; koyu zeminde okunması için beyaz kart şart.
export default function DerseraLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center bg-white rounded-xl px-3 py-1.5 shadow-sm ${className}`}>
      <Image src="/logo/dersera-logo.png" alt="Dersera" width={120} height={40} priority />
    </span>
  );
}

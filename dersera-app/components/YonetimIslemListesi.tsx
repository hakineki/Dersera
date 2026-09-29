import type { SonIslem } from "@/lib/yonetimIslemKaydi";

const zaman = (t: number) => new Date(t).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const hesap = (ad: string | null) => <b>{ad ?? "silinmiş hesap"}</b>;

function Cumle({ i }: { i: SonIslem }) {
  switch (i.islem) {
    case "askiya-al":
      return <>{hesap(i.hedef)} hesabını askıya aldı</>;
    case "geri-ac":
      return <>{hesap(i.hedef)} hesabını geri açtı</>;
    case "sil":
      return <>{hesap(i.hedef)} hesabını sildi</>;
    case "okul-devret":
      return (
        <>
          <b>{i.okulAdi}</b> okulunun yöneticiliğini {hesap(i.hedef)} hesabına devretti
        </>
      );
    case "okul-kapat":
      return (
        <>
          <b>{i.okulAdi}</b> okulunu kapattı
        </>
      );
  }
}

// Platform yöneticisi işlemlerinin son kayıtları (öğretmenler ve okullar sayfaları).
export default function YonetimIslemListesi({ islemler }: { islemler: SonIslem[] }) {
  return (
    <section aria-label="Son işlemler" className="bg-white border border-gray-200 rounded-2xl p-4">
      <h2 className="text-sm font-bold text-gray-900 mb-2">Son yönetim işlemleri</h2>
      {islemler.length === 0 ? (
        <p className="text-xs text-gray-500">Henüz işlem yok.</p>
      ) : (
        <ul className="space-y-2 text-xs text-gray-700">
          {islemler.map((i, n) => (
            <li key={n}>
              <span className="text-gray-400">{zaman(i.tarih)}</span> · {hesap(i.yonetici)}, <Cumle i={i} />
              {i.neden && <span className="block text-gray-500">Gerekçe: {i.neden}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

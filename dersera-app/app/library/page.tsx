import { PROGRAM_DERS_ADI, PROGRAM_DERSLERI, SINIFLAR } from "@/data/mufredat/programlar";
import ToplulukClient from "./ToplulukClient";
import OgretmenGerekli from "@/components/OgretmenGerekli";
import { sayfaHesabi } from "@/lib/sayfaOturumu";

export const metadata = {
  title: "Topluluk Kütüphanesi — Dersera",
  description: "Öğretmenlerin yayınladığı Dersera oyunları.",
};

// Ders listesi sunucuda hazırlanır; müfredat verisi istemci paketine girmez.
export default async function LibraryPage() {
  if (!(await sayfaHesabi())) return <OgretmenGerekli baslik="Topluluk Kütüphanesi" />;
  return <ToplulukClient dersler={PROGRAM_DERSLERI.map((key) => ({ key, ad: PROGRAM_DERS_ADI[key] }))} siniflar={[...SINIFLAR]} />;
}

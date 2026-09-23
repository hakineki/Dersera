import { getKonuSecenekleri, PROGRAM_DERS_ADI, PROGRAM_DERSLERI, SINIFLAR } from "@/data/mufredat/programlar";
import ComposerClient from "./ComposerClient";

export const metadata = {
  title: "Yeni Oyun Oluştur — Dersera",
  description: "Birkaç seçimle müfredata bağlı eğitsel macera oyunu oluşturun.",
};

export default function ComposerPage() {
  return (
    <ComposerClient
      siniflar={[...SINIFLAR]}
      dersler={PROGRAM_DERSLERI.map((key) => ({ key, ad: PROGRAM_DERS_ADI[key] }))}
      konular={getKonuSecenekleri()}
    />
  );
}

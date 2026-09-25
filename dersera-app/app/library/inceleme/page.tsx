import IncelemeClient from "./IncelemeClient";
import OgretmenGerekli from "@/components/OgretmenGerekli";
import { sayfaHesabi } from "@/lib/sayfaOturumu";

export const metadata = {
  title: "Topluluk İncelemesi — Dersera",
  description: "Meslektaşlarının topluluğa gönderdiği oyunları incele.",
};

export default async function IncelemePage() {
  if (!(await sayfaHesabi())) return <OgretmenGerekli baslik="Topluluk İncelemesi" />;
  return <IncelemeClient />;
}

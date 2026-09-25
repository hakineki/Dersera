import KopyaKaydiClient from "./KopyaKaydiClient";

export const metadata = {
  title: "Kopya kaydı — Dersera",
  description: "Başka öğretmenlere ait oyunların açılma kaydı (yalnız platform yöneticisi).",
};

export default function KopyaKaydiPage() {
  return <KopyaKaydiClient />;
}

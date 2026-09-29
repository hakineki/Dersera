import OgretmenlerClient from "./OgretmenlerClient";

export const metadata = {
  title: "Öğretmenler — Dersera",
  description: "Öğretmen hesaplarını arama, askıya alma ve silme (yalnız platform yöneticisi).",
};

export default function OgretmenlerPage() {
  return <OgretmenlerClient />;
}

import YonetimClient from "./YonetimClient";

export const metadata = {
  title: "Yönetim — Dersera",
  description: "Platform yöneticisinin genel bakışı: özet sayılar, sistem sağlığı ve yönetim bölümleri.",
};

export default function YonetimPage() {
  return <YonetimClient />;
}

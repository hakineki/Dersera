import IncelemeClient from "./IncelemeClient";

export const metadata = {
  title: "Topluluk İncelemesi — Dersera",
  description: "Meslektaşlarının topluluğa gönderdiği oyunları incele.",
};

export default function IncelemePage() {
  return <IncelemeClient />;
}

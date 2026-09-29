import YzMaliyetClient from "./YzMaliyetClient";

export const metadata = {
  title: "Yapay zekâ maliyeti — Dersera",
  description: "Ücretli yapay zekâ çağrılarının aylık kullanımı ve tahmini maliyeti (yalnız platform yöneticisi).",
};

export default function YzMaliyetPage() {
  return <YzMaliyetClient />;
}

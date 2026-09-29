import OkullarClient from "./OkullarClient";

export const metadata = {
  title: "Okullar — Dersera",
  description: "Okulların üyeleri, yöneticiliği devretme ve okulu kapatma (yalnız platform yöneticisi).",
};

export default function OkullarPage() {
  return <OkullarClient />;
}

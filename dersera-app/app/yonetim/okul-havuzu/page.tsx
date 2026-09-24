import OkulHavuzuClient from "./OkulHavuzuClient";

export const metadata = {
  title: "Okul kredi havuzları — Dersera",
  description: "Okullara aylık kredi havuzu atama (yalnız platform yöneticisi).",
};

export default function OkulHavuzuPage() {
  return <OkulHavuzuClient />;
}

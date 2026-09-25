import DemoClient from "./DemoClient";

export const metadata = {
  title: "Öğrenci gözüyle demo — Dersera",
  description: "Öğretmen oyunu öğrencinin göreceği ekranla dener; sonuç kaydedilmez.",
};

export default function DemoPage() {
  return <DemoClient />;
}

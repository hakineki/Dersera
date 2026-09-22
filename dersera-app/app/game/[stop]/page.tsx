import { getStop, stops } from "@/data/stops";
import GameWrapper from "./GameWrapper";

interface Props {
  params: Promise<{ stop: string }>;
  searchParams: Promise<{ aylar?: string }>;
}

export async function generateStaticParams() {
  return stops.map((s) => ({ stop: s.id }));
}

export async function generateMetadata({ params }: Props) {
  const { stop: stopId } = await params;
  const stop = getStop(stopId);
  if (!stop) return { title: "Okulun Şifresi" };
  return {
    title: `Durak ${stop.order}: ${stop.name} — Okulun Şifresi`,
    description: `${stop.subject} sorusunu çöz ve bir sonraki durağa geç!`,
  };
}

export default async function GamePage({ params, searchParams }: Props) {
  const { stop: stopId } = await params;
  const { aylar: aylarParam = "eylul" } = await searchParams;
  const aylar = aylarParam.split(",").filter(Boolean);
  return <GameWrapper stopId={stopId} aylar={aylar} />;
}

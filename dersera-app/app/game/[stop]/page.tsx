import { getStop, stops } from "@/data/stops";
import { notFound } from "next/navigation";
import GameWrapper from "./GameWrapper";

interface Props {
  params: Promise<{ stop: string }>;
}

export async function generateStaticParams() {
  return stops.map((s) => ({ stop: s.id }));
}

export async function generateMetadata({ params }: Props) {
  const { stop: stopId } = await params;
  const stop = getStop(stopId);
  if (!stop) return { title: "Bulunamadı" };
  return {
    title: `Durak ${stop.order}: ${stop.name} — Okulun Şifresi`,
    description: `${stop.subject} sorusunu çöz ve bir sonraki durağa geç!`,
  };
}

export default async function GamePage({ params }: Props) {
  const { stop: stopId } = await params;
  const stop = getStop(stopId);
  if (!stop) notFound();
  return <GameWrapper stop={stop} />;
}

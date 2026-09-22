import { getStop, stops } from "@/data/stops";
import { notFound } from "next/navigation";
import GameWrapper from "./GameWrapper";

interface Props {
  params: Promise<{ stop: string }>;
  searchParams: Promise<{ ay?: string }>;
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

export default async function GamePage({ params, searchParams }: Props) {
  const { stop: stopId } = await params;
  const { ay = "eylul" } = await searchParams;
  const stop = getStop(stopId);
  if (!stop) notFound();
  return <GameWrapper stop={stop} ay={ay} />;
}

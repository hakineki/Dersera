import { NextResponse } from "next/server";
import { oturumKapat } from "@/lib/auth";
import { getAuthStore } from "@/lib/authStore";
import { kokenReddi, oturumBelirteci, oturumCereziSil } from "@/lib/authRequest";

export async function POST(req: Request) {
  const koken = kokenReddi(req, false);
  if (koken) return koken;
  try {
    await oturumKapat(getAuthStore(), oturumBelirteci(req));
  } catch (err) {
    console.error("[auth] çıkış hatası", err instanceof Error ? err.message : err);
  }
  return oturumCereziSil(NextResponse.json({ ok: true }));
}

import { tryRegister } from "@/lib/nicknames";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const nickname =
    body && typeof body === "object" && "nickname" in body
      ? (body as { nickname: unknown }).nickname
      : undefined;

  if (typeof nickname !== "string") {
    return NextResponse.json({ error: "Geçersiz kod" }, { status: 400 });
  }

  const trimmed = nickname.trim();
  if (trimmed.length < 2 || trimmed.length > 20) {
    return NextResponse.json(
      { error: "Kod 2–20 karakter arasında olmalı" },
      { status: 422 }
    );
  }

  if (!/^[a-zA-ZÇçĞğİıÖöŞşÜü0-9_-]+$/.test(trimmed)) {
    return NextResponse.json(
      { error: "Kod yalnızca harf, rakam, _ ve - içerebilir" },
      { status: 422 }
    );
  }

  if (!tryRegister(trimmed)) {
    return NextResponse.json({ error: "Bu kod kullanımda" }, { status: 409 });
  }

  return NextResponse.json({ ok: true, nickname: trimmed }, { status: 201 });
}

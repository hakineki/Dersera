import { NextResponse } from "next/server";
import { hesapOzeti, kullaniciAdiDegistir } from "@/lib/auth";
import { getAuthStore } from "@/lib/authStore";
import { denemeOnKontrol, hataliDenemeKaydet, istekHesabi, jsonGovde, kokenReddi, oturumGerekli } from "@/lib/authRequest";

export async function POST(req: Request) {
  const koken = kokenReddi(req);
  if (koken) return koken;
  const hesap = await istekHesabi(req);
  if (!hesap) return oturumGerekli();
  const sinir = await denemeOnKontrol(req, "giris", hesap.kullaniciAdi);
  if (sinir) return sinir;
  const b = await jsonGovde(req);
  try {
    const r = await kullaniciAdiDegistir(getAuthStore(), hesap, b.yeniKullaniciAdi, b.sifre);
    if (!r.ok) {
      if (r.status === 403) await hataliDenemeKaydet(req, hesap.kullaniciAdi);
      return NextResponse.json({ error: r.error }, { status: r.status });
    }
    return NextResponse.json({ hesap: hesapOzeti(r.value) });
  } catch (err) {
    console.error("[auth] kullanıcı adı değiştirme hatası", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Kullanıcı adı şu anda değiştirilemedi." }, { status: 503 });
  }
}

import { cookies } from "next/headers";
import { OTURUM_CEREZI, oturumHesabi } from "@/lib/auth";
import { getAuthStore, type Hesap } from "@/lib/authStore";

// Sunucu bileşeninde oturumdaki öğretmen (yoksa ya da okunamazsa null). Sayfayı istek anında oluşturur: öğretmene
// açık içerik (QR kodları, topluluk) giriş yapmayana hiç gönderilmez.
export async function sayfaHesabi(): Promise<Hesap | null> {
  const belirtec = (await cookies()).get(OTURUM_CEREZI)?.value ?? null;
  try {
    return await oturumHesabi(getAuthStore(), belirtec);
  } catch (err) {
    console.error("[auth] sayfa oturumu okunamadı", err instanceof Error ? err.message : err);
    return null;
  }
}

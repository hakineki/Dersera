import { defaultGameStop } from "@/lib/games";

// Route modülleri ve depo tekilleri aynı izole kayıtta yüklenir; her test temiz bellek deposuyla başlar.
export async function buildApi() {
  let mods!: {
    games: typeof import("@/app/api/games/route");
    game: typeof import("@/app/api/games/[code]/route");
    end: typeof import("@/app/api/games/[code]/end/route");
    join: typeof import("@/app/api/games/[code]/join/route");
    results: typeof import("@/app/api/results/route");
    library: typeof import("@/app/api/library/route");
    libraryItem: typeof import("@/app/api/library/[id]/route");
    libraryPublish: typeof import("@/app/api/library/[id]/publish/route");
    libraryStore: typeof import("@/lib/libraryStore");
    libraryService: typeof import("@/lib/libraryService");
    libraryTasi: typeof import("@/app/api/library/tasi/route");
    kayit: typeof import("@/app/api/auth/kayit/route");
    giris: typeof import("@/app/api/auth/giris/route");
    cikis: typeof import("@/app/api/auth/cikis/route");
    ben: typeof import("@/app/api/auth/ben/route");
    sifre: typeof import("@/app/api/auth/sifre/route");
    ad: typeof import("@/app/api/auth/ad/route");
    authStore: typeof import("@/lib/authStore");
  };
  await jest.isolateModulesAsync(async () => {
    mods = {
      games: await import("@/app/api/games/route"),
      game: await import("@/app/api/games/[code]/route"),
      end: await import("@/app/api/games/[code]/end/route"),
      join: await import("@/app/api/games/[code]/join/route"),
      results: await import("@/app/api/results/route"),
      library: await import("@/app/api/library/route"),
      libraryItem: await import("@/app/api/library/[id]/route"),
      libraryPublish: await import("@/app/api/library/[id]/publish/route"),
      libraryStore: await import("@/lib/libraryStore"),
      libraryService: await import("@/lib/libraryService"),
      libraryTasi: await import("@/app/api/library/tasi/route"),
      kayit: await import("@/app/api/auth/kayit/route"),
      giris: await import("@/app/api/auth/giris/route"),
      cikis: await import("@/app/api/auth/cikis/route"),
      ben: await import("@/app/api/auth/ben/route"),
      sifre: await import("@/app/api/auth/sifre/route"),
      ad: await import("@/app/api/auth/ad/route"),
      authStore: await import("@/lib/authStore"),
    };
  });
  return {
    ...mods,
    params: (code: string) => ({ params: Promise.resolve({ code }) }),
    idParams: (id: string) => ({ params: Promise.resolve({ id }) }),
  };
}

export function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function samplePublish(overrides: Record<string, unknown> = {}) {
  return {
    durationMinutes: 60,
    aylar: ["eylul"],
    stops: [0, 1, 2].map((i) => defaultGameStop(i)),
    ...overrides,
  };
}

// Set-Cookie başlığından "ad=değer" çifti (Cookie başlığında gönderilecek biçim).
export function oturumCerezi(res: Response): string | null {
  const c = res.headers.get("set-cookie");
  return c ? c.split(";")[0] : null;
}

export function cerezli(req: Request, cerez: string | null): Request {
  if (cerez) req.headers.set("cookie", cerez);
  return req;
}

// Yeni hesap açar ve oturum çerezini döndürür.
export async function hesapAc(api: Awaited<ReturnType<typeof buildApi>>, kullaniciAdi: string, sifre = "gizli-sifre-1"): Promise<string> {
  const res = await api.kayit.POST(jsonRequest("/api/auth/kayit", { kullaniciAdi, sifre }));
  if (res.status !== 201) throw new Error(`hesap açılamadı: ${res.status}`);
  return oturumCerezi(res)!;
}

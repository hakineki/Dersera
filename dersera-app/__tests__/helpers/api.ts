import { defaultGameStop } from "@/lib/games";

// Route modülleri ve depo tekilleri aynı izole kayıtta yüklenir; her test temiz bellek deposuyla başlar.
export async function buildApi() {
  let mods!: {
    games: typeof import("@/app/api/games/route");
    game: typeof import("@/app/api/games/[code]/route");
    end: typeof import("@/app/api/games/[code]/end/route");
    join: typeof import("@/app/api/games/[code]/join/route");
    results: typeof import("@/app/api/results/route");
  };
  await jest.isolateModulesAsync(async () => {
    mods = {
      games: await import("@/app/api/games/route"),
      game: await import("@/app/api/games/[code]/route"),
      end: await import("@/app/api/games/[code]/end/route"),
      join: await import("@/app/api/games/[code]/join/route"),
      results: await import("@/app/api/results/route"),
    };
  });
  return { ...mods, params: (code: string) => ({ params: Promise.resolve({ code }) }) };
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

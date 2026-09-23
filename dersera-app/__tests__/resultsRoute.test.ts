const ENV_KEYS = ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];

type RouteModule = typeof import("@/app/api/results/route");

async function loadRoute(): Promise<RouteModule> {
  let mod!: RouteModule;
  await jest.isolateModulesAsync(async () => {
    mod = await import("@/app/api/results/route");
  });
  return mod;
}

function post(body: string) {
  return new Request("http://localhost/api/results", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

const valid = {
  nickname: "Kartal",
  netSeconds: 540,
  penaltySeconds: 15,
  hintsUsed: 1,
  completedAt: 1_790_000_000_000,
  stopDetails: { bahce: { hintsUsed: 1, completedAt: 1_789_999_000_000 } },
};

describe("/api/results", () => {
  let route: RouteModule;

  beforeEach(async () => {
    ENV_KEYS.forEach((k) => delete process.env[k]);
    route = await loadRoute();
  });

  it("GET başlangıçta boş liste ve persistent=false döndürür", async () => {
    const res = await route.GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [], persistent: false });
  });

  it("geçerli POST 201 döner ve GET'te görünür", async () => {
    const res = await route.POST(post(JSON.stringify(valid)));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });

    const list = await (await route.GET()).json();
    expect(list.results).toEqual([valid]);
  });

  it("aynı öğrencinin tekrar gönderimi çift kayıt oluşturmaz", async () => {
    await route.POST(post(JSON.stringify(valid)));
    await route.POST(post(JSON.stringify(valid)));
    const list = await (await route.GET()).json();
    expect(list.results).toHaveLength(1);
  });

  it("birden çok öğrenciyi toplam süreye göre sıralar", async () => {
    await route.POST(post(JSON.stringify({ ...valid, nickname: "Yavas", netSeconds: 900 })));
    await route.POST(post(JSON.stringify({ ...valid, nickname: "Hizli", netSeconds: 300 })));
    const list = await (await route.GET()).json();
    expect(list.results.map((e: { nickname: string }) => e.nickname)).toEqual(["Hizli", "Yavas"]);
  });

  it("bozuk JSON'a 400 döner", async () => {
    const res = await route.POST(post("{bozuk"));
    expect(res.status).toBe(400);
  });

  it("şemaya uymayan gövdeye 422 döner ve kaydetmez", async () => {
    const res = await route.POST(post(JSON.stringify({ ...valid, netSeconds: -5 })));
    expect(res.status).toBe(422);
    const list = await (await route.GET()).json();
    expect(list.results).toEqual([]);
  });

  it("depolama hatasında 503 döner", async () => {
    process.env.KV_REST_API_URL = "https://redis.test";
    process.env.KV_REST_API_TOKEN = "tok";
    const realFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error("ağ yok")) as unknown as typeof fetch;
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const failing = await loadRoute();
      expect((await failing.POST(post(JSON.stringify(valid)))).status).toBe(503);
      expect((await failing.GET()).status).toBe(503);
    } finally {
      global.fetch = realFetch;
      spy.mockRestore();
    }
  });
});

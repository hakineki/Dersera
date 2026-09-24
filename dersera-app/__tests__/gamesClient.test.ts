import { publishGameRequest } from "@/lib/gamesClient";
import { samplePublish } from "./helpers/api";

describe("publishGameRequest", () => {
  const gercekFetch = global.fetch;
  afterEach(() => {
    global.fetch = gercekFetch;
  });
  const yanit = (status: number, body: unknown) => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
  };

  it("başarıda yayın yanıtını döndürür", async () => {
    yanit(201, { game: { code: "ABC-123" }, adminToken: "t", persistent: true });
    expect(await publishGameRequest(samplePublish())).toMatchObject({ adminToken: "t" });
  });

  it("içerik denetimi reddinde gerekçeler öğretmene gösterilecek hata metnine eklenir", async () => {
    yanit(422, { error: "Oyun içerik denetiminden geçmedi; yayınlanamaz", bulgular: [{ mesaj: '2. durak · hikâye: "siktir" ifadesi …' }] });
    const r = await publishGameRequest(samplePublish());
    expect(r).toEqual({ error: 'Oyun içerik denetiminden geçmedi; yayınlanamaz 2. durak · hikâye: "siktir" ifadesi …' });
  });

  it("ağ hatasında ve gövdesiz hatada genel mesaj", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("ağ");
    }) as typeof fetch;
    expect(await publishGameRequest(samplePublish())).toEqual({ error: expect.stringMatching(/Bağlantını kontrol/) });
    global.fetch = jest.fn(async () => new Response("bozuk", { status: 503 })) as typeof fetch;
    expect(await publishGameRequest(samplePublish())).toEqual({ error: expect.stringMatching(/Bağlantını kontrol/) });
  });
});

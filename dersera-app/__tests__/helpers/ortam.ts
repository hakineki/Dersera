// Tüm testler için ortam: en kısa oynama süresi denetimi kapalı (ilgili testler kendisi açar).
process.env.DERSERA_EN_AZ_OYUN_SN = "0";

// Testler ücretli yapay zekâ servislerine gerçek istek atamaz: taklit edilmemiş bir çağrı hemen ağ hatasıyla düşer.
const gercekFetch = globalThis.fetch;
globalThis.fetch = (async (girdi: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof girdi === "string" ? girdi : girdi instanceof URL ? girdi.href : girdi.url;
  if (/api\.(anthropic|openai)\.com/.test(url)) throw new TypeError(`Testte yapay zekâ servisine istek yapılamaz: ${url}`);
  return gercekFetch(girdi, init);
}) as typeof fetch;

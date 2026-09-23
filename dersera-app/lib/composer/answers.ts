import { CEVAP_AYRACI, ESLESTIRME_AYRACI, type GorevTuru } from "@/lib/composer/definition";

export function normalize(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
}

export function splitAnswer(s: string): string[] {
  return s.split(CEVAP_AYRACI.trim()).map((p) => p.trim()).filter(Boolean);
}

export function joinAnswer(parts: string[]): string {
  return parts.join(CEVAP_AYRACI);
}

export function parseNumber(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

export function splitPair(s: string): [string, string] | null {
  const i = s.indexOf(ESLESTIRME_AYRACI.trim());
  if (i <= 0) return null;
  const left = s.slice(0, i).trim();
  const right = s.slice(i + ESLESTIRME_AYRACI.trim().length).trim();
  return left && right ? [left, right] : null;
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a.map(normalize)].sort().join("\u0000") === [...b.map(normalize)].sort().join("\u0000");

const unique = (a: string[]) => new Set(a.map(normalize)).size === a.length;

// Görevin cevap biçimi tutarlı mı? Tutarsızsa açıklama döner.
export function answerFormatError(tur: GorevTuru, secenekler: string[], dogru: string): string | null {
  if (!dogru.trim()) return "doğru cevap boş";
  switch (tur) {
    case "coktan_secmeli":
    case "gorsel_secim":
      if (secenekler.length < 2 || secenekler.length > 5) return "2-5 seçenek olmalı";
      if (!unique(secenekler)) return "seçenekler tekrar ediyor";
      if (!secenekler.some((s) => normalize(s) === normalize(dogru))) return "doğru cevap seçenekler arasında yok";
      return null;
    case "siralama":
    case "surukle_birak": {
      if (secenekler.length < 3 || secenekler.length > 6) return "3-6 öğe olmalı";
      if (!unique(secenekler)) return "öğeler tekrar ediyor";
      if (!sameSet(splitAnswer(dogru), secenekler)) return "doğru sıra, öğelerin tamamını içermiyor";
      return null;
    }
    case "eslestirme": {
      if (secenekler.length < 3 || secenekler.length > 5) return "3-5 çift olmalı";
      const pairs = secenekler.map(splitPair);
      if (pairs.some((p) => p === null)) return "her çift 'sol => sağ' biçiminde olmalı";
      const ok = pairs as [string, string][];
      if (!unique(ok.map((p) => p[0])) || !unique(ok.map((p) => p[1]))) return "eşleştirmede tekrar eden taraf var";
      if (!sameSet(splitAnswer(dogru), secenekler)) return "doğru cevap, çiftlerin tamamını içermiyor";
      return null;
    }
    case "sayisal":
      if (secenekler.length !== 0) return "sayısal görevde seçenek olmamalı";
      if (parseNumber(dogru) === null) return "sayısal doğru cevap bir sayı olmalı";
      return null;
  }
}

export function isCorrect(tur: GorevTuru, dogru: string, verilen: string): boolean {
  switch (tur) {
    case "sayisal": {
      const a = parseNumber(dogru);
      const b = parseNumber(verilen);
      return a !== null && b !== null && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));
    }
    case "siralama":
    case "surukle_birak": {
      const a = splitAnswer(dogru).map(normalize);
      const b = splitAnswer(verilen).map(normalize);
      return a.length === b.length && a.every((x, i) => x === b[i]);
    }
    case "eslestirme":
      return sameSet(splitAnswer(dogru), splitAnswer(verilen));
    default:
      return normalize(dogru) === normalize(verilen);
  }
}

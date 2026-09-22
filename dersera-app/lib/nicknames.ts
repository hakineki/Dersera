// Server-side in-memory nickname registry.
// Resets on server restart — appropriate for single-session classroom use.
const registry = new Map<string, number>(); // normalizedKey → registeredAt

function normalize(nickname: string): string {
  return nickname.trim().toLowerCase();
}

export function tryRegister(nickname: string): boolean {
  const key = normalize(nickname);
  if (registry.has(key)) return false;
  registry.set(key, Date.now());
  return true;
}

export function release(nickname: string): void {
  registry.delete(normalize(nickname));
}

export function listAll(): string[] {
  return [...registry.keys()];
}

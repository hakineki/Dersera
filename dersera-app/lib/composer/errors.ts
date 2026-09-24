export type ComposeFailure = "config" | "timeout" | "upstream" | "invalid-output";

export class ComposeError extends Error {
  constructor(
    public readonly reason: ComposeFailure,
    message: string,
    // Çıktı token sınırında kesildi: yeniden deneme daha yüksek sınırla yapılır.
    public readonly kesildi = false
  ) {
    super(message);
  }
}

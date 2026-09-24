export type ComposeFailure = "config" | "timeout" | "upstream" | "invalid-output";

export class ComposeError extends Error {
  constructor(
    public readonly reason: ComposeFailure,
    message: string
  ) {
    super(message);
  }
}

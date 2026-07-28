export class HermesRuntimeError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "HermesRuntimeError";
  }
}

export class AuthApplicationError extends Error {
  constructor(
    readonly status: 400 | 401 | 409,
    message: string,
  ) {
    super(message);
    this.name = "AuthApplicationError";
  }
}

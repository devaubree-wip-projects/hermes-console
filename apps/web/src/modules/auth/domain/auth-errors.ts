export class AuthApplicationError extends Error {
  constructor(
    // 403 : l'identité est recevable, c'est l'autorisation qui manque —
    // s'inscrire sans invitation sur une Console qui n'est pas en libre-service.
    readonly status: 400 | 401 | 403 | 409,
    message: string,
  ) {
    super(message);
    this.name = "AuthApplicationError";
  }
}

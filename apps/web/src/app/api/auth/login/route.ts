import { clientIp, rateLimit, tooManyRequestsResponse } from "@/lib/rate-limit";
import { AuthApplicationError } from "@/modules/auth/domain/auth-errors";
import { authenticateUser } from "@/modules/auth/infrastructure/auth-service";

export async function POST(request: Request) {
  const limited = rateLimit(`login:${clientIp(request)}`, { limit: 10, windowMs: 60_000 });
  if (!limited.ok) return tooManyRequestsResponse(limited.retryAfterSeconds);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }
  try {
    return Response.json(await authenticateUser((body ?? {}) as Record<string, unknown>));
  } catch (error) {
    if (error instanceof AuthApplicationError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

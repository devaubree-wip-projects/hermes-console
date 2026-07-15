import { AuthApplicationError } from "@/modules/auth/domain/auth-errors";
import { registerUser } from "@/modules/auth/infrastructure/auth-service";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }
  try {
    return Response.json(await registerUser((body ?? {}) as Record<string, unknown>));
  } catch (error) {
    if (error instanceof AuthApplicationError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

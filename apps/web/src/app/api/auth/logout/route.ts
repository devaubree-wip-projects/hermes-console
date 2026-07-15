import { signOut } from "@/modules/auth/infrastructure/auth-service";

export async function POST() {
  return Response.json(await signOut());
}

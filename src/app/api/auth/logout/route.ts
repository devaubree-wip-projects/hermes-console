import { destroyAuthSession } from "@/lib/auth";

export async function POST() {
  await destroyAuthSession();
  return Response.json({ ok: true });
}

import { getCurrentUser, destroyAuthSession } from "@/lib/auth";
import { deleteAccount } from "@/lib/tenant-deletion";

// GDPR erasure (art. 17): the signed-in user deletes their own account and every
// organization they own. Irreversible.
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Authentification requise." }, { status: 401 });
  }
  await deleteAccount(user.id);
  await destroyAuthSession();
  return Response.json({ ok: true });
}

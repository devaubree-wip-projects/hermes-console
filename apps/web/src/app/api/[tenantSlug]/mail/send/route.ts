import { z } from "zod";
import { NextResponse } from "next/server";
import { envoieMessage } from "@/modules/mail/infrastructure/mail-service";
import { mailErrorResponse, readJson, resolveMailContext } from "@/modules/mail/presentation/http";

// Envoyer engage le tenant vis-à-vis d'un tiers : le rôle exigé est celui qui
// peut déjà écrire dans le workspace, pas la simple lecture.
// `nature` par défaut à `prospection` : une requête qui ne dit rien tombe sous le
// régime le plus strict plutôt que d'échapper aux mentions par omission.
const schema = z.object({
  destinataire: z.string().min(3).max(320),
  sujet: z.string().min(1).max(240),
  texte: z.string().min(1).max(40_000),
  nature: z.enum(["prospection", "relation_client"]).default("prospection"),
  source: z.string().min(1).max(2_048).nullish().transform((v) => v ?? null),
  provider: z.enum(["smtp", "brevo", "resend"]).optional(),
  agentId: z.string().uuid().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ tenantSlug: string }> }) {
  try {
    const { tenantSlug } = await params;
    const context = await resolveMailContext(tenantSlug, "member");
    const { agentId, ...demande } = schema.parse(await readJson(request));
    const resultat = await envoieMessage({
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      agentId: agentId ?? null,
      demande,
    });
    if (!resultat.ok)
      return NextResponse.json({ error: resultat.message, raison: resultat.raison }, { status: resultat.status });
    return NextResponse.json(resultat, { status: 201 });
  } catch (error) {
    return mailErrorResponse(error);
  }
}

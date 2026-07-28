import { z } from "zod";
import { NextResponse } from "next/server";
import { resolveConsoleAgentByProfile } from "@/modules/agents/infrastructure/profile-agent-resolver";
import { envoieMessage } from "@/modules/mail/infrastructure/mail-service";
import { RuntimeAuthError } from "@/modules/work/infrastructure/runtime-auth";
import { readRuntimeWorkRequest } from "@/modules/work/presentation/runtime-http";

// Le chemin par lequel un agent demande à écrire à un tiers. L'agent ne prouve
// pas son identité lui-même : l'Edge signe pour le profil qu'il héberge, et
// c'est ce couple (installation, profil) qui désigne l'agent en base. Révoquer
// l'Edge retire donc la capacité d'envoyer, sans avoir à distribuer ni à
// reprendre le moindre jeton dans le runtime.
const schema = z.object({
  installationId: z.string().uuid().optional(),
  profile: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/),
  destinataire: z.string().min(3).max(320),
  sujet: z.string().min(1).max(240),
  texte: z.string().min(1).max(40_000),
  // Un agent qui ne déclare rien prospecte : l'omission ne doit pas être le
  // chemin le plus court pour se passer des mentions d'origine.
  nature: z.enum(["prospection", "relation_client"]).default("prospection"),
  source: z.string().min(1).max(2_048).nullish().transform((v) => v ?? null),
  provider: z.enum(["smtp", "brevo", "resend"]).optional(),
});

export async function POST(request: Request) {
  try {
    const { body, auth } = await readRuntimeWorkRequest(request);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new RuntimeAuthError(400, "Commande d'envoi invalide.");
    if (parsed.data.profile !== auth.profile)
      throw new RuntimeAuthError(401, "Profil Hermes incohérent.");

    const resolution = await resolveConsoleAgentByProfile({
      installationIds: [auth.installation.id],
      profile: parsed.data.profile,
    });
    if (!resolution.ok)
      return NextResponse.json({ error: resolution.message }, { status: resolution.status });

    const { profile: _profile, installationId: _installationId, ...demande } = parsed.data;
    const resultat = await envoieMessage({
      tenantId: resolution.agent.tenantId,
      workspaceId: resolution.agent.workspaceId,
      agentId: resolution.agent.agentId,
      // Personne n'a cliqué : l'acte est celui de l'agent, et la piste d'audit
      // doit le dire plutôt que d'imputer l'envoi à qui a créé l'agent.
      actorUserId: null,
      demande,
    });
    if (!resultat.ok)
      return NextResponse.json({ error: resultat.message, raison: resultat.raison }, { status: resultat.status });
    return NextResponse.json(resultat, { status: 201 });
  } catch (error) {
    if (error instanceof RuntimeAuthError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("runtime mail send failed", error);
    return NextResponse.json({ error: "Envoi impossible." }, { status: 500 });
  }
}

import { z } from "zod";
import { NextResponse } from "next/server";
import {
  AGENT_DESCRIPTION_MAX_LENGTH,
  AGENT_NAME_MAX_LENGTH,
} from "@/modules/agents/application/create-agent";
import {
  AgentIngressError,
  createTelegramAgent,
  listTelegramAgents,
} from "@/modules/agents/infrastructure/telegram-agent-ingress";
import { RuntimeAuthError } from "@/modules/work/infrastructure/runtime-auth";
import { readRuntimeWorkRequest } from "@/modules/work/presentation/runtime-http";

const schema = z.object({
  installationId: z.string().uuid().optional(),
  profile: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/),
  // Absent lists the tenant's agents; present creates one.
  name: z.string().min(1).max(AGENT_NAME_MAX_LENGTH).optional(),
  mission: z.string().max(AGENT_DESCRIPTION_MAX_LENGTH).optional(),
  telegramUserId: z.string().regex(/^\d{1,32}$/),
  telegramChatId: z.string().regex(/^-?\d{1,32}$/),
});

export async function POST(request: Request) {
  try {
    const { body, auth } = await readRuntimeWorkRequest(request);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new RuntimeAuthError(400, "Commande agent invalide.");
    if (parsed.data.profile !== auth.profile)
      throw new RuntimeAuthError(401, "Profil Hermes incohérent.");

    const target = { ...parsed.data, installationIds: [auth.installation.id] };
    const result = parsed.data.name === undefined
      ? await listTelegramAgents(target)
      : await createTelegramAgent({
        ...target,
        name: parsed.data.name,
        mission: parsed.data.mission ?? "",
      });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof RuntimeAuthError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof AgentIngressError)
      return NextResponse.json(
        { error: error.message, ...(error.code ? { code: error.code } : {}) },
        { status: error.status },
      );
    console.error("runtime agent request failed", error);
    return NextResponse.json({ error: "Création d’agent impossible." }, { status: 500 });
  }
}

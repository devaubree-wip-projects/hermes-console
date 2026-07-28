import { z } from "zod";
import { NextResponse } from "next/server";
import { MISSION_MAX_LENGTH } from "@/lib/hermes/mission";
import {
  MissionIngressError,
  readTelegramAgentMission,
  updateTelegramAgentMission,
} from "@/modules/agents/infrastructure/telegram-mission-ingress";
import { RuntimeAuthError } from "@/modules/work/infrastructure/runtime-auth";
import { readRuntimeWorkRequest } from "@/modules/work/presentation/runtime-http";

const schema = z.object({
  installationId: z.string().uuid().optional(),
  profile: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/),
  // Absent reads the current mission; present replaces it, empty clears it.
  mission: z.string().max(MISSION_MAX_LENGTH).optional(),
  telegramUserId: z.string().regex(/^\d{1,32}$/),
  telegramChatId: z.string().regex(/^-?\d{1,32}$/),
});

export async function POST(request: Request) {
  try {
    const { body, auth } = await readRuntimeWorkRequest(request);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new RuntimeAuthError(400, "Commande mission invalide.");
    if (parsed.data.profile !== auth.profile)
      throw new RuntimeAuthError(401, "Profil Hermes incohérent.");

    const target = { ...parsed.data, installationIds: [auth.installation.id] };
    const result =
      parsed.data.mission === undefined
        ? await readTelegramAgentMission(target)
        : await updateTelegramAgentMission({ ...target, mission: parsed.data.mission });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof RuntimeAuthError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof MissionIngressError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("runtime mission request failed", error);
    return NextResponse.json({ error: "Opération mission impossible." }, { status: 500 });
  }
}

import { z } from "zod";
import { NextResponse } from "next/server";
import { RuntimeAuthError } from "@/modules/work/infrastructure/runtime-auth";
import { createTelegramWorkItem } from "@/modules/work/infrastructure/telegram-work-ingress";
import {
  readRuntimeWorkRequest,
  runtimeWorkErrorResponse,
} from "@/modules/work/presentation/runtime-http";

const telegramId = z.string().regex(/^\d{1,32}$/);
const schema = z.object({
  installationId: z.string().uuid().optional(),
  profile: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/),
  title: z.string().trim().min(1).max(240),
  description: z.string().max(40_000),
  telegramUserId: telegramId,
  telegramChatId: z.string().regex(/^-?\d{1,32}$/),
  telegramMessageId: telegramId.optional(),
  telegramUpdateId: z.number().int().nonnegative().optional(),
});

export async function POST(request: Request) {
  try {
    const { body, auth } = await readRuntimeWorkRequest(request);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new RuntimeAuthError(400, "Commande Telegram invalide.");
    }
    if (parsed.data.profile !== auth.profile) {
      throw new RuntimeAuthError(401, "Profil Hermes incohérent.");
    }
    const { item, run } = await createTelegramWorkItem({
      ...parsed.data,
      installationIds: [auth.installation.id],
    });
    return NextResponse.json(
      {
        ok: true,
        item: { id: item.id, key: item.key },
        run: run ? { id: run.id } : null,
      },
      { status: 201 },
    );
  } catch (error) {
    return runtimeWorkErrorResponse(error);
  }
}

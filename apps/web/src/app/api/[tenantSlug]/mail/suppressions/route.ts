import { z } from "zod";
import { NextResponse } from "next/server";
import { enregistreOpposition } from "@/modules/mail/infrastructure/mail-service";
import { mailErrorResponse, readJson, resolveMailContext } from "@/modules/mail/presentation/http";

// Le « STOP » promis dans chaque message doit avoir une destination. Sans cette
// route, la mention légale est un mensonge : un membre qui reçoit une demande
// d'opposition n'aurait aucun moyen de l'honorer.
const schema = z.object({
  address: z.string().email().max(320),
  reason: z.enum(["unsubscribe", "bounce", "manual"]).default("unsubscribe"),
});

export async function POST(request: Request, { params }: { params: Promise<{ tenantSlug: string }> }) {
  try {
    const { tenantSlug } = await params;
    const context = await resolveMailContext(tenantSlug, "member");
    const body = schema.parse(await readJson(request));
    const opposition = await enregistreOpposition({
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      ...body,
    });
    return NextResponse.json(opposition, { status: 201 });
  } catch (error) {
    return mailErrorResponse(error);
  }
}

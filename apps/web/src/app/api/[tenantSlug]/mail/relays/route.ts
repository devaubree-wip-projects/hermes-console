import { z } from "zod";
import { NextResponse } from "next/server";
import { enregistreRelais, listeRelais } from "@/modules/mail/infrastructure/mail-service";
import { mailErrorResponse, readJson, resolveMailContext } from "@/modules/mail/presentation/http";

// Un relais engage la réputation d'un domaine d'envoi et porte un secret : sa
// configuration reste au propriétaire du tenant.
const schema = z.object({
  provider: z.enum(["smtp", "brevo", "resend"]),
  fromEmail: z.string().email().max(320),
  fromName: z.string().max(120).nullish(),
  replyTo: z.string().email().max(320).nullish(),
  /** Absent sur une mise à jour : le secret déjà scellé est conservé tel quel. */
  secret: z.string().min(1).max(2_048).optional(),
  transport: z
    .object({
      host: z.string().min(1).max(255),
      port: z.number().int().min(1).max(65_535),
      secure: z.boolean().optional(),
      user: z.string().max(320).optional(),
    })
    .nullish(),
  dailyLimit: z.number().int().min(1).max(10_000).optional(),
  isDefault: z.boolean().optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ tenantSlug: string }> }) {
  try {
    const { tenantSlug } = await params;
    const context = await resolveMailContext(tenantSlug, "owner");
    return NextResponse.json({ relays: await listeRelais(context.tenantId) });
  } catch (error) {
    return mailErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ tenantSlug: string }> }) {
  try {
    const { tenantSlug } = await params;
    const context = await resolveMailContext(tenantSlug, "owner");
    const body = schema.parse(await readJson(request));
    const relais = await enregistreRelais({
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      ...body,
    });
    return NextResponse.json({ relay: relais });
  } catch (error) {
    return mailErrorResponse(error);
  }
}

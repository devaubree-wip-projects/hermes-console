import { z } from "zod";
import { NextResponse } from "next/server";
import { enqueueWorkRun } from "@/modules/work/infrastructure/work-service";
import { readJson, resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

const schema = z.object({
  triggerType: z.enum(["assignment", "mention", "automation", "rerun", "api", "delegation"]).default("rerun"),
  idempotencyKey: z.string().min(8).max(200).optional(),
  parentRunId: z.string().uuid().nullable().optional(),
  agentId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ tenantSlug: string; workItemId: string }> }) {
  try {
    const { tenantSlug, workItemId } = await params;
    const context = await resolveWorkContext(tenantSlug, "member");
    // Corps vide = déclencheur par défaut (`rerun`). Un corps trop volumineux (413) ou un JSON
    // malformé (400) doit remonter tel quel : avaler l'erreur lancerait un run facturable.
    const hasBody = request.body !== null && request.headers.get("content-length") !== "0";
    const body = schema.parse(hasBody ? await readJson(request) : {});
    const result = await enqueueWorkRun({
      context,
      workItemId,
      triggerType: body.triggerType,
      idempotencyKey: body.idempotencyKey,
      parentRunId: body.parentRunId,
      forceAgentId: body.agentId,
    });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return workErrorResponse(error);
  }
}

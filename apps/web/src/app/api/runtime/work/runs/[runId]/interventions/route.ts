import { z } from "zod";
import { NextResponse } from "next/server";
import { createWorkIntervention } from "@/modules/work/infrastructure/work-runtime-service";
import { readRuntimeWorkRequest, runtimeWorkErrorResponse } from "@/modules/work/presentation/runtime-http";

const schema = z.object({
  installationId: z.string().uuid().optional(),
  leaseToken: z.string().min(32).max(128),
  requestId: z.string().min(1).max(256),
  type: z.enum(["approval", "clarification", "sudo", "secret", "launch_review", "deliverable_review"]),
  prompt: z.string().min(1).max(20_000),
  safePayload: z.record(z.string(), z.unknown()).optional(),
  expiresAt: z.iso.datetime().nullable().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const { body, auth } = await readRuntimeWorkRequest(request);
    const input = schema.parse(body);
    return NextResponse.json({ intervention: await createWorkIntervention({
      runId,
      installationId: auth.installation.id,
      leaseToken: input.leaseToken,
      requestId: input.requestId,
      type: input.type,
      prompt: input.prompt,
      safePayload: input.safePayload,
      expiresAt: input.expiresAt === null ? null : input.expiresAt ? new Date(input.expiresAt) : undefined,
    }) }, { status: 201 });
  } catch (error) { return runtimeWorkErrorResponse(error); }
}

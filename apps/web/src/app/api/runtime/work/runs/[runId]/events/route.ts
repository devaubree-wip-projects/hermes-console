import { z } from "zod";
import { NextResponse } from "next/server";
import { appendWorkRunEvents } from "@/modules/work/infrastructure/work-runtime-service";
import { readRuntimeWorkRequest, runtimeWorkErrorResponse } from "@/modules/work/presentation/runtime-http";

const eventSchema = z.object({
  sequence: z.number().int().positive(),
  type: z.string().min(1).max(128),
  payload: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.iso.datetime(),
  visibility: z.enum(["workspace", "internal"]).optional(),
});
const schema = z.object({ installationId: z.string().uuid().optional(), leaseToken: z.string().min(32).max(128), events: z.array(eventSchema).min(1).max(100) });

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const { body, auth } = await readRuntimeWorkRequest(request);
    const input = schema.parse(body);
    return NextResponse.json(await appendWorkRunEvents({ runId, installationId: auth.installation.id, leaseToken: input.leaseToken, events: input.events }));
  } catch (error) { return runtimeWorkErrorResponse(error); }
}

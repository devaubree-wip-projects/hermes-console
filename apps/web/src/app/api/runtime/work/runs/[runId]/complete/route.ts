import { z } from "zod";
import { NextResponse } from "next/server";
import { completeWorkRun } from "@/modules/work/infrastructure/work-runtime-service";
import { readRuntimeWorkRequest, runtimeWorkErrorResponse } from "@/modules/work/presentation/runtime-http";

const schema = z.object({
  installationId: z.string().uuid().optional(),
  leaseToken: z.string().min(32).max(128),
  status: z.enum(["succeeded", "failed", "cancelled"]),
  resultSummary: z.string().max(100_000).nullable().optional(),
  failureReason: z.string().max(200).nullable().optional(),
  usage: z.record(z.string(), z.unknown()).nullable().optional(),
  costMicros: z.number().int().nonnegative().nullable().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const { body, auth } = await readRuntimeWorkRequest(request);
    const input = schema.parse(body);
    return NextResponse.json({ run: await completeWorkRun({ runId, installationId: auth.installation.id, ...input }) });
  } catch (error) { return runtimeWorkErrorResponse(error); }
}

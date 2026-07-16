import { z } from "zod";
import { NextResponse } from "next/server";
import { releaseWorkRun } from "@/modules/work/infrastructure/work-runtime-service";
import { readRuntimeWorkRequest, runtimeWorkErrorResponse } from "@/modules/work/presentation/runtime-http";

const schema = z.object({ installationId: z.string().uuid().optional(), leaseToken: z.string().min(32).max(128), reason: z.string().max(200).optional() });

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const { body, auth } = await readRuntimeWorkRequest(request);
    const input = schema.parse(body);
    return NextResponse.json({ run: await releaseWorkRun({ runId, installationId: auth.installation.id, leaseToken: input.leaseToken, reason: input.reason }) });
  } catch (error) { return runtimeWorkErrorResponse(error); }
}

import { z } from "zod";
import { NextResponse } from "next/server";
import { claimWorkRuns } from "@/modules/work/infrastructure/work-runtime-service";
import { readRuntimeWorkRequest, runtimeWorkErrorResponse } from "@/modules/work/presentation/runtime-http";

const schema = z.object({
  installationId: z.string().uuid().optional(),
  edgeId: z.string().min(1).max(128),
  capacity: z.number().int().min(1).max(16).default(1),
});

export async function POST(request: Request) {
  try {
    const { body, auth } = await readRuntimeWorkRequest(request);
    const input = schema.parse(body);
    const runs: Awaited<ReturnType<typeof claimWorkRuns>> = [];
    for (const installation of auth.installations) {
      const remaining: number = input.capacity - runs.length;
      if (remaining <= 0) break;
      runs.push(...await claimWorkRuns({ installationId: installation.id, edgeId: input.edgeId, capacity: remaining }));
    }
    return NextResponse.json({ runs });
  } catch (error) { return runtimeWorkErrorResponse(error); }
}

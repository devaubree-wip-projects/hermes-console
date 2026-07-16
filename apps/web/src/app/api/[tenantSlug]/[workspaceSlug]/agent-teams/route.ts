import { z } from "zod";
import { NextResponse } from "next/server";
import {
  createWorkspaceAgentTeam,
  listWorkspaceAgentTeams,
} from "@/modules/work/infrastructure/work-service";
import {
  readJson,
  resolveWorkContext,
  workErrorResponse,
} from "@/modules/work/presentation/http";

const schema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(10_000).optional(),
  leadAgentId: z.string().uuid(),
  memberAgentIds: z.array(z.string().uuid()).max(32).optional(),
  concurrencyLimit: z.number().int().min(1).max(64).optional(),
  delegationPolicy: z
    .object({ autoDelegatePlanSteps: z.boolean().optional() })
    .optional(),
});

export async function GET(
  _: Request,
  {
    params,
  }: { params: Promise<{ tenantSlug: string; workspaceSlug: string }> },
) {
  try {
    const { tenantSlug, workspaceSlug } = await params;
    const context = await resolveWorkContext(tenantSlug, workspaceSlug);
    return NextResponse.json({
      teams: await listWorkspaceAgentTeams(context.workspaceId),
    });
  } catch (error) {
    return workErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ tenantSlug: string; workspaceSlug: string }> },
) {
  try {
    const { tenantSlug, workspaceSlug } = await params;
    const context = await resolveWorkContext(
      tenantSlug,
      workspaceSlug,
      "owner",
    );
    const body = schema.parse(await readJson(request));
    return NextResponse.json(
      { team: await createWorkspaceAgentTeam({ context, ...body }) },
      { status: 201 },
    );
  } catch (error) {
    return workErrorResponse(error);
  }
}

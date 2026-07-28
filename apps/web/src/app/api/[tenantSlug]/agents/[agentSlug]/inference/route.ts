import type { AgentRouteParams } from "@hermes-console/shared";
import { inferenceService } from "@/modules/agents/infrastructure/inference-service";

export const dynamic = "force-dynamic";

type Context = { params: Promise<AgentRouteParams> };

export async function GET(request: Request, { params }: Context) {
  const refresh = new URL(request.url).searchParams.get("refresh") !== "0";
  const response = await inferenceService.get(await params, refresh);
  return Response.json(response.body, {
    status: response.status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export async function PUT(request: Request, { params }: Context) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const response = await inferenceService.update(await params, body);
  return Response.json(response.body, { status: response.status });
}

export async function DELETE(request: Request, { params }: Context) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const response = await inferenceService.removeCredential(await params, body);
  return Response.json(response.body, { status: response.status });
}

import type { AgentRouteParams } from "@hermes-console/shared";
import { inferenceService } from "@/modules/agents/infrastructure/inference-service";

type Context = { params: Promise<AgentRouteParams> };

export async function GET(_: Request, { params }: Context) {
  const response = await inferenceService.get(await params);
  return Response.json(response.body, { status: response.status });
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

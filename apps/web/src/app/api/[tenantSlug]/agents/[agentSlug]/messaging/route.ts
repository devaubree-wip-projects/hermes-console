import type { AgentRouteParams } from "@hermes-console/shared";
import { messagingService } from "@/modules/agents/infrastructure/messaging-service";

type Context = { params: Promise<AgentRouteParams> };

export async function GET(_: Request, { params }: Context) {
  const response = await messagingService.get(await params);
  return Response.json(response.body, { status: response.status });
}

export async function PUT(request: Request, { params }: Context) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const response = await messagingService.configure(await params, body);
  return Response.json(response.body, { status: response.status });
}

export async function POST(request: Request, { params }: Context) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const response = await messagingService.action(await params, body);
  return Response.json(response.body, { status: response.status });
}

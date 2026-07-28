import type { AgentRouteParams } from "@hermes-console/shared";
import { mcpService } from "@/modules/agents/infrastructure/mcp-service";

type Context = { params: Promise<AgentRouteParams> };

export async function GET(_: Request, { params }: Context) {
  const response = await mcpService.get(await params);
  return Response.json(response.body, { status: response.status });
}

// Un seul verbe d'écriture, dispatché par `action` : les routes publiques sont
// gelées dans `contract-baseline.json`, une route REST par opération gonflerait
// la baseline de quatre chemins pour aucun gain.
export async function POST(request: Request, { params }: Context) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const response = await mcpService.command(await params, body);
  return Response.json(response.body, { status: response.status });
}

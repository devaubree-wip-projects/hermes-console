import type { AgentRouteParams } from "@hermes-console/shared";
import { codexService } from "@/modules/agents/infrastructure/codex-service";

type Context = { params: Promise<AgentRouteParams> };

function sessionId(request: Request) {
  return new URL(request.url).searchParams.get("sessionId")?.trim() ?? null;
}

export async function POST(_: Request, { params }: Context) {
  const response = await codexService.start(await params);
  return Response.json(response.body, { status: response.status });
}

export async function GET(request: Request, { params }: Context) {
  const response = await codexService.poll(await params, sessionId(request));
  return Response.json(response.body, { status: response.status });
}

export async function DELETE(request: Request, { params }: Context) {
  const url = new URL(request.url);
  const response = await codexService.disconnect(
    await params,
    url.searchParams.get("sessionId")?.trim() ?? null,
    url.searchParams.has("sessionId"),
  );
  return Response.json(response.body, { status: response.status });
}

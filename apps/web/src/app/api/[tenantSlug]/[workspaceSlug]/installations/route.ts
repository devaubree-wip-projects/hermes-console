import type { WorkspaceRouteParams } from "@hermes-console/shared";
import { connectInstallation } from "@/modules/installations/infrastructure/installation-service";

export async function POST(request: Request, { params }: { params: Promise<WorkspaceRouteParams> }) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const response = await connectInstallation(await params, body);
  return Response.json(response.body, { status: response.status });
}

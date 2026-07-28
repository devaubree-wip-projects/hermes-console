import type { InstallationRouteParams } from "@hermes-console/shared";
import {
  getInstallationDetails,
  updateInstallation,
} from "@/modules/installations/infrastructure/installation-management-adapter";

type Context = { params: Promise<InstallationRouteParams> };

export async function GET(_: Request, { params }: Context) {
  return getInstallationDetails(params);
}

export async function PATCH(request: Request, { params }: Context) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  return updateInstallation(body, params);
}

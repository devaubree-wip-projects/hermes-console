import { requireUser } from "@/lib/auth";
import { hermesFetch } from "@/lib/hermes/server";

type RuntimeStatus = {
  version?: string;
  profiles?: unknown[];
  active_sessions?: number;
};

export async function GET() {
  await requireUser();

  try {
    const status = await hermesFetch<RuntimeStatus>("/api/status");
    return Response.json({
      online: true,
      version: status.version ?? null,
      profileCount: status.profiles?.length ?? 0,
      activeSessions: status.active_sessions ?? 0,
    });
  } catch (error) {
    return Response.json({
      online: false,
      error: error instanceof Error ? error.message : "Runtime Hermes indisponible.",
    });
  }
}

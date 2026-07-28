import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { db } from "@/db"
import { agents, runtimeInstallations } from "@/db/schema"
import { requireUser } from "@/lib/auth"
import { profileGatewayRunningFromStatus } from "@/lib/hermes/messaging-status"
import { hermesFetch } from "@/lib/hermes/server"
import { getTenantAccessBySlug } from "@/lib/workspace"

type RuntimeStatusResponse = {
  release_date?: string
  version?: string
  gateway_running?: boolean
  gateways?: Array<{ profile?: string; served_profiles?: string[] }>
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenantSlug: string; agentSlug: string }> },
) {
  const { tenantSlug, agentSlug } = await params
  const user = await requireUser()
  const access = await getTenantAccessBySlug(tenantSlug, user.id)
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 })

  const [row] = await db.select({
    agentId: agents.id,
    profile: agents.hermesProfileName,
    installationName: runtimeInstallations.name,
    hermesVersion: runtimeInstallations.hermesVersion,
  }).from(agents)
    .leftJoin(runtimeInstallations, eq(runtimeInstallations.id, agents.runtimeInstallationId))
    .where(and(eq(agents.workspaceId, access.workspace.id), eq(agents.slug, agentSlug)))
    .limit(1)
  if (!row) return NextResponse.json({ error: "Agent introuvable." }, { status: 404 })

  try {
    const query = new URLSearchParams({ profile: row.profile })
    const status = await hermesFetch<RuntimeStatusResponse>(
      `/api/status?${query}`,
      {},
      { agentId: row.agentId, profile: row.profile },
    )
    return NextResponse.json({
      connected: true,
      gatewayRunning: profileGatewayRunningFromStatus(row.profile, status),
      installationName: row.installationName,
      hermesVersion: status.release_date ?? status.version ?? row.hermesVersion,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({
      connected: false,
      gatewayRunning: null,
      installationName: row.installationName,
      hermesVersion: row.hermesVersion,
    }, { headers: { "Cache-Control": "no-store" } })
  }
}

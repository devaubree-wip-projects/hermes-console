export type WorkspaceAgentOption = {
  id: string
  name: string
  slug: string
  runtimeState: "ready" | "setup_required" | "error"
  installationName: string | null
  installationStatus:
    | "pending_enrollment"
    | "checking"
    | "ready"
    | "degraded"
    | "offline"
    | "incompatible"
    | "upgrading"
    | "rollback_required"
    | "revoked"
    | null
  hermesVersion: string | null
}

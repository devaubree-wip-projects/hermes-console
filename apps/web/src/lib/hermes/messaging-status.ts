export type GatewayTopologyStatus = {
  gatewayRunning?: boolean;
  gateways?: Array<{
    profile?: string;
    servedProfiles?: string[];
  }>;
};

export function isProfileGatewayRunning(input: {
  profile: string;
  topology: GatewayTopologyStatus;
  localRunning?: boolean;
  platformReportedRunning?: boolean;
}) {
  if (input.localRunning) return true;

  if (Array.isArray(input.topology.gateways)) {
    return input.topology.gateways.some((gateway) => (
      gateway.profile === input.profile
      || gateway.servedProfiles?.includes(input.profile)
    ));
  }

  if (input.profile === "default" && input.topology.gatewayRunning) return true;
  return input.platformReportedRunning === true;
}

export function resolvedPlatformState(input: {
  topologyState?: string | null;
  localState?: string | null;
  platformState?: string | null;
  gatewayRunning: boolean;
  enabled?: boolean;
  configured?: boolean;
}) {
  if (input.configured === false) return "not_configured";
  if (input.enabled === false) return "disabled";

  return input.topologyState
    ?? (input.gatewayRunning ? input.localState : null)
    ?? (input.gatewayRunning && input.enabled && input.configured
      ? "pending_restart"
      : input.platformState);
}

export function resolvedPlatformError(input: {
  runtimeError?: string | null;
  platformError?: string | null;
  enabled?: boolean;
  configured?: boolean;
}) {
  if (input.configured === false || input.enabled === false) return null;
  return input.runtimeError ?? input.platformError ?? null;
}

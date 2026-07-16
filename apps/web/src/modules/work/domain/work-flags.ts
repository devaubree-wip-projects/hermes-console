import "server-only";

export const WORK_FEATURE_FLAGS = [
  "WORK_CONTROL_PLANE_ENABLED",
  "WORK_EDGE_EXECUTOR_ENABLED",
  "WORK_RUN_PLANS_ENABLED",
  "WORK_INTERVENTIONS_ENABLED",
  "WORK_AUTOMATIONS_ENABLED",
  "WORK_AGENT_TEAMS_ENABLED",
] as const;

export type WorkFeatureFlag = typeof WORK_FEATURE_FLAGS[number];

export function workFeatureEnabled(flag: WorkFeatureFlag) {
  return process.env[flag]?.trim().toLowerCase() !== "false";
}

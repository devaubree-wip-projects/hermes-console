export type EventTone = "neutral" | "info" | "success" | "warning" | "error";

export type PresentedEvent = {
  label: string;
  detail: string | null;
  tone: EventTone;
};

const exactPresentations: Record<string, Omit<PresentedEvent, "detail">> = {
  "messaging.connection_requested": { label: "Connexion du channel demandée", tone: "info" },
  "messaging.connected": { label: "Channel connecté", tone: "success" },
  "messaging.disabled": { label: "Channel désactivé", tone: "neutral" },
  "messaging.failed": { label: "Connexion du channel échouée", tone: "error" },
  "messaging.pending": { label: "Connexion du channel en attente", tone: "warning" },
  "messaging.tested": { label: "Connexion du channel vérifiée", tone: "success" },
  "messaging.test_failed": { label: "Vérification du channel échouée", tone: "error" },
  "messaging.gateway_started": { label: "Gateway Hermes démarré", tone: "success" },
  "messaging.gateway_restarted": { label: "Gateway Hermes redémarré", tone: "success" },
  "messaging.action_failed": { label: "Action de messagerie échouée", tone: "error" },
  "agent.created": { label: "Agent créé", tone: "success" },
  "session.created": { label: "Conversation créée", tone: "info" },
  "session.opened": { label: "Conversation ouverte", tone: "info" },
  "runtime_installation.created": { label: "Installation ajoutée", tone: "success" },
};

const valueLabels: Record<string, string> = {
  connected: "Connecté",
  disabled: "Désactivé",
  pending_restart: "Redémarrage requis",
  gateway_stopped: "Gateway arrêté",
  telegram: "Telegram",
  discord: "Discord",
};

function readableAction(action: string) {
  if (valueLabels[action.toLowerCase()]) return valueLabels[action.toLowerCase()];
  return action
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function eventDetail(metadata: Record<string, unknown> | null | undefined) {
  const platform = metadataString(metadata, "platform");
  const runtimeState = metadataString(metadata, "runtimeState") ?? metadataString(metadata, "state");
  const error = metadataString(metadata, "error") ?? metadataString(metadata, "restartWarning");
  if (error) return error;
  if (platform && runtimeState) return `${readableAction(platform)} · ${readableAction(runtimeState)}`;
  if (platform) return readableAction(platform);
  if (runtimeState) return readableAction(runtimeState);
  return metadataString(metadata, "detail") ?? metadataString(metadata, "statusDetail");
}

function inferredTone(action: string): EventTone {
  if (/(failed|error|rejected|revoked|offline|rollback)/i.test(action)) return "error";
  if (/(pending|requested|checking|warning|degraded|restart)/i.test(action)) return "warning";
  if (/(connected|created|completed|approved|ready|started|verified)/i.test(action)) return "success";
  return "neutral";
}

export function presentEvent(
  action: string,
  metadata?: Record<string, unknown> | null,
): PresentedEvent {
  const presentation = exactPresentations[action];
  return {
    label: presentation?.label ?? readableAction(action),
    tone: presentation?.tone ?? inferredTone(action),
    detail: eventDetail(metadata),
  };
}

const publicMetadataKeys = new Set([
  "platform",
  "runtimeState",
  "state",
  "lifecycleAction",
  "restartWarning",
  "error",
  "detail",
  "statusDetail",
  "operationId",
  "sourceVersion",
  "targetVersion",
]);

export function publicEventMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata) return null;
  const entries = Object.entries(metadata).filter(
    ([key, value]) => publicMetadataKeys.has(key) && ["string", "number", "boolean"].includes(typeof value),
  );
  return entries.length ? Object.fromEntries(entries) : null;
}

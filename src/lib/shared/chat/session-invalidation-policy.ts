import type { BridgeSessionInvalidatedFrame } from "@/lib/hermes/protocol";

export function shouldInvalidateSessionMetrics(
  event: BridgeSessionInvalidatedFrame,
) {
  return event.reason !== "subscribed";
}

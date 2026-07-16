import "server-only";

type Entry = { value: string; expiresAt: number };
const globalStore = globalThis as typeof globalThis & { workEphemeralInterventions?: Map<string, Entry> };
const store = globalStore.workEphemeralInterventions ?? new Map<string, Entry>();
if (process.env.NODE_ENV !== "production") globalStore.workEphemeralInterventions = store;

function purge() {
  const now = Date.now();
  for (const [key, entry] of store) if (entry.expiresAt <= now) store.delete(key);
}

export function rememberEphemeralInterventionValue(interventionId: string, value: string) {
  purge();
  store.set(interventionId, { value, expiresAt: Date.now() + 2 * 60_000 });
}

export function readEphemeralInterventionValue(interventionId: string) {
  purge();
  return store.get(interventionId)?.value ?? null;
}

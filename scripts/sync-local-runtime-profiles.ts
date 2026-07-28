// Root compatibility entrypoint; application dependencies resolve from apps/web.
import { syncLocalRuntimeProfiles } from "../apps/web/scripts/sync-local-runtime-profiles";

syncLocalRuntimeProfiles()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });

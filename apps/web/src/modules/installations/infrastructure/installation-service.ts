import { createConnectInstallation } from "../application/connect-installation";
import { drizzleInstallationRepository } from "./drizzle-installation-repository";
import { gatewayInstallationAdapter } from "./gateway-installation-adapter";
import { installationContextRepository } from "./installation-context-repository";

export const connectInstallation = createConnectInstallation({
  contexts: installationContextRepository,
  gateway: gatewayInstallationAdapter,
  repository: drizzleInstallationRepository,
});

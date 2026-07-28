import { probeGateway, testGatewayProfile } from "@/lib/hermes/gateway-preflight";
import { validateGatewayUrl } from "@/lib/hermes/gateway-url";
import { capacityRecommendation, capacitySample } from "@/lib/hermes/runtime-policy";
import type { InstallationGatewayPort } from "../application/ports";

// Cet adaptateur sert le flux « Connecter » : l'installation n'existe pas encore en
// base au moment du sondage, donc la signature utilise le secret dérivé, sans
// interroger Postgres pour une ligne qui ne peut pas exister.
export const gatewayInstallationAdapter: InstallationGatewayPort = {
  validateUrl: validateGatewayUrl,
  probe: (url, installationKey) => probeGateway(url, installationKey, "unregistered"),
  async testProfile(url, installationKey, profile) {
    await testGatewayProfile(url, installationKey, profile, "unregistered");
  },
  capacity: capacitySample,
  isSaturated(sample) {
    return capacityRecommendation(sample).saturated;
  },
};

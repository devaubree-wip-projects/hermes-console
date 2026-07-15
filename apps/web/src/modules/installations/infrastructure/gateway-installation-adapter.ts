import { probeGateway, testGatewayProfile } from "@/lib/hermes/gateway-preflight";
import { validateGatewayUrl } from "@/lib/hermes/gateway-url";
import { capacityRecommendation, capacitySample } from "@/lib/hermes/runtime-policy";
import type { InstallationGatewayPort } from "../application/ports";

export const gatewayInstallationAdapter: InstallationGatewayPort = {
  validateUrl: validateGatewayUrl,
  probe: probeGateway,
  async testProfile(url, installationKey, profile) {
    await testGatewayProfile(url, installationKey, profile);
  },
  capacity: capacitySample,
  isSaturated(sample) {
    return capacityRecommendation(sample).saturated;
  },
};

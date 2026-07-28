import { afterEach, describe, expect, test } from "bun:test";
import { derivedFallback } from "./installation-secrets";
import {
  deriveInstallationSecret,
  gatewayServiceMasterSecret,
  gatewayTicketMasterSecret,
} from "./relay-identity";

const environment = process.env as Record<string, string | undefined>;
const previousDerive = environment.HERMES_GATEWAY_DERIVE_SECRETS;

afterEach(() => {
  if (previousDerive === undefined) delete environment.HERMES_GATEWAY_DERIVE_SECRETS;
  else environment.HERMES_GATEWAY_DERIVE_SECRETS = previousDerive;
});

describe("Repli d’une installation sans secret propre", () => {
  // Ce test est la contrepartie de « aucune reprise de données » : tant qu'une
  // installation n'a pas de ligne, la Console doit signer exactement comme avant.
  test("rend le secret dérivé, à l’octet près", () => {
    delete environment.HERMES_GATEWAY_DERIVE_SECRETS;
    expect(derivedFallback("service", "local-default"))
      .toBe(deriveInstallationSecret("service", "local-default"));
    expect(derivedFallback("ticket", "local-default"))
      .toBe(deriveInstallationSecret("ticket", "local-default"));
  });

  test("respecte HERMES_GATEWAY_DERIVE_SECRETS=false en retombant sur le master", () => {
    environment.HERMES_GATEWAY_DERIVE_SECRETS = "false";
    expect(derivedFallback("service", "local-default")).toBe(gatewayServiceMasterSecret());
    expect(derivedFallback("ticket", "local-default")).toBe(gatewayTicketMasterSecret());
  });

  test("sépare les portées service et ticket", () => {
    delete environment.HERMES_GATEWAY_DERIVE_SECRETS;
    expect(derivedFallback("service", "edge-a")).not.toBe(derivedFallback("ticket", "edge-a"));
    expect(derivedFallback("service", "edge-a")).not.toBe(derivedFallback("service", "edge-b"));
  });
});

import { describe, expect, test } from "bun:test";
import { agentCreateOutcome } from "@/components/shared/chat/runtime/agent-create-confirmation";

describe("agent creation confirmation status", () => {
  test("only claims the runtime is ready when the backend says so", () => {
    expect(agentCreateOutcome({ runtimeState: "ready" })).toMatchObject({
      title: "Agent créé",
      tone: "success",
    });
    expect(agentCreateOutcome({})).toMatchObject({
      title: "État de l’agent inconnu",
      tone: "neutral",
    });
  });

  test("surfaces setup and runtime failures truthfully", () => {
    expect(agentCreateOutcome({
      runtimeState: "setup_required",
      runtimeError: "Connexion requise.",
    })).toEqual({
      title: "Agent créé — configuration requise",
      description: "Connexion requise.",
      tone: "warning",
    });
    expect(agentCreateOutcome({
      runtimeState: "error",
      runtimeError: "Profil indisponible.",
      reused: true,
    })).toEqual({
      title: "Agent retrouvé — runtime en erreur",
      description: "Profil indisponible.",
      tone: "error",
    });
  });
});

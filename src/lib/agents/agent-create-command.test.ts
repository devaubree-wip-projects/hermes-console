import { describe, expect, test } from "bun:test";
import {
  agentCreatePayload,
  parseAgentCreateCommand,
} from "@/lib/agents/agent-create-command";

describe("agent-create composer command", () => {
  test("parses the documented colon syntax", () => {
    expect(parseAgentCreateCommand("/agent-create :un agent expert SEO qui analyse les sites"))
      .toBe("un agent expert SEO qui analyse les sites");
  });

  test("parses the directive emitted after selecting the slash option", () => {
    expect(parseAgentCreateCommand(
      ":command[/agent-create]{name=agent-create} :un agent de support",
    )).toBe("un agent de support");
  });

  test("does not capture other slash commands", () => {
    expect(parseAgentCreateCommand("/agent-create-other :SEO")).toBeNull();
    expect(parseAgentCreateCommand("/help")).toBeNull();
  });

  test("builds API-safe agent fields from the prompt", () => {
    const payload = agentCreatePayload(
      "Crée un agent qui analyse le SEO technique et prépare des recommandations prioritaires.",
    );
    expect(payload.name).toBe("Analyse le SEO technique et prépare des recommandations prioritaires.");
    expect(payload.name.length).toBeLessThanOrEqual(80);
    expect(payload.description.length).toBeLessThanOrEqual(500);
  });
});

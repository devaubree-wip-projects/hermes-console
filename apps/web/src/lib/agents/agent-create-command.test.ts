import { describe, expect, test } from "bun:test";
import {
  agentCreatePayload,
  agentCreateRequestPayload,
  parseAgentCreateCommand,
  parseAgentCreateRequest,
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

  test("recognizes explicit natural creation requests in French and English", () => {
    expect(parseAgentCreateRequest(
      "Crée-moi un agent qui analyse les audits SEO.",
    )).toEqual({
      prompt: "Crée-moi un agent qui analyse les audits SEO.",
      source: "natural",
    });
    expect(parseAgentCreateRequest(
      "Could you build me an assistant for customer support?",
    )).toEqual({
      prompt: "Could you build me an assistant for customer support?",
      source: "natural",
    });
    expect(parseAgentCreateRequest(
      "Je veux créer un agent spécialisé en conformité.",
    )?.source).toBe("natural");
    expect(parseAgentCreateRequest(
      "I need an agent to triage production incidents.",
    )?.source).toBe("natural");
    expect(parseAgentCreateRequest(
      "J’aimerais un assistant pour préparer mes rendez-vous.",
    )?.source).toBe("natural");
    expect(parseAgentCreateRequest(
      "J’ai besoin d’un agent pour qualifier les prospects.",
    )?.source).toBe("natural");
    expect(parseAgentCreateRequest(
      "Fais-moi un agent qui résume les incidents.",
    )?.source).toBe("natural");
    expect(parseAgentCreateRequest(
      "Ajoute un assistant spécialisé en contrats.",
    )?.source).toBe("natural");
  });

  test("does not turn discussions about agents into creation proposals", () => {
    const falsePositives = [
      "Comment créer un agent ?",
      "Can an agent create a report?",
      "I created an agent yesterday.",
      "Explique-moi comment fonctionne un assistant.",
      "L'agent doit-il être recréé ?",
      "J’ai besoin de comprendre cet agent.",
      "Fais-moi un résumé sur les assistants.",
      "Ajoute un commentaire à la fiche agent.",
    ];
    for (const text of falsePositives) {
      expect(parseAgentCreateRequest(text)).toBeNull();
    }
  });

  test("builds API-safe agent fields from the prompt", () => {
    const payload = agentCreatePayload(
      "Crée un agent qui analyse le SEO technique et prépare des recommandations prioritaires.",
    );
    expect(payload.name).toBe("Analyse le SEO technique et prépare des recommandations prioritaires.");
    expect(payload.name.length).toBeLessThanOrEqual(80);
    expect(payload.description.length).toBeLessThanOrEqual(500);
    expect(agentCreatePayload(
      "I need an agent to triage production incidents.",
    ).name).toBe("Triage production incidents.");
    expect(agentCreatePayload(
      "J’aimerais un assistant pour préparer mes rendez-vous.",
    ).name).toBe("Préparer mes rendez-vous.");
  });

  test("builds the confirmed backend payload with source and stable proposal key", () => {
    const payload = agentCreateRequestPayload(
      "Create an agent for incident response.",
      {
        sourceAgentId: "agent-source",
        idempotencyKey: "agent-proposal-123",
      },
    );
    expect(payload).toEqual({
      name: "Incident response.",
      description: "Create an agent for incident response.",
      sourceAgentId: "agent-source",
      idempotencyKey: "agent-proposal-123",
    });
  });
});

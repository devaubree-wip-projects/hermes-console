/**
 * Traduction des échecs de connexion MCP en messages actionnables.
 *
 * Le runtime classe déjà ses échecs en `permanent` / `transient` et distingue
 * quatre causes permanentes (`tools/mcp_tool.py`) — mais il ne les remonte que
 * sous forme de message d'exception. Sans cette traduction, l'utilisateur voit
 * « échec » et doit aller lire les logs du conteneur : exactement ce que la
 * Console existe pour éviter.
 *
 * Volontairement pur et sans dépendance : la classification est testable et ne
 * dépend d'aucun transport.
 */

export type McpFailureCode =
  | "command_not_found"
  | "unauthorized"
  | "not_an_mcp_endpoint"
  | "invalid_url"
  | "transient";

export type McpFailure = {
  code: McpFailureCode;
  /** Vrai quand réessayer à l'identique ne peut pas aider. */
  permanent: boolean;
  message: string;
};

/**
 * `command` sert à nommer la commande introuvable dans le message. On ne la
 * devine pas depuis l'erreur : le runtime ne la renvoie pas de façon fiable.
 */
export function describeMcpFailure(raw: unknown, command?: string | null): McpFailure {
  const text = (typeof raw === "string" ? raw : raw instanceof Error ? raw.message : "").trim();
  const haystack = text.toLowerCase();

  if (
    haystack.includes("filenotfounderror") ||
    haystack.includes("enoent") ||
    haystack.includes("no such file")
  ) {
    const named = command?.trim();
    return {
      code: "command_not_found",
      permanent: true,
      message: named
        ? `La commande « ${named} » n’existe pas dans le runtime. Un serveur stdio exige une commande déjà présente (npx, uvx, python3) ou un binaire installé sur l’hôte.`
        : "La commande de ce serveur n’existe pas dans le runtime. Un serveur stdio exige une commande déjà présente (npx, uvx, python3) ou un binaire installé sur l’hôte.",
    };
  }

  // Le runtime remonte souvent le code HTTP dans le texte ; on ne matche que des
  // formes explicites pour ne pas classer « 403 » aperçu dans une URL.
  if (/\b(401|403)\b/.test(text) || haystack.includes("unauthorized") || haystack.includes("forbidden")) {
    return {
      code: "unauthorized",
      permanent: true,
      message: "Le serveur refuse les identifiants fournis. Vérifiez la clé ou le jeton associé.",
    };
  }

  if (haystack.includes("nonmcpendpoint")) {
    return {
      code: "not_an_mcp_endpoint",
      permanent: true,
      message: "Cette URL répond, mais ce n’est pas un serveur MCP — elle sert une page web.",
    };
  }

  if (haystack.includes("invalidmcpurl")) {
    return {
      code: "invalid_url",
      permanent: true,
      message: "URL inutilisable pour un serveur MCP.",
    };
  }

  return {
    code: "transient",
    permanent: false,
    message: text || "Le serveur MCP est injoignable pour l’instant.",
  };
}

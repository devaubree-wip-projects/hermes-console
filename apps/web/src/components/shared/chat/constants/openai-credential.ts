export const OPENAI_API_KEYS_URL = "https://platform.openai.com/api-keys";

export function isOpenAiApiProvider(providerId: string) {
  return providerId.trim().toLowerCase() === "openai-api";
}

export function credentialFieldCopy(providerId: string, configured: boolean) {
  if (isOpenAiApiProvider(providerId)) {
    return {
      label: "Clé API OpenAI",
      envHint: "OPENAI_API_KEY",
      placeholder: configured
        ? "Laisser vide pour conserver la clé enregistrée"
        : "sk-… ou sk-proj-…",
      helper: configured
        ? "Clé enregistrée dans le profil Hermes de cet agent. Collez une nouvelle clé pour la remplacer."
        : "Format sk-… ou sk-proj-…. La clé reste privée et n’est jamais réaffichée.",
      docsUrl: OPENAI_API_KEYS_URL,
      docsLabel: "Créer une clé API",
      connectLabel: "Tester et connecter",
    };
  }

  return {
    label: `Identifiant ${providerId}`,
    envHint: null,
    placeholder: configured
      ? "Laisser vide pour conserver la connexion"
      : "Coller l’identifiant fournisseur",
    helper: "L’identifiant reste privé et n’est jamais réaffiché.",
    docsUrl: null as string | null,
    docsLabel: "Obtenir un identifiant",
    connectLabel: "Tester et connecter",
  };
}

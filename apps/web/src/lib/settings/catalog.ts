/**
 * Réglages du `.env` de la Console qui peuvent être surchargés depuis l'interface.
 *
 * Cette liste est fermée, et c'est délibéré : elle est la frontière entre ce qu'un
 * Owner peut changer sans redéploiement et ce qui doit rester dans le fichier.
 *
 * Trois familles en sont exclues par construction, ne les ajoutez pas ici :
 *
 *  - Amorçage — `DATABASE_URL`, `NODE_ENV`, `NEXT_RUNTIME`. Elles sont lues avant
 *    toute connexion à la base ; les stocker dans la base qu'elles servent à joindre
 *    n'a pas de sens.
 *  - Racines de confiance — `HERMES_GATEWAY_SERVICE_SECRET`, `_TICKET_SECRET`,
 *    `HERMES_RELAY_IDENTITY_SECRET`, `HERMES_INSTALLATION_SECRET_KEY`,
 *    `WORK_AUTOMATION_CRON_SECRET`. Chacune protège le canal qui transporterait sa
 *    propre mise à jour, `HERMES_INSTALLATION_SECRET_KEY` déchiffrant même la colonne
 *    où elle serait rangée.
 *  - Valeurs de build — `NEXT_PUBLIC_*`, inlinées dans le bundle navigateur : les
 *    changer en base ne changerait rien à ce que le client a déjà reçu.
 */
export type ConsoleSettingDefinition = {
  key: string;
  label: string;
  group: "smtp" | "urls" | "flags" | "telegram";
  secret?: boolean;
  hint?: string;
  placeholder?: string;
};

export const CONSOLE_SETTINGS: readonly ConsoleSettingDefinition[] = [
  { key: "SMTP_HOST", label: "Hôte SMTP", group: "smtp", placeholder: "localhost" },
  { key: "SMTP_PORT", label: "Port SMTP", group: "smtp", placeholder: "1025" },
  {
    key: "SMTP_SECURE",
    label: "TLS implicite",
    group: "smtp",
    hint: "true uniquement pour un TLS implicite sur le port 465.",
    placeholder: "false",
  },
  { key: "SMTP_USER", label: "Utilisateur SMTP", group: "smtp", hint: "Vide si le relais n’exige pas d’authentification." },
  { key: "SMTP_PASSWORD", label: "Mot de passe SMTP", group: "smtp", secret: true },
  {
    key: "MAIL_FROM",
    label: "Expéditeur",
    group: "smtp",
    placeholder: "Hermes Console <no-reply@hermes-console.local>",
  },
  {
    key: "HERMES_CONSOLE_URL",
    label: "URL publique de la Console",
    group: "urls",
    hint: "Sert à construire les liens des emails d’invitation et de réinitialisation.",
    placeholder: "http://localhost:3010",
  },
  {
    key: "HERMES_DEMO_ACCOUNTS",
    label: "Comptes de démonstration",
    group: "flags",
    hint: "Affiche les comptes « Atelier Lumière » sur la page de connexion. Jamais sur une instance avec de vrais utilisateurs.",
    placeholder: "false",
  },
  // HERMES_LOG_LEVEL et HERMES_LOG_FORMAT sont volontairement absents : les loggers
  // sont construits à l'import des modules qui les utilisent, donc avant toute lecture
  // possible en base. Les exposer ici donnerait un réglage qu'on modifie, qui
  // s'enregistre, et qui ne change rien — pire qu'un réglage absent.
  {
    key: "TELEGRAM_BOT_TOKEN",
    label: "Jeton du bot de notification",
    group: "telegram",
    secret: true,
    hint: "Notifications Work sortantes uniquement. Distinct du bot configuré par agent dans Intégrations.",
  },
  { key: "TELEGRAM_CHAT_ID", label: "Conversation de destination", group: "telegram" },
] as const;

export const CONSOLE_SETTING_KEYS = CONSOLE_SETTINGS.map((setting) => setting.key);

const BY_KEY = new Map(CONSOLE_SETTINGS.map((setting) => [setting.key, setting]));

export function consoleSettingDefinition(key: string) {
  return BY_KEY.get(key);
}

export const CONSOLE_SETTING_GROUPS: { id: ConsoleSettingDefinition["group"]; label: string }[] = [
  { id: "smtp", label: "Email transactionnel" },
  { id: "urls", label: "URL publiques" },
  { id: "flags", label: "Drapeaux produit" },
  { id: "telegram", label: "Notifications Telegram" },
];

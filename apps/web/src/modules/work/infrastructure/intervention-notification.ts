import type { WorkInterventionType } from "@/db/schema";
import { renderAppleEmail } from "@/lib/email/apple-template";
import { escapeTelegramHtml, type TelegramButton } from "@/lib/telegram";

const TYPE_LABELS: Record<WorkInterventionType, string> = {
  approval: "une validation",
  secret: "un secret",
  sudo: "une action privilégiée",
  clarification: "une clarification",
  launch_review: "la revue d'un lancement",
  deliverable_review: "la revue d'un livrable",
};

/** Pure builder for the out-of-app "an intervention is waiting" email. */
export function interventionEmail(input: {
  tenantName: string;
  type: WorkInterventionType;
  url: string;
}): { subject: string; text: string; html: string } {
  const what = TYPE_LABELS[input.type] ?? "une intervention";
  const paragraphs = [
    `Un agent de l'organisation « ${input.tenantName} » attend ${what} pour poursuivre son travail.`,
    "La tâche reste en pause tant que la demande n'est pas traitée.",
  ];
  return {
    subject: `Action requise sur ${input.tenantName} : ${what}`,
    text: [
      "Bonjour,",
      "",
      paragraphs[0],
      "La tâche reste en pause tant que la demande n'est pas traitée. Ouvrez la console pour décider :",
      input.url,
      "",
      "Vous recevez cet email parce que vous êtes responsable de cette organisation.",
    ].join("\n"),
    html: renderAppleEmail({
      preheader: `${input.tenantName} attend ${what} pour continuer.`,
      eyebrow: input.tenantName,
      title: "Action requise",
      paragraphs,
      cta: { label: "Ouvrir la Console", url: input.url },
      footnote:
        "Vous recevez cet email parce que vous êtes responsable de cette organisation.",
    }),
  };
}

/** Pure builder for the Telegram "an intervention is waiting" push. */
export function interventionTelegram(input: {
  tenantName: string;
  type: WorkInterventionType;
  url: string;
}): { text: string; buttons: TelegramButton[] } {
  const what = TYPE_LABELS[input.type] ?? "une intervention";
  return {
    text: [
      `🔔 <b>Action requise — ${escapeTelegramHtml(input.tenantName)}</b>`,
      "",
      `Un agent attend ${escapeTelegramHtml(what)} pour poursuivre son travail. La tâche reste en pause tant que la demande n'est pas traitée.`,
    ].join("\n"),
    buttons: [{ text: "Ouvrir la Console", url: input.url }],
  };
}

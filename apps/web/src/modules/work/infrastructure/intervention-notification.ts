import type { WorkInterventionType } from "@/db/schema";

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
}): { subject: string; text: string } {
  const what = TYPE_LABELS[input.type] ?? "une intervention";
  return {
    subject: `Action requise sur ${input.tenantName} : ${what}`,
    text: [
      "Bonjour,",
      "",
      `Un agent de l'organisation « ${input.tenantName} » attend ${what} pour poursuivre son travail.`,
      "La tâche reste en pause tant que la demande n'est pas traitée. Ouvrez la console pour décider :",
      input.url,
      "",
      "Vous recevez cet email parce que vous êtes responsable de cette organisation.",
    ].join("\n"),
  };
}

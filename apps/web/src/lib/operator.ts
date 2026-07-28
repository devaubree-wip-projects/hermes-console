// Qui exploite cette Console. C'est un fait d'installation, pas une donnée
// produit : l'opérateur héberge la Console pour le compte de plusieurs
// entreprises clientes, alors qu'un tenant n'est responsable que du sien.
//
// Volontairement hors base. Un drapeau `is_operator` en table serait modifiable
// par quiconque obtient une écriture SQL, et la capacité qu'il donne — créer des
// organisations sans limite — est précisément celle qu'on ne veut pas voir
// s'octroyer depuis l'application. Le déclarer dans l'environnement le rend
// solidaire du déploiement.

function parse(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Lu à chaque appel plutôt que mémorisé au chargement du module : les tests
 * changent la variable entre deux cas, et un opérateur ajouté en production ne
 * doit pas attendre un redémarrage pour exister.
 */
export function operatorEmails(): string[] {
  return parse(process.env.HERMES_OPERATOR_EMAILS);
}

export function isOperatorEmail(email: string): boolean {
  const normalised = email.trim().toLowerCase();
  return normalised.length > 0 && operatorEmails().includes(normalised);
}

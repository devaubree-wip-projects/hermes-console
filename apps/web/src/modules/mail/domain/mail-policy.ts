// Ce qu'on s'autorise à envoyer, et à qui. Aucune I/O ici : la politique se
// décide sur des faits déjà rassemblés, ce qui la rend vérifiable en test sans
// base ni relais.
//
// Prospecter à partir d'un fichier public engage le tenant : il doit dire d'où
// viennent les données et offrir un moyen de s'y opposer. Ces deux obligations
// sont donc appliquées ici, sur le chemin unique de l'envoi, plutôt que confiées
// au texte que l'agent a rédigé.
//
// Écrire à son propre client n'est pas prospecter. La relance d'une facture
// s'adresse à quelqu'un avec qui le tenant a déjà un contrat : lui annoncer que
// ses coordonnées viennent d'un avis public serait faux, et lui interdire un
// second message rendrait la relance impossible — c'est pourtant le premier
// usage du produit. La nature du destinataire arbitre donc les règles qui, elles,
// restent inchangées pour la prospection.

export type MailProvider = "smtp" | "brevo" | "resend";

/**
 * `prospection` : coordonnées tirées d'une source publique, aucune relation
 * préalable. `relation_client` : relation contractuelle existante.
 *
 * C'est l'appelant qui déclare la nature, et le tenant qui en répond : rien ici
 * ne peut vérifier qu'un contrat existe. Le choix est donc consigné en base et
 * dans la piste d'audit, et `prospection` — le régime le plus strict — reste le
 * défaut partout où la nature n'est pas dite.
 */
export type NatureDestinataire = "prospection" | "relation_client";

export type Expediteur = { email: string; nom?: string | null; repondreA?: string | null };

export type DemandeEnvoi = {
  destinataire: string;
  sujet: string;
  texte: string;
  nature: NatureDestinataire;
  /** L'avis public qui justifie la prise de contact. Exigé en prospection, absent sinon. */
  source: string | null;
};

export type RefusEnvoi =
  | { raison: "adresse_invalide"; message: string }
  | { raison: "source_invalide"; message: string }
  | { raison: "message_vide"; message: string }
  | { raison: "opposition"; message: string }
  | { raison: "doublon"; message: string }
  | { raison: "quota"; message: string };

/** Ce que l'appelant a dû aller chercher en base avant de demander l'autorisation. */
export type EtatDestinataire = {
  sEstOppose: boolean;
  dejaContacte: boolean;
  envoyesAujourdhui: number;
  limiteJournaliere: number;
};

const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normaliseAdresse(adresse: string): string {
  return adresse.trim().toLowerCase();
}

export function estAdresseValide(adresse: string): boolean {
  return ADRESSE.test(normaliseAdresse(adresse));
}

/**
 * Le pied de message n'est pas vérifié dans le texte de l'agent, il y est ajouté :
 * une garde qui se contente d'inspecter finit toujours par être contournée par
 * une reformulation, et c'est le tenant qui répond de l'infraction.
 *
 * En relation client, rien n'est ajouté : l'identité de l'expéditeur voyage déjà
 * dans l'en-tête `From`, et aucune obligation d'origine ni d'opposition ne pèse
 * sur un message adressé à son propre client. Répéter le nom de l'expéditeur en
 * bas du corps n'ajouterait qu'un bruit que personne ne lit.
 */
export function avecMentions(texte: string, nature: NatureDestinataire, source: string | null): string {
  if (nature === "relation_client") return `${texte.trimEnd()}\n`;
  return (
    `${texte.trimEnd()}\n\n—\n` +
    `Vos coordonnées proviennent de l'avis d'attribution de marché public publié au BOAMP : ${source}\n` +
    `Répondez « STOP » à ce message et vous ne serez plus jamais contacté.\n`
  );
}

/** Forme d'en-tête acceptée telle quelle par SMTP et Resend ; Brevo veut les deux champs séparés. */
export function enTeteExpediteur(expediteur: Expediteur): string {
  return expediteur.nom ? `${expediteur.nom} <${expediteur.email}>` : expediteur.email;
}

export function verifieDemande(demande: DemandeEnvoi): RefusEnvoi | null {
  if (!estAdresseValide(demande.destinataire))
    return {
      raison: "adresse_invalide",
      message: `« ${demande.destinataire} » n'est pas une adresse. Une adresse devinée fait rebondir le message et brûle la réputation du domaine d'envoi.`,
    };
  if (demande.nature === "prospection" && !/^https?:\/\//.test(demande.source?.trim() ?? ""))
    return {
      raison: "source_invalide",
      message: "source doit être l'URL de l'avis d'attribution : elle part dans le message comme preuve de l'origine des données.",
    };
  if (!demande.texte.trim())
    return { raison: "message_vide", message: "Le corps du message est vide." };
  if (!demande.sujet.trim())
    return { raison: "message_vide", message: "Le sujet est vide." };
  return null;
}

export function autoriseEnvoi(demande: DemandeEnvoi, etat: EtatDestinataire): RefusEnvoi | null {
  const invalide = verifieDemande(demande);
  if (invalide) return invalide;
  const adresse = normaliseAdresse(demande.destinataire);
  // L'opposition vaut aussi en relation client : une adresse est inscrite ici
  // parce qu'elle a demandé le silence ou parce qu'elle rebondit. Passer outre
  // pour une facture reviendrait à décider que notre créance prime sur le refus
  // exprimé. Lever l'opposition est un acte humain, dans les réglages.
  if (etat.sEstOppose)
    return {
      raison: "opposition",
      message: `${adresse} s'est opposé à recevoir des messages, ou son adresse rebondit. On n'écrit pas.`,
    };
  // Le non-doublon protège un prospect d'une deuxième sollicitation non voulue.
  // Une relance de facture est exactement l'inverse : un second message attendu,
  // adressé à quelqu'un qui nous doit de l'argent.
  if (demande.nature === "prospection" && etat.dejaContacte)
    return {
      raison: "doublon",
      message: `${adresse} a déjà reçu un message. Une relance se décide, elle ne s'automatise pas.`,
    };
  if (etat.envoyesAujourdhui >= etat.limiteJournaliere)
    return {
      raison: "quota",
      message: `Quota du jour atteint (${etat.envoyesAujourdhui}/${etat.limiteJournaliere}). Dépasser la limite du relais fait suspendre le compte d'envoi.`,
    };
  return null;
}

/** Un refus de politique n'est pas une panne : le distinguer évite de faire réessayer l'agent. */
export function statutHttp(refus: RefusEnvoi): number {
  return refus.raison === "quota" ? 429 : refus.raison === "opposition" || refus.raison === "doublon" ? 409 : 422;
}

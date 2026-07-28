// L'identité légale de l'éditeur et la grille tarifaire, en un seul endroit.
//
// Ces valeurs étaient écrites en dur dans le JSX des trois pages légales, avec
// deux d'entre elles répétées à deux endroits : les remplir demandait une chasse
// plutôt qu'une saisie, et un oubli passait inaperçu jusqu'à ce qu'un client le
// lise. Ici, `null` signifie « pas encore renseigné » et la page affiche le
// surlignage d'alerte à la place.
//
// ⚠️ Aucune facture ne doit sortir tant que les champs légaux valent `null`.

export type CompanyFieldKey =
  | "raisonSociale"
  | "adresse"
  | "siret"
  | "directeurPublication"
  | "hebergeur"
  | "hebergeurAdresse"
  | "contactDroits"
  | "dureesConservation"
  | "sousTraitants";

/** Libellé affiché dans le marqueur quand la valeur manque. */
export const COMPANY_FIELD_LABELS: Record<CompanyFieldKey, string> = {
  raisonSociale: "nom et prénom de l'entrepreneur",
  adresse: "adresse",
  siret: "SIRET",
  directeurPublication: "nom du directeur de publication",
  hebergeur: "hébergeur",
  hebergeurAdresse: "adresse de l'hébergeur",
  contactDroits: "adresse de contact pour l'exercice des droits",
  dureesConservation: "durées de conservation précises",
  sousTraitants: "liste des sous-traitants et hébergeur",
};

/**
 * Éditeur en **entreprise individuelle (micro-entreprise)** : ni forme
 * sociétaire, ni capital social à déclarer — les mentions obligatoires sont le
 * nom, le prénom, l'adresse et le SIRET. Un DPO n'est pas requis non plus : la
 * politique de confidentialité annonce donc un contact pour l'exercice des
 * droits, et non un poste qui n'existe pas.
 */
export const company: Record<CompanyFieldKey, string | null> = {
  raisonSociale: null,
  adresse: null,
  siret: null,
  directeurPublication: null,
  hebergeur: null,
  hebergeurAdresse: null,
  contactDroits: null,
  dureesConservation: null,
  sousTraitants: null,
};

/** Vrai quand tout est renseigné — condition pour facturer sereinement. */
export function companyIsComplete(): boolean {
  return Object.values(company).every((value) => Boolean(value && value.trim()));
}

/**
 * La grille annoncée publiquement. Partagée par la landing et les CGU : deux
 * prix affichés qui divergent, c'est un litige.
 */
export const pricing = {
  miseEnService: "1 500 €",
  mensuel: "250 €",
  /** Ce que le client paie en plus, à prix coûtant, sur son propre compte. */
  inference: "refacturée sans marge, sur votre propre compte fournisseur",
} as const;

import { describe, expect, test } from "bun:test";
import {
  autoriseEnvoi,
  avecMentions,
  enTeteExpediteur,
  estAdresseValide,
  normaliseAdresse,
  statutHttp,
  type DemandeEnvoi,
  type EtatDestinataire,
} from "./mail-policy";

const demande: DemandeEnvoi = {
  destinataire: "contact@exemple.fr",
  sujet: "Votre marché du 26-07",
  texte: "Bonjour, vous avez été retenus sur la halle de gymnastique.",
  nature: "prospection",
  source: "https://boamp.fr/avis/123",
};

/** Une relance de facture : relation contractuelle, donc aucun avis à citer. */
const relance: DemandeEnvoi = {
  destinataire: "compta@client.fr",
  sujet: "Facture 2026-114 échue depuis 15 jours",
  texte: "Bonjour, sauf erreur de notre part la facture 2026-114 reste impayée.",
  nature: "relation_client",
  source: null,
};

const libre: EtatDestinataire = {
  sEstOppose: false,
  dejaContacte: false,
  envoyesAujourdhui: 0,
  limiteJournaliere: 100,
};

describe("adresses", () => {
  test("normalise la casse et les espaces, parce que la déduplication en dépend", () => {
    expect(normaliseAdresse("  Contact@Exemple.FR ")).toBe("contact@exemple.fr");
  });

  test("refuse ce qui n'est pas une adresse", () => {
    expect(estAdresseValide("contact@exemple.fr")).toBe(true);
    expect(estAdresseValide("contact@exemple")).toBe(false);
    expect(estAdresseValide("contact chez exemple.fr")).toBe(false);
    expect(estAdresseValide("")).toBe(false);
  });
});

describe("mentions légales", () => {
  test("ajoute l'origine des données et le moyen de s'y opposer", () => {
    const texte = avecMentions("Bonjour.", "prospection", "https://boamp.fr/avis/123");
    expect(texte).toContain("https://boamp.fr/avis/123");
    expect(texte).toContain("STOP");
  });

  test("les ajoute même si l'agent les avait déjà écrites à sa façon", () => {
    // La garde n'inspecte pas le texte : elle l'augmente. Une reformulation de
    // l'agent ne doit pas pouvoir tenir lieu de mention légale.
    const texte = avecMentions(
      "Bonjour. Répondez STOP pour ne plus être contacté.",
      "prospection",
      "https://x.fr/a",
    );
    expect(texte.match(/STOP/g)).toHaveLength(2);
  });

  test("n'annonce aucune origine BOAMP à un client qu'on relance", () => {
    const texte = avecMentions("Bonjour, la facture 2026-114 reste impayée.", "relation_client", null);
    expect(texte).not.toContain("BOAMP");
    expect(texte).not.toContain("STOP");
    expect(texte.trim()).toBe("Bonjour, la facture 2026-114 reste impayée.");
  });
});

describe("en-tête d'expéditeur", () => {
  test("porte le nom quand il existe, l'adresse seule sinon", () => {
    expect(enTeteExpediteur({ email: "k@d.fr", nom: "Kevin" })).toBe("Kevin <k@d.fr>");
    expect(enTeteExpediteur({ email: "k@d.fr", nom: null })).toBe("k@d.fr");
  });
});

describe("autorisation d'envoi", () => {
  test("laisse passer une demande saine", () => {
    expect(autoriseEnvoi(demande, libre)).toBeNull();
  });

  test("refuse une adresse inventée avant toute autre considération", () => {
    const refus = autoriseEnvoi({ ...demande, destinataire: "peut-etre@quelquepart" }, libre);
    expect(refus?.raison).toBe("adresse_invalide");
  });

  test("exige l'URL de l'avis : sans elle, la mention d'origine serait fausse", () => {
    expect(autoriseEnvoi({ ...demande, source: "un avis du BOAMP" }, libre)?.raison).toBe("source_invalide");
  });

  test("refuse un corps ou un sujet vide", () => {
    expect(autoriseEnvoi({ ...demande, texte: "   " }, libre)?.raison).toBe("message_vide");
    expect(autoriseEnvoi({ ...demande, sujet: "" }, libre)?.raison).toBe("message_vide");
  });

  test("respecte une opposition, quoi qu'il arrive par ailleurs", () => {
    expect(autoriseEnvoi(demande, { ...libre, sEstOppose: true })?.raison).toBe("opposition");
  });

  test("l'opposition prime sur le quota : on ne remet pas quelqu'un en file", () => {
    const refus = autoriseEnvoi(demande, {
      ...libre,
      sEstOppose: true,
      envoyesAujourdhui: 500,
      limiteJournaliere: 100,
    });
    expect(refus?.raison).toBe("opposition");
  });

  test("n'écrit pas deux fois à la même adresse", () => {
    expect(autoriseEnvoi(demande, { ...libre, dejaContacte: true })?.raison).toBe("doublon");
  });

  test("laisse relancer un client autant de fois qu'il le faut", () => {
    // Le non-doublon protège un prospect. Appliqué à une facture impayée, il
    // interdirait la relance — c'est-à-dire le service qu'on vend.
    expect(autoriseEnvoi(relance, { ...libre, dejaContacte: true })).toBeNull();
  });

  test("n'exige pas d'avis public pour écrire à son propre client", () => {
    expect(autoriseEnvoi(relance, libre)).toBeNull();
  });

  test("exige toujours l'avis en prospection, même sans source du tout", () => {
    expect(autoriseEnvoi({ ...demande, source: null }, libre)?.raison).toBe("source_invalide");
  });

  test("respecte l'opposition même en relation client", () => {
    // Une adresse inscrite en opposition a demandé le silence ou rebondit :
    // une créance ne rouvre pas la porte.
    expect(autoriseEnvoi(relance, { ...libre, sEstOppose: true })?.raison).toBe("opposition");
  });

  test("applique le quota du relais aux deux régimes", () => {
    expect(
      autoriseEnvoi(relance, { ...libre, envoyesAujourdhui: 100, limiteJournaliere: 100 })?.raison,
    ).toBe("quota");
  });

  test("s'arrête à la limite du relais, bornes comprises", () => {
    expect(autoriseEnvoi(demande, { ...libre, envoyesAujourdhui: 99, limiteJournaliere: 100 })).toBeNull();
    expect(
      autoriseEnvoi(demande, { ...libre, envoyesAujourdhui: 100, limiteJournaliere: 100 })?.raison,
    ).toBe("quota");
  });
});

describe("traduction HTTP", () => {
  test("distingue le quota, le conflit et la demande mal formée", () => {
    expect(statutHttp({ raison: "quota", message: "" })).toBe(429);
    expect(statutHttp({ raison: "opposition", message: "" })).toBe(409);
    expect(statutHttp({ raison: "doublon", message: "" })).toBe(409);
    expect(statutHttp({ raison: "adresse_invalide", message: "" })).toBe(422);
  });
});

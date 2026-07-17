import type { Metadata } from "next";
import { LegalArticle, LegalSection, Placeholder } from "../_components/legal-article";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description:
    "Politique de confidentialité de Hermes Console : données collectées, finalités, durées de conservation, droits RGPD et cookies.",
};

export default function ConfidentialitePage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          Politique de confidentialité
        </h1>
        <p className="text-xs text-muted-foreground">Dernière mise à jour : 17-07-2026</p>
      </div>

      <LegalArticle>
        <LegalSection title="Responsable de traitement">
          <p>
            Le responsable du traitement des données à caractère personnel est{" "}
            <Placeholder>[À COMPLÉTER : raison sociale]</Placeholder>, dont le siège social est situé{" "}
            <Placeholder>[À COMPLÉTER : adresse]</Placeholder>.
          </p>
        </LegalSection>

        <LegalSection title="Données collectées">
          <p>Dans le cadre de l&apos;utilisation de Hermes Console, nous collectons :</p>
          <ul>
            <li>votre nom et votre adresse email (création et gestion du compte) ;</li>
            <li>
              les contenus de travail que vous créez (tâches, sessions, notes, espaces de travail) ;
            </li>
            <li>les transcripts des échanges avec les agents Hermes ;</li>
            <li>les fichiers que vous téléversez dans la console.</li>
          </ul>
        </LegalSection>

        <LegalSection title="Finalités du traitement">
          <p>Ces données sont traitées pour :</p>
          <ul>
            <li>fournir l&apos;accès au service et authentifier les utilisateurs ;</li>
            <li>exécuter les agents et restituer leurs résultats dans la console ;</li>
            <li>assurer le support et la sécurité du service.</li>
          </ul>
        </LegalSection>

        <LegalSection title="Base légale">
          <p>
            Les traitements reposent sur l&apos;exécution du contrat qui nous lie (fourniture du
            service, article 6.1.b du RGPD) et, pour la sécurité du service, sur notre intérêt
            légitime (article 6.1.f du RGPD).
          </p>
        </LegalSection>

        <LegalSection title="Durée de conservation">
          <p>
            Les données sont conservées pendant toute la durée de vie du compte, puis supprimées ou
            archivées selon les délais suivants :{" "}
            <Placeholder>[À COMPLÉTER : durées de conservation précises]</Placeholder>.
          </p>
        </LegalSection>

        <LegalSection title="Destinataires et sous-traitants">
          <p>
            Les données sont accessibles aux équipes habilitées et à nos sous-traitants techniques
            (hébergement, infrastructure) :{" "}
            <Placeholder>[À COMPLÉTER : liste des sous-traitants et hébergeur]</Placeholder>. Aucune
            donnée n&apos;est vendue à des tiers.
          </p>
        </LegalSection>

        <LegalSection title="Vos droits">
          <p>
            Conformément au RGPD, vous disposez d&apos;un droit d&apos;accès, de rectification,
            d&apos;effacement, de limitation, d&apos;opposition et de portabilité sur vos données.
            Pour exercer ces droits, contactez-nous à l&apos;adresse{" "}
            <Placeholder>[À COMPLÉTER : email DPO]</Placeholder>.
          </p>
        </LegalSection>

        <LegalSection title="Cookies">
          <p>
            Hermes Console utilise uniquement un cookie de session strictement nécessaire à
            l&apos;authentification. Aucun cookie de mesure d&apos;audience ou de traceur publicitaire
            n&apos;est déposé.
          </p>
        </LegalSection>

        <LegalSection title="Sécurité">
          <p>
            Des mesures techniques et organisationnelles sont mises en œuvre pour protéger vos
            données contre l&apos;accès, la modification ou la divulgation non autorisés.
          </p>
        </LegalSection>
      </LegalArticle>
    </div>
  );
}

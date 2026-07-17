import type { Metadata } from "next";
import { SUPPORT_EMAIL } from "@/lib/support";
import { LegalArticle, LegalSection, Placeholder } from "../_components/legal-article";

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation",
  description:
    "Conditions générales d'utilisation de Hermes Console : objet du service, compte, disponibilité, propriété intellectuelle et résiliation.",
};

export default function CguPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          Conditions générales d&apos;utilisation
        </h1>
        <p className="text-xs text-muted-foreground">Dernière mise à jour : 17-07-2026</p>
      </div>

      <LegalArticle>
        <LegalSection title="1. Objet">
          <p>
            Les présentes conditions générales d&apos;utilisation régissent l&apos;accès et
            l&apos;utilisation de Hermes Console, un cockpit web permettant de piloter et superviser
            des agents Hermes (sessions, approbations, livrables, automatisations).
          </p>
        </LegalSection>

        <LegalSection title="2. Compte et responsabilités">
          <p>
            L&apos;accès au service nécessite la création d&apos;un compte. Vous êtes responsable de
            l&apos;exactitude des informations fournies ainsi que de la confidentialité de vos
            identifiants. Toute activité réalisée depuis votre compte est réputée effectuée par vous.
          </p>
        </LegalSection>

        <LegalSection title="3. Disponibilité du service">
          <p>
            Nous mettons en œuvre les moyens raisonnables pour assurer la disponibilité et la bonne
            exécution du service, sans engagement chiffré de disponibilité. Des opérations de
            maintenance peuvent entraîner des interruptions temporaires, notamment planifiées à
            l&apos;avance lorsque cela est possible.
          </p>
        </LegalSection>

        <LegalSection title="4. Propriété intellectuelle">
          <p>
            Hermes Console, sa marque, son interface et son code restent la propriété exclusive de
            leur éditeur. Vous conservez la propriété des contenus que vous créez ou téléversez dans
            le service.
          </p>
        </LegalSection>

        <LegalSection title="5. Prix">
          <p>
            Les conditions tarifaires applicables sont <Placeholder>[À COMPLÉTER : grille tarifaire]</Placeholder>.
          </p>
        </LegalSection>

        <LegalSection title="6. Résiliation">
          <p>
            Vous pouvez cesser d&apos;utiliser le service et demander la clôture de votre compte à
            tout moment en nous contactant. En cas de manquement grave aux présentes conditions,
            l&apos;accès au service peut être suspendu ou résilié.
          </p>
        </LegalSection>

        <LegalSection title="7. Droit applicable">
          <p>
            Les présentes conditions générales d&apos;utilisation sont soumises au droit français.
            Tout litige relève de la compétence des tribunaux français compétents.
          </p>
        </LegalSection>

        <LegalSection title="8. Contact">
          <p>
            Pour toute question relative aux présentes conditions, contactez-nous à l&apos;adresse{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
          </p>
        </LegalSection>
      </LegalArticle>
    </div>
  );
}

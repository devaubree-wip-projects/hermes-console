import type { Metadata } from "next";
import { SUPPORT_EMAIL } from "@/lib/support";
import { CompanyField, LegalArticle, LegalSection } from "../_components/legal-article";

export const metadata: Metadata = {
  title: "Mentions légales",
  description:
    "Mentions légales de Hermes Console : éditeur, directeur de publication, hébergeur et contact.",
};

export default function MentionsLegalesPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">Mentions légales</h1>
        <p className="text-xs text-muted-foreground">Dernière mise à jour : 28-07-2026</p>
      </div>

      <LegalArticle>
        <LegalSection title="Éditeur du site">
          {/* Entrepreneur individuel : les mentions obligatoires sont le nom, le
              prénom, l'adresse et le SIRET — ni forme sociétaire, ni capital. */}
          <p>
            Le site Hermes Console est édité par <CompanyField name="raisonSociale" />, entrepreneur
            individuel, dont le siège est situé <CompanyField name="adresse" />, immatriculé sous le
            numéro SIRET <CompanyField name="siret" />.
          </p>
          <p>
            Directeur de la publication : <CompanyField name="directeurPublication" />.
          </p>
        </LegalSection>

        <LegalSection title="Hébergement">
          <p>
            Le site est hébergé par <CompanyField name="hebergeur" />, dont le siège social est situé{" "}
            <CompanyField name="hebergeurAdresse" />.
          </p>
        </LegalSection>

        <LegalSection title="Contact">
          <p>
            Pour toute question relative au site ou au service, vous pouvez nous contacter à
            l&apos;adresse <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
          </p>
        </LegalSection>

        <LegalSection title="Propriété intellectuelle">
          <p>
            L&apos;ensemble des éléments du site Hermes Console (textes, marques, logos, interfaces,
            code) est protégé par le droit de la propriété intellectuelle. Toute reproduction ou
            représentation non autorisée est interdite.
          </p>
        </LegalSection>
      </LegalArticle>
    </div>
  );
}

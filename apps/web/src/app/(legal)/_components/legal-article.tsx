import type { ReactNode } from "react";
import { COMPANY_FIELD_LABELS, company, type CompanyFieldKey } from "@/lib/company";

const proseClassName =
  "space-y-8 text-sm leading-relaxed text-muted-foreground sm:text-base " +
  "[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:sm:text-xl " +
  "[&_h3]:mt-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground " +
  "[&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_li]:leading-relaxed " +
  "[&_strong]:font-medium [&_strong]:text-foreground " +
  "[&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:no-underline";

/** Sobre wrapper de contenu juridique : réutilise les tokens texte/lien existants. */
export function LegalArticle({ children }: { children: ReactNode }) {
  return <article className={proseClassName}>{children}</article>;
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/** Marque visuellement les informations société manquantes (token --warn existant). */
export function Placeholder({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-warn-100 px-1.5 py-0.5 font-mono text-[0.85em] text-warn-700 break-words">
      {children}
    </span>
  );
}

/**
 * Une mention légale : sa valeur si elle est renseignée dans `lib/company`, le
 * marqueur d'alerte sinon. Le trou reste donc visible sur la page tant qu'il
 * existe, au lieu d'attendre qu'un lecteur le remarque.
 */
export function CompanyField({ name }: { name: CompanyFieldKey }) {
  const value = company[name];
  if (value && value.trim()) return <>{value}</>;
  return <Placeholder>[À COMPLÉTER : {COMPANY_FIELD_LABELS[name]}]</Placeholder>;
}

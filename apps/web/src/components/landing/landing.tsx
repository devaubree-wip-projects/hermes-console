"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRightIcon,
  CheckIcon,
  EyeIcon,
  KeyRoundIcon,
  LayoutTemplateIcon,
  MessageCircleIcon,
  ShieldCheckIcon,
  SparklesIcon,
  WorkflowIcon,
} from "lucide-react";
import { pricing } from "@/lib/company";
import { SUPPORT_EMAIL } from "@/lib/support";
import { RuntimeConsole } from "./runtime-console";
import { Reveal, staggerContainer, staggerItem } from "./reveal";
import { LandingThemeToggle } from "./theme-toggle";

type LandingProps = {
  consoleHref: string;
  isAuthenticated: boolean;
};

const ctaPrimary =
  "inline-flex h-11 items-center justify-center rounded-lg bg-foreground px-5 text-sm font-semibold text-background transition-colors hover:brightness-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/90";
const ctaGhost =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border px-5 text-sm font-medium text-foreground/85 transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40";
// `text-foreground/75` sur `bg-muted/55` tombait à 1,97:1 — sous le seuil AA.
const chip = "inline-flex items-center gap-2 rounded-full border border-border bg-muted/55 px-3 py-1 text-xs tracking-wide text-foreground";
const panel =
  "rounded-2xl border border-border bg-muted/30 p-6 shadow-sm";
const footerLink =
  "inline-flex min-h-11 items-center transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40";

const pillars = [
  "Rien à installer : on s’occupe de la mise en place",
  "Vous validez avant que le moindre message parte",
  "Vous gardez l’historique de tout ce qui a été fait",
];

const useCases = [
  {
    icon: <WorkflowIcon className="size-4" />,
    title: "Vos impayés relancés",
    body: "Les factures en retard sont repérées et relancées au bon moment, avec le bon ton. Vous n’avez plus à choisir entre relancer et froisser un client.",
  },
  {
    icon: <MessageCircleIcon className="size-4" />,
    title: "Vos devis préparés",
    body: "Une demande arrive, le devis est rédigé à partir de vos tarifs et de vos précédents. Vous relisez, vous corrigez, vous envoyez.",
  },
  {
    icon: <KeyRoundIcon className="size-4" />,
    title: "Vos e-mails traités",
    body: "Les demandes courantes reçoivent une réponse préparée. Celles qui engagent l’entreprise vous sont remontées avant tout envoi.",
  },
];

const steps = [
  {
    number: "01",
    title: "On s’installe",
    body: "On met le service en place et on le connecte à votre boîte mail. Vous n’avez ni logiciel à installer, ni serveur à gérer.",
  },
  {
    number: "02",
    title: "On apprend votre métier",
    body: "Vos tarifs, vos modèles de courrier, votre façon de parler à vos clients. C’est ce qui distingue une réponse utile d’un message générique.",
  },
  {
    number: "03",
    title: "Vous validez",
    body: "Rien ne part sans vous au démarrage. Vous voyez ce qui est proposé, vous corrigez, et le service apprend de vos corrections.",
  },
  {
    number: "04",
    title: "Vous déléguez ce qui est rodé",
    body: "Ce qui marche tourne seul, ce qui engage passe toujours par vous. C’est vous qui déplacez le curseur, quand vous le décidez.",
  },
];

const faq = [
  {
    question: "Combien ça coûte ?",
    // Le prix vient de `lib/company`, comme les CGU : deux montants affichés qui
    // divergent, c'est un litige.
    answer: `${pricing.miseEnService} de mise en service, puis ${pricing.mensuel} par mois. Pas d’engagement de durée : vous arrêtez quand vous voulez, avec un préavis d’un mois.`,
  },
  {
    question: "Où sont mes données ?",
    answer:
      "Sur des serveurs en France, sur un espace qui n’appartient qu’à vous. Vos e-mails et vos documents ne servent jamais à entraîner un modèle. Si vous partez, tout est supprimé ou exporté, à votre choix.",
  },
  {
    question: "Et si ça répond n’importe quoi à un client ?",
    answer:
      "C’est la première chose qu’on verrouille. Au démarrage, aucun message ne part sans votre validation. Vous n’ouvrez l’envoi automatique que sur ce que vous avez vu fonctionner, et vous pouvez le refermer à tout moment.",
  },
  {
    question: "Faut-il être à l’aise avec l’informatique ?",
    answer:
      "Non. Si vous savez utiliser votre boîte mail, vous savez utiliser le service. La mise en place, les mises à jour et les pannes sont notre affaire, pas la vôtre.",
  },
  {
    question: "Combien de temps avant que ce soit utile ?",
    answer:
      "Comptez une semaine entre le premier échange et les premières relances qui partent. L’essentiel de ce délai, c’est vous qui nous montrez comment vous travaillez.",
  },
];

const tarif = {
  inclus: [
    "Mise en place et connexion à votre boîte mail",
    "Paramétrage à partir de vos tarifs et de vos modèles",
    "Relances, devis et réponses courantes",
    "Historique complet de ce qui a été envoyé",
    "Support par e-mail, réponse sous un jour ouvré",
    "Corrections et ajustements inclus",
  ],
};

export function Landing({ consoleHref, isAuthenticated }: LandingProps) {
  return (
    <div className="relative min-h-dvh bg-background text-foreground antialiased">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_70%_at_50%_5%,oklch(0.96_0.02_145/0.45),transparent_55%)]"
      />

      <SiteHeader consoleHref={consoleHref} isAuthenticated={isAuthenticated} />

      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-16 px-5 pb-16 pt-10 sm:px-8">
        <Hero consoleHref={consoleHref} isAuthenticated={isAuthenticated} />
        <SignalPills />
        <ControlMatrix />
        <HowItWorks />
        <RuntimeProof />
        <Pricing />
        <FAQ />
        <FinalCta consoleHref={consoleHref} isAuthenticated={isAuthenticated} />
      </main>

      <SiteFooter />
    </div>
  );
}

function SiteHeader({ consoleHref, isAuthenticated }: LandingProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center gap-4 px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-[var(--ok)]" />
          <span className="font-medium tracking-tight">Hermes Console</span>
        </Link>

        <nav className="ml-6 hidden items-center gap-6 text-sm md:flex">
          <a href="#workflow" className="text-muted-foreground hover:text-foreground">
            Ce qu&apos;on fait
          </a>
          <a href="#tarifs" className="text-muted-foreground hover:text-foreground">
            Tarifs
          </a>
          <a href="#faq" className="text-muted-foreground hover:text-foreground">
            Questions
          </a>
        </nav>

        {/* Pas de raccourci « Tarifs » ici sur mobile : il faisait déborder
            l'en-tête à 320 px, et le premier bouton du hero y mène déjà. */}
        <div className="ml-auto flex items-center gap-2">
          <LandingThemeToggle />
          {!isAuthenticated ? (
            <Link
              href="/login"
              className="hidden h-9 items-center rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            >
              Se connecter
            </Link>
          ) : null}
          <Link href={consoleHref} className={ctaPrimary}>
            {isAuthenticated ? "Ouvrir ma console" : "Ouvrir la console"}
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero({ consoleHref, isAuthenticated }: LandingProps) {
  const reduce = useReducedMotion();

  return (
    <section id="produit" className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
      <motion.div
        variants={reduce ? undefined : staggerContainer}
        initial={reduce ? undefined : "hidden"}
        animate={reduce ? undefined : "show"}
      >
        <motion.p variants={reduce ? undefined : staggerItem} className={chip}>
          <SparklesIcon className="size-3.5 text-[var(--ok)]" />
          Pour les entreprises de 3 à 50 salariés
        </motion.p>
        <motion.h1
          variants={reduce ? undefined : staggerItem}
          className="mt-4 max-w-2xl text-[clamp(2rem,1.4rem+3vw,3.75rem)] font-semibold leading-[1.05] tracking-tight"
        >
          Votre administratif, traité pendant que vous travaillez.
        </motion.h1>
        <motion.p
          variants={reduce ? undefined : staggerItem}
          className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
        >
          Relances d&apos;impayés, devis, réponses aux clients : on met en place un assistant qui
          s&apos;en occupe, et vous gardez la main sur tout ce qui engage l&apos;entreprise.
        </motion.p>

        <motion.div
          variants={reduce ? undefined : staggerItem}
          className="mt-8 flex flex-col gap-3 sm:flex-row"
        >
          {isAuthenticated ? (
            <>
              <Link href={consoleHref} className={ctaPrimary}>
                Ouvrir ma console
                <ArrowRightIcon className="size-4" />
              </Link>
              <a href="#tarifs" className={ctaGhost}>
                Voir les tarifs
              </a>
            </>
          ) : (
            <>
              <a href="#tarifs" className={ctaPrimary}>
                Voir les tarifs
                <ArrowRightIcon className="size-4" />
              </a>
              <Link href={consoleHref} className={ctaGhost}>
                Se connecter
              </Link>
            </>
          )}
        </motion.div>
      </motion.div>

      <motion.div
        initial={reduce ? undefined : { opacity: 0, y: 18 }}
        animate={reduce ? undefined : { opacity: 1, y: 0 }}
        transition={reduce ? undefined : { duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="rounded-2xl border border-border bg-background p-3 shadow-sm">
          <RuntimeConsole />
        </div>
      </motion.div>
    </section>
  );
}

function SignalPills() {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      {pillars.map((line) => (
        <article key={line} className={panel}>
          <p className="text-sm leading-relaxed text-muted-foreground">{line}</p>
        </article>
      ))}
    </section>
  );
}

function ControlMatrix() {
  return (
    <section id="workflow" className="grid gap-4 lg:grid-cols-3">
      {useCases.map((card) => (
        <article key={card.title} className={panel}>
          <div className="mb-4 inline-flex size-9 items-center justify-center rounded-lg border border-border">
            <span style={{ color: "var(--ok)" }} className="inline-flex">
              {card.icon}
            </span>
          </div>
          <h2 className="text-lg font-semibold">{card.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{card.body}</p>
        </article>
      ))}
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="space-y-4">
      <Reveal>
        <p className="text-xs font-medium text-muted-foreground">COMMENT ÇA SE PASSE</p>
        <h2 className="mt-2 text-2xl font-semibold">Quatre étapes, et vous n&apos;en faites qu&apos;une.</h2>
      </Reveal>

      <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => (
          // `Reveal` rend un div : à l'intérieur du <li>, sinon la liste a des
          // enfants directs qui n'en sont pas et les lecteurs d'écran cessent de
          // l'annoncer comme une liste de quatre étapes.
          <li className={panel} key={step.number}>
            <Reveal delay={index * 0.07}>
              <p className="text-xs font-medium text-[var(--ok)]">{step.number}</p>
              <h3 className="mt-2 text-base font-semibold text-foreground">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  );
}

function RuntimeProof() {
  return (
    <section id="proof" className={`${panel} overflow-hidden`}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Nos engagements</p>
          <h2 className="mt-2 text-2xl font-semibold">Ce sur quoi vous pouvez compter.</h2>
        </div>
        <LayoutTemplateIcon className="size-5 shrink-0 text-[var(--ok)]" />
      </div>
      {/* Des engagements tenables, pas des compteurs d'activité : afficher
          « 12 livrables générés » sur une page publique donnerait un chiffre
          inventé pour une preuve. */}
      <div className="grid gap-3 md:grid-cols-3">
        {[
          ["Mise en service", "1 semaine"],
          ["Vos données", "hébergées en France"],
          ["Engagement de durée", "aucun"],
        ].map(([label, value]) => (
          <article
            key={label}
            className="rounded-xl border border-border bg-background px-4 py-4"
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 text-xl font-semibold text-foreground">{value}</p>
          </article>
        ))}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-border bg-background p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheckIcon className="size-4 shrink-0 text-[var(--ok)]" />
            Vous gardez la main
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Tout ce qui engage l’entreprise vous est soumis avant d’être envoyé. Vous décidez, au
            cas par cas, de ce qui peut partir seul.
          </p>
        </article>
        <article className="rounded-xl border border-border bg-background p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <EyeIcon className="size-4 shrink-0 text-[var(--ok)]" />
            Rien ne se perd
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Chaque message envoyé, chaque devis produit et chaque décision reste consultable. Vous
            pouvez toujours savoir ce qui a été fait, quand, et à la demande de qui.
          </p>
        </article>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="tarifs" className="scroll-mt-20 space-y-4">
      <Reveal>
        <p className="text-xs font-medium text-muted-foreground">Tarifs</p>
        <h2 className="mt-2 text-2xl font-semibold">Un prix, annoncé d&apos;avance.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Pas de palier à déchiffrer, pas de surprise à la facture. Le coût des modèles d&apos;IA
          est facturé à prix coûtant sur votre propre compte : nous ne prenons pas de marge dessus.
        </p>
      </Reveal>

      <Reveal delay={0.05}>
        {/* Une colonne sur mobile, deux à partir de md : le prix passe en premier
            dans le flux, la liste de ce qui est inclus vient le justifier. */}
        <div className={`${panel} grid gap-8 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:items-start`}>
          <div>
            <p className="text-sm text-muted-foreground">Mise en service</p>
            <p className="mt-1 text-[clamp(2rem,1.5rem+2vw,3rem)] font-semibold leading-none tracking-tight">
              {pricing.miseEnService}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">une fois, au démarrage</p>

            <div className="mt-6 border-t border-border pt-6">
              <p className="text-sm text-muted-foreground">Puis, chaque mois</p>
              <p className="mt-1 text-[clamp(2rem,1.5rem+2vw,3rem)] font-semibold leading-none tracking-tight">
                {pricing.mensuel}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">sans engagement de durée</p>
            </div>

            <a href={`mailto:${SUPPORT_EMAIL}?subject=Hermes%20Console%20—%20demande%20d'information`} className={`${ctaPrimary} mt-8 w-full sm:w-auto`}>
              En parler 20 minutes
              <ArrowRightIcon className="size-4" />
            </a>
          </div>

          <ul className="space-y-3">
            {tarif.inclus.map((ligne) => (
              <li key={ligne} className="flex items-start gap-3 text-sm leading-relaxed">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-[var(--ok)]" aria-hidden />
                <span className="text-muted-foreground">{ligne}</span>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </section>
  );
}

function FAQ() {
  return (
    <section id="faq" className="space-y-3">
      <Reveal>
        <p className="text-xs font-medium text-muted-foreground">Questions</p>
        <h2 className="mt-2 text-2xl font-semibold">Questions fréquentes</h2>
      </Reveal>
      <div className="space-y-3">
        {faq.map((item, index) => (
          <Reveal key={item.question} delay={index * 0.05}>
            <details className="group rounded-xl border border-border bg-background px-5 py-4">
              <summary className="cursor-pointer text-sm font-semibold text-foreground marker:text-muted-foreground">
                {item.question}
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
            </details>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function FinalCta({ consoleHref, isAuthenticated }: LandingProps) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border px-6 py-14 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(130%_100%_at_50%_0%,oklch(0.93_0.02_145/0.45),transparent_60%)]"
      />
      <p className="text-xs font-medium uppercase tracking-wider text-foreground/70">
        Vingt minutes, sans engagement
      </p>
      <h2 className="mt-3 text-[clamp(1.5rem,1.2rem+1.5vw,2rem)] font-semibold">
        Voyons si c&apos;est utile chez vous.
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Racontez-nous ce qui vous prend le plus de temps dans la semaine. Si on ne peut rien y
        faire, on vous le dira — c&apos;est plus rapide pour tout le monde.
      </p>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=Hermes%20Console%20—%20demande%20d'information`}
          className={ctaPrimary}
        >
          En parler 20 minutes
          <ArrowRightIcon className="size-4" />
        </a>
        {isAuthenticated ? (
          <Link href={consoleHref} className={ctaGhost}>
            Ouvrir ma console
          </Link>
        ) : (
          <a href="#tarifs" className={ctaGhost}>
            Revoir les tarifs
          </a>
        )}
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-5 py-10 text-sm text-muted-foreground sm:px-8">
        {/* `min-h-11` : au doigt, ces liens faisaient 16 à 20 px de haut. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p>Hermes Console</p>
          <nav className="flex flex-wrap items-center gap-x-6">
            <a href="#workflow" className={footerLink}>
              Ce qu&apos;on fait
            </a>
            <a href="#tarifs" className={footerLink}>
              Tarifs
            </a>
            <a href="#faq" className={footerLink}>
              Questions
            </a>
          </nav>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 border-t border-border pt-4 text-xs">
          <Link href="/mentions-legales" className={footerLink}>
            Mentions légales
          </Link>
          <Link href="/confidentialite" className={footerLink}>
            Confidentialité
          </Link>
          <Link href="/cgu" className={footerLink}>
            CGU
          </Link>
          <a href={`mailto:${SUPPORT_EMAIL}`} className={footerLink}>
            Support
          </a>
        </nav>
        <p className="text-xs text-muted-foreground">
          Service opéré depuis la France, pour les entreprises de 3 à 50 salariés.
        </p>
      </div>
    </footer>
  );
}

"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRightIcon,
  EyeIcon,
  KeyRoundIcon,
  LayoutTemplateIcon,
  MessageCircleIcon,
  ShieldCheckIcon,
  SparklesIcon,
  WorkflowIcon,
} from "lucide-react";
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
const chip = "inline-flex items-center gap-2 rounded-full border border-border bg-muted/55 px-3 py-1 text-xs tracking-wide text-foreground/75";
const panel =
  "rounded-2xl border border-border bg-muted/30 p-6 shadow-sm";

const pillars = [
  "Pas de terminal, pas de JSON-RPC visible",
  "Agents opérationnels, états d’exécution et approbations",
  "Navigation clavier, focus, historique actionnable",
];

const useCases = [
  {
    icon: <WorkflowIcon className="size-4" />,
    title: "Connecter et superviser",
    body: "Reliez un runtime Hermes, lancez un agent et gardez toute la supervision dans une seule vue.",
  },
  {
    icon: <MessageCircleIcon className="size-4" />,
    title: "Intervenir sans perdre le fil",
    body: "Le runtime continue de tourner, la console affiche les actions, les fichiers et les décisions en cours.",
  },
  {
    icon: <KeyRoundIcon className="size-4" />,
    title: "Confirmer avant d&apos;agir",
    body: "Les actions sensibles restent soumises à validation, avec contexte clair et retour immédiat.",
  },
];

const steps = [
  {
    number: "01",
    title: "Relier un runtime",
    body: "Le runtime Hermes devient une source d’exécution unique pour l’équipe.",
  },
  {
    number: "02",
    title: "Déployer un agent",
    body: "Choisissez une mission, connectez les outils nécessaires, puis lancez le flux de travail.",
  },
  {
    number: "03",
    title: "Suivre en direct",
    body: "Chaque étape, chaque jeton et chaque approbation s’affiche dans un fil lisible.",
  },
  {
    number: "04",
    title: "Valider et industrialiser",
    body: "Vous validez les actions importantes, puis vous industrialisez ce qui marche.",
  },
];

const faq = [
  {
    question: "Est-ce réservé aux équipes techniques ?",
    answer:
      "Non. Les équipes métiers travaillent avec les objets métier : sessions, approbations, livrables et historiques.",
  },
  {
    question: "Comment sait-on ce que l’agent a fait ?",
    answer:
      "Chaque exécution est journalisée et visible, avec état d’exécution et preuves de résultat.",
  },
  {
    question: "Peut-on gérer plusieurs agents dans un même espace de travail ?",
    answer:
      "Oui. Hermes Console fédère agents et tâches, avec un pilotage simple par espace de travail et rôle.",
  },
];

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
          <a href="#produit" className="text-muted-foreground hover:text-foreground">
            Produit
          </a>
          <a href="#workflow" className="text-muted-foreground hover:text-foreground">
            Parcours
          </a>
          <a href="#proof" className="text-muted-foreground hover:text-foreground">
            Preuve en direct
          </a>
          <a href="#faq" className="text-muted-foreground hover:text-foreground">
            FAQ
          </a>
        </nav>

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
          Agents visibles, pas boîte noire
        </motion.p>
        <motion.h1
          variants={reduce ? undefined : staggerItem}
          className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight sm:text-6xl"
        >
          Lancez des agents, et suivez-les en direct.
        </motion.h1>
        <motion.p
          variants={reduce ? undefined : staggerItem}
          className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
        >
          Hermes Console transforme l&apos;exécution technique en interface produit : sessions,
          approbations, livrables et supervision continue depuis une console métier.
        </motion.p>

        <motion.div
          variants={reduce ? undefined : staggerItem}
          className="mt-8 flex flex-col gap-3 sm:flex-row"
        >
          <Link href={consoleHref} className={ctaPrimary}>
            {isAuthenticated ? "Ouvrir ma console" : "Ouvrir la console"}
            <ArrowRightIcon className="size-4" />
          </Link>
          <a href="#workflow" className={ctaGhost}>
            Voir le parcours
          </a>
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
        <p className="text-xs font-medium text-muted-foreground">COMME ÇA MARCHE</p>
        <h2 className="mt-2 text-2xl font-semibold">Un cycle simple, une gouvernance claire.</h2>
      </Reveal>

      <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => (
          <Reveal delay={index * 0.07} key={step.number}>
            <li className={panel}>
              <p className="text-xs font-medium text-[var(--ok)]">{step.number}</p>
              <h3 className="mt-2 text-base font-semibold text-foreground">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          </Reveal>
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
          <p className="text-xs font-medium text-muted-foreground">Preuve en direct</p>
          <h2 className="mt-2 text-2xl font-semibold">Des indicateurs qui racontent l&apos;activité.</h2>
        </div>
        <LayoutTemplateIcon className="size-5 text-[var(--ok)]" />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {[
          ["Agents actifs", "3"],
          ["Approbations en attente", "1"],
          ["Livrables générés", "12"],
        ].map(([label, value]) => (
          <article
            key={label}
            className="rounded-xl border border-border bg-background px-4 py-4"
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
          </article>
        ))}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-border bg-background p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheckIcon className="size-4 text-[var(--ok)]" />
            Gouvernance
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Les actions sensibles sont explicitement marquées et peuvent être validées en un clic.
          </p>
        </article>
        <article className="rounded-xl border border-border bg-background p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <EyeIcon className="size-4 text-[var(--ok)]" />
            Supervision
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Chaque exécution reste accessible, consultable et partageable au sein de l’espace de travail.
          </p>
        </article>
      </div>
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
        Produit prêt pour vos équipes
      </p>
      <h2 className="mt-3 text-3xl font-semibold">Passez à la supervision continue.</h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Ouvrez un espace de travail, connectez vos outils, lancez vos agents et pilotez les
        actions critiques depuis une surface opérationnelle claire.
      </p>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link href={consoleHref} className={ctaPrimary}>
          {isAuthenticated ? "Ouvrir ma console" : "Ouvrir la console"}
          <ArrowRightIcon className="size-4" />
        </Link>
        <a href="#produit" className={ctaGhost}>
          Revenir en haut
        </a>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-5 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>Hermes Console</p>
        <nav className="flex gap-6">
          <a href="#produit" className="hover:text-foreground">
            Produit
          </a>
        <a href="#proof" className="hover:text-foreground">
            Preuve en direct
          </a>
        <a href="#faq" className="hover:text-foreground">
          FAQ
        </a>
        </nav>
        <p className="text-xs text-muted-foreground/70">
          Conçu pour les équipes opérationnelles, avec des flux de travail de production.
        </p>
      </div>
    </footer>
  );
}

"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRightIcon,
  EyeIcon,
  FileTextIcon,
  GaugeIcon,
  KeyRoundIcon,
  ListChecksIcon,
  MessagesSquareIcon,
  PlugIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { RuntimeConsole } from "./runtime-console";
import { Reveal, staggerContainer, staggerItem } from "./reveal";
import { LandingThemeToggle } from "./theme-toggle";

/* lime accent that stays legible in both themes: lime-600 on light, lime-400 on dark */
const accent = "text-[#65a30d] dark:text-[#a3e635]";
const accentDot = "bg-[#84cc16] dark:bg-[#a3e635]";

const ctaPrimary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#84cc16] px-5 text-sm font-semibold text-black transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-[#a3e635] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#84cc16] motion-reduce:transform-none dark:bg-[#a3e635] dark:hover:bg-[#bef264]";
const ctaGhost =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border px-5 text-sm font-medium text-foreground/80 transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40";

const eyebrowChip =
  "inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 font-mono text-xs tracking-wide text-muted-foreground";

type LandingProps = {
  consoleHref: string;
  isAuthenticated: boolean;
};

export function Landing({ consoleHref, isAuthenticated }: LandingProps) {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-background text-foreground antialiased">
      {/* ambient background: grid texture + top lime glow (both adapt to theme) */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 [--grid-line:rgba(10,10,10,0.06)] dark:[--grid-line:rgba(255,255,255,0.035)]"
      >
        <div
          className="absolute inset-0 opacity-70 dark:opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--grid-line) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage:
              "radial-gradient(120% 80% at 50% 0%, black 30%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(120% 80% at 50% 0%, black 30%, transparent 80%)",
          }}
        />
        <div
          className="absolute inset-x-0 top-0 h-[520px]"
          style={{
            background:
              "radial-gradient(50% 60% at 62% 0%, oklch(0.86 0.2 130 / 0.13), transparent 70%)",
          }}
        />
      </div>

      <Nav consoleHref={consoleHref} isAuthenticated={isAuthenticated} />

      <main className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        <Hero consoleHref={consoleHref} isAuthenticated={isAuthenticated} />
        <TrustStrip />
        <Features />
        <HowItWorks />
        <SecurityPanel />
        <FinalCta consoleHref={consoleHref} isAuthenticated={isAuthenticated} />
      </main>

      <Footer />
    </div>
  );
}

/* ─────────────────────────── Nav ─────────────────────────── */

function Nav({ consoleHref, isAuthenticated }: LandingProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-4 px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${accentDot}`} />
          <span className="font-mono text-sm font-medium tracking-tight text-foreground">
            hermes<span className="text-muted-foreground">/console</span>
          </span>
        </Link>

        <nav className="ml-6 hidden items-center gap-6 md:flex">
          {[
            ["Produit", "#produit"],
            ["Fonctionnement", "#fonctionnement"],
            ["Sécurité", "#securite"],
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {label}
            </a>
          ))}
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
          <Link
            href={consoleHref}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#84cc16] px-3.5 text-sm font-semibold text-black transition-colors hover:bg-[#a3e635] dark:bg-[#a3e635] dark:hover:bg-[#bef264]"
          >
            {isAuthenticated ? "Ouvrir ma console" : "Ouvrir la console"}
            <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ─────────────────────────── Hero ─────────────────────────── */

function Hero({ consoleHref, isAuthenticated }: LandingProps) {
  const reduce = useReducedMotion();

  return (
    <section
      id="produit"
      className="grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:py-28"
    >
      <motion.div
        variants={reduce ? undefined : staggerContainer}
        initial={reduce ? undefined : "hidden"}
        animate={reduce ? undefined : "show"}
      >
        <motion.p
          variants={reduce ? undefined : staggerItem}
          className={`mb-5 ${eyebrowChip}`}
        >
          <span className={`size-1.5 rounded-full ${accentDot}`} />
          RUNTIME v1 · CONSOLE CLIENT
        </motion.p>

        <motion.h1
          variants={reduce ? undefined : staggerItem}
          className="font-sans font-semibold tracking-[-0.02em] text-foreground"
          style={{ fontSize: "clamp(2.25rem, 5.5vw, 3.75rem)", lineHeight: 1.05 }}
        >
          Supervisez vos agents.
          <br />
          <span className="text-muted-foreground">Pas le terminal.</span>
        </motion.h1>

        <motion.p
          variants={reduce ? undefined : staggerItem}
          className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
        >
          Hermes Console transforme un runtime d&apos;agents en poste
          d&apos;opérations : chat, tâches, fichiers, connaissances et
          validations — sans une seule ligne de JSON-RPC ni de flag CLI.
        </motion.p>

        <motion.div
          variants={reduce ? undefined : staggerItem}
          className="mt-8 flex flex-col gap-3 sm:flex-row"
        >
          <Link href={consoleHref} className={ctaPrimary}>
            {isAuthenticated ? "Ouvrir ma console" : "Ouvrir la console"}
            <ArrowRightIcon className="size-4" />
          </Link>
          <a href="#fonctionnement" className={ctaGhost}>
            Voir le runtime
          </a>
        </motion.div>

        <motion.ul
          variants={reduce ? undefined : staggerItem}
          className="mt-8 flex flex-wrap gap-x-4 gap-y-2 font-mono text-xs text-muted-foreground"
        >
          {["chat", "sessions", "tasks", "files", "knowledge", "approvals"].map(
            (t) => (
              <li key={t} className="flex items-center gap-1.5">
                <span className={accent}>·</span>
                {t}
              </li>
            ),
          )}
        </motion.ul>
      </motion.div>

      <motion.div
        className="flex justify-center lg:justify-end"
        initial={reduce ? undefined : { opacity: 0, y: 24 }}
        animate={reduce ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        <RuntimeConsole />
      </motion.div>
    </section>
  );
}

/* ────────────────────────── Trust strip ────────────────────────── */

function TrustStrip() {
  const principles = [
    ["Role-aware", "Propriétaire, membre, lecteur"],
    ["WCAG 2.2 AA", "Clavier & lecteur d'écran"],
    ["Reduced-motion", "Respecté par défaut"],
    ["No raw payloads", "Zéro JSON-RPC exposé"],
  ];
  return (
    <Reveal as="section" className="border-y border-border py-8">
      <p className="mb-6 text-center font-mono text-xs tracking-wide text-muted-foreground">
        PENSÉ POUR LES ÉQUIPES QUI OPÈRENT DES AGENTS EN PRODUCTION
      </p>
      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
        {principles.map(([title, sub]) => (
          <li key={title} className="bg-background px-4 py-4 text-center">
            <p className="font-mono text-sm text-foreground">{title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

/* ─────────────────────────── Features ─────────────────────────── */

function Features() {
  return (
    <section id="fonctionnement" className="py-20 sm:py-28">
      <Reveal className="mb-14 max-w-2xl">
        <p className={`mb-3 font-mono text-xs tracking-wide ${accent}`}>
          CE QUE VOUS PILOTEZ
        </p>
        <h2
          className="font-semibold tracking-[-0.02em] text-foreground"
          style={{ fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)", lineHeight: 1.1 }}
        >
          Des concepts métier, pas des internals.
        </h2>
        <p className="mt-4 text-muted-foreground">
          Chaque objet Hermes devient lisible et actionnable : sessions,
          approbations, livrables. La puissance technique reste accessible par
          divulgation progressive.
        </p>
      </Reveal>

      <div className="flex flex-col gap-6">
        <FeatureRow
          icon={<MessagesSquareIcon className="size-4" />}
          eyebrow="Sessions"
          title="Reprenez n'importe quelle session"
          body="Chaque conversation Hermes redevient un objet suivi : agent actif, état runtime, historique complet. Reprenez le travail exactement où l'agent l'a laissé."
          media={<SessionsMedia />}
        />
        <FeatureRow
          reverse
          icon={<ShieldCheckIcon className="size-4" />}
          eyebrow="Approbations"
          title="Validez les actions sensibles, explicitement"
          body="Approbations, sudo et demandes de secret apparaissent dans le fil comme des étapes claires, avec un langage sans ambiguïté — jamais une icône seule pour décider."
          media={<ApprovalMedia />}
        />
        <FeatureRow
          icon={<FileTextIcon className="size-4" />}
          eyebrow="Livrables"
          title="Vos agents produisent des résultats consultables"
          body="Tâches, fichiers et base de connaissances : le travail de l'agent devient un livrable que l'on ouvre, exporte et partage — pas un flux qui défile."
          media={<DeliverablesMedia />}
        />
      </div>
    </section>
  );
}

function FeatureRow({
  icon,
  eyebrow,
  title,
  body,
  media,
  reverse,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  body: string;
  media: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <Reveal className="grid items-center gap-6 rounded-2xl border border-border bg-muted/40 p-6 sm:p-8 lg:grid-cols-2 lg:gap-10 dark:bg-white/[0.02]">
      <div className={reverse ? "lg:order-2" : undefined}>
        <p
          className={`inline-flex items-center gap-2 rounded-full border border-border bg-background px-2.5 py-1 font-mono text-[0.7rem] tracking-wide ${accent}`}
        >
          <span className="text-muted-foreground">{icon}</span>
          {eyebrow}
        </p>
        <h3 className="mt-4 text-xl font-semibold tracking-[-0.01em] text-foreground sm:text-2xl">
          {title}
        </h3>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>
      </div>
      <div className={reverse ? "lg:order-1" : undefined}>{media}</div>
    </Reveal>
  );
}

/* "device screen" media frames — deliberately dark in both themes (product screens). */
function MediaFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[oklch(0.185_0_0)] p-3 font-mono text-xs shadow-[0_12px_40px_-16px_rgba(0,0,0,0.35)] dark:shadow-none">
      {children}
    </div>
  );
}

function SessionsMedia() {
  const rows = [
    ["analyse-contrat", "opus · actif", true],
    ["revue-factures", "sonnet · en pause", false],
    ["veille-marché", "haiku · terminé", false],
  ] as const;
  return (
    <MediaFrame>
      <ul className="flex flex-col gap-1.5">
        {rows.map(([name, meta, active]) => (
          <li
            key={name}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 ${
              active
                ? "bg-[#a3e635]/10 text-white"
                : "text-white/55 hover:bg-white/[0.03]"
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${
                active ? "bg-[#a3e635]" : "bg-white/25"
              }`}
            />
            <span className="text-white/85">{name}</span>
            <span className="ml-auto text-white/40">{meta}</span>
          </li>
        ))}
      </ul>
    </MediaFrame>
  );
}

function ApprovalMedia() {
  return (
    <MediaFrame>
      <div className="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] p-3.5">
        <div className="flex items-center gap-2 text-amber-300/90">
          <KeyRoundIcon className="size-3.5" />
          <span className="text-[0.7rem] tracking-wide uppercase">
            Secret requis
          </span>
        </div>
        <p className="mt-2 text-white/80">
          L&apos;agent demande l&apos;accès à{" "}
          <span className="text-white">STRIPE_API_KEY</span>.
        </p>
        <div className="mt-3 flex gap-2">
          <span className="rounded-md bg-[#a3e635] px-3 py-1.5 font-semibold text-black">
            Autoriser une fois
          </span>
          <span className="rounded-md border border-white/15 px-3 py-1.5 text-white/70">
            Refuser
          </span>
        </div>
      </div>
    </MediaFrame>
  );
}

function DeliverablesMedia() {
  const files = [
    ["relance-acme.docx", "généré · 12 Ko"],
    ["synthèse-contrat.pdf", "généré · 84 Ko"],
    ["échéancier.csv", "généré · 3 Ko"],
  ] as const;
  return (
    <MediaFrame>
      <ul className="flex flex-col gap-1.5">
        {files.map(([name, meta]) => (
          <li
            key={name}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-white/55 hover:bg-white/[0.03]"
          >
            <FileTextIcon className="size-3.5 text-[#a3e635]" />
            <span className="text-white/85">{name}</span>
            <span className="ml-auto text-white/40">{meta}</span>
          </li>
        ))}
      </ul>
    </MediaFrame>
  );
}

/* ────────────────────────── How it works ────────────────────────── */

function HowItWorks() {
  const steps = [
    {
      icon: <PlugIcon className="size-4" />,
      title: "Connecter le runtime",
      body: "Reliez votre instance Hermes. La console détecte agents, providers et sessions existantes — aucune configuration de profil à la main.",
    },
    {
      icon: <MessagesSquareIcon className="size-4" />,
      title: "Opérer les agents",
      body: "Discutez, lancez des tâches, déposez des fichiers. Les appels d'outils s'affichent en clair, étape par étape, dans le fil.",
    },
    {
      icon: <EyeIcon className="size-4" />,
      title: "Superviser & valider",
      body: "Suivez la santé du workspace, tranchez les approbations en attente, gardez la trace de chaque action sensible.",
    },
  ];
  return (
    <section className="border-t border-border py-20 sm:py-28">
      <Reveal className="mb-12 max-w-2xl">
        <p className={`mb-3 font-mono text-xs tracking-wide ${accent}`}>
          LE POSTE D&apos;OPÉRATIONS
        </p>
        <h2
          className="font-semibold tracking-[-0.02em] text-foreground"
          style={{ fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)", lineHeight: 1.1 }}
        >
          Du runtime à la supervision, en trois temps.
        </h2>
      </Reveal>

      <ol className="grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <Reveal
            as="li"
            key={s.title}
            delay={i * 0.08}
            className="relative rounded-2xl border border-border bg-muted/40 p-6 dark:bg-white/[0.02]"
          >
            <div className="flex items-center justify-between">
              <span
                className={`flex size-9 items-center justify-center rounded-lg border border-border bg-background ${accent}`}
              >
                {s.icon}
              </span>
              <span className="font-mono text-2xl font-semibold text-muted-foreground/25">
                0{i + 1}
              </span>
            </div>
            <h3 className="mt-5 text-lg font-semibold text-foreground">
              {s.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {s.body}
            </p>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

/* ────────────────────────── Security panel ────────────────────────── */

function SecurityPanel() {
  const points = [
    ["Accès selon le rôle", "Chaque action est bornée par le rôle : propriétaire, membre ou lecteur."],
    ["Aucun secret exposé", "Clés, prompts internes et chemins de profil ne fuitent jamais dans l'interface."],
    ["Erreurs de premier ordre", "Sessions périmées et approbations en attente sont traitées comme des états de travail."],
    ["Accessible par défaut", "Navigation clavier, focus visible, indices d'état non chromatiques."],
  ];
  return (
    <section id="securite" className="py-20 sm:py-28">
      <Reveal className="overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-muted/60 to-transparent p-8 sm:p-12 dark:from-white/[0.04]">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p
              className={`mb-3 inline-flex items-center gap-2 font-mono text-xs tracking-wide ${accent}`}
            >
              <GaugeIcon className="size-3.5" />
              SÛR PAR CONSTRUCTION
            </p>
            <h2
              className="font-semibold tracking-[-0.02em] text-foreground"
              style={{ fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)", lineHeight: 1.1 }}
            >
              La confiance est un état, pas une décoration.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
              Hermes reste le moteur d&apos;exécution et la source de vérité. La
              console rend son état lisible et ses actions réversibles, sans
              jamais exposer les rouages bruts.
            </p>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {points.map(([title, body]) => (
              <li
                key={title}
                className="rounded-xl border border-border bg-background p-4"
              >
                <div className="flex items-center gap-2 text-foreground">
                  <ShieldCheckIcon className={`size-4 ${accent}`} />
                  <span className="text-sm font-medium">{title}</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </section>
  );
}

/* ─────────────────────────── Final CTA ─────────────────────────── */

function FinalCta({ consoleHref, isAuthenticated }: LandingProps) {
  return (
    <Reveal
      as="section"
      className="relative overflow-hidden rounded-3xl border border-border px-6 py-16 text-center sm:py-24"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(50% 100% at 50% 100%, oklch(0.86 0.2 130 / 0.15), transparent 70%)",
        }}
      />
      <span className={`${eyebrowChip}`}>
        <ListChecksIcon className={`size-3.5 ${accent}`} />
        Prêt à opérer
      </span>
      <h2
        className="mx-auto mt-6 max-w-2xl font-semibold tracking-[-0.02em] text-foreground"
        style={{ fontSize: "clamp(2rem, 4.5vw, 3rem)", lineHeight: 1.08 }}
      >
        Prenez la main sur vos agents.
      </h2>
      <p className="mx-auto mt-4 max-w-md text-muted-foreground">
        Un poste d&apos;opérations calme et précis pour un runtime qui, lui, ne
        dort jamais.
      </p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Link href={consoleHref} className={ctaPrimary}>
          {isAuthenticated ? "Ouvrir ma console" : "Ouvrir la console"}
          <ArrowRightIcon className="size-4" />
        </Link>
        <a href="#produit" className={ctaGhost}>
          Revoir le produit
        </a>
      </div>
    </Reveal>
  );
}

/* ─────────────────────────── Footer ─────────────────────────── */

function Footer() {
  return (
    <footer className="mt-20 border-t border-border">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center justify-between gap-4 px-5 py-10 sm:flex-row sm:px-8">
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${accentDot}`} />
          <span className="font-mono text-sm text-muted-foreground">
            hermes<span className="text-muted-foreground/60">/console</span>
          </span>
        </div>
        <nav className="flex gap-6 text-sm text-muted-foreground">
          <a href="#produit" className="hover:text-foreground">
            Produit
          </a>
          <a href="#fonctionnement" className="hover:text-foreground">
            Fonctionnement
          </a>
          <a href="#securite" className="hover:text-foreground">
            Sécurité
          </a>
        </nav>
        <p className="font-mono text-xs text-muted-foreground/60">
          Hermes reste le moteur. La console, votre poste.
        </p>
      </div>
    </footer>
  );
}

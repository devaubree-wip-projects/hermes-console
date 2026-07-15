"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";

/**
 * The signature element: a live Hermes session transcript that boots line by line.
 * It mirrors the real product — user turn, tool call, approval gate, deliverable —
 * so the hero opens on the most characteristic thing in the subject's world.
 */

type Line =
  | { kind: "user"; text: string }
  | { kind: "tool"; label: string; arg: string; state: "run" | "done"; ms?: string }
  | { kind: "approval"; text: string }
  | { kind: "result"; text: string };

const LINES: Line[] = [
  { kind: "user", text: "Analyse le contrat et prépare la relance client." },
  { kind: "tool", label: "read_file", arg: "contrat-2026.pdf", state: "done", ms: "2.4s" },
  { kind: "tool", label: "extract", arg: "clauses · échéances", state: "done", ms: "1.1s" },
  { kind: "approval", text: "Envoyer la relance à client@acme.co ?" },
  { kind: "result", text: "Approuvé · tâche « Relance ACME » créée" },
];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.7, delayChildren: 0.5 } },
};

const line: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

export function RuntimeConsole() {
  const reduce = useReducedMotion();

  return (
    <div className="relative w-full max-w-md">
      {/* ambient desk glow behind the panel */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-8 -z-10 rounded-[2rem] opacity-40"
        style={{
          background:
            "linear-gradient(140deg, oklch(0.18_0.01_145 / 0.12), transparent 70%)",
        }}
      />

      <div className="overflow-hidden rounded-xl border border-border bg-muted shadow-sm">
        {/* window chrome */}
        <div className="flex items-center gap-2.5 border-b border-border bg-background px-4 py-3">
          <span className="relative flex size-2 text-[var(--ok)]">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#a3e635] opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-[var(--ok)]" />
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            session · analyse-contrat
          </span>
          <span className="ml-auto font-mono text-[0.65rem] tracking-wide text-muted-foreground">
            RUNTIME · LIVE
          </span>
        </div>

        {/* transcript */}
        <motion.ol
          className="flex flex-col gap-3 p-4 font-mono text-[0.8rem] leading-relaxed text-foreground"
          variants={reduce ? undefined : container}
          initial={reduce ? undefined : "hidden"}
          animate={reduce ? undefined : "show"}
          aria-label="Exemple de session Hermes"
        >
          {LINES.map((l, i) => (
            <motion.li key={i} variants={reduce ? undefined : line}>
              <TranscriptLine line={l} />
            </motion.li>
          ))}

          {!reduce && (
            <motion.li
              variants={line}
              className="flex items-center gap-2 text-muted-foreground"
            >
              <span className="text-[var(--ok)]">▸</span>
              <span className="inline-block h-4 w-1.5 animate-pulse bg-white/50" />
            </motion.li>
          )}
        </motion.ol>
      </div>
    </div>
  );
}

function TranscriptLine({ line }: { line: Line }) {
  switch (line.kind) {
      case "user":
        return (
          <div className="flex gap-2.5">
            <span className="shrink-0 text-muted-foreground">▸ user</span>
            <span className="text-foreground/90">{line.text}</span>
          </div>
        );
    case "tool":
      return (
        <div className="flex items-center gap-2.5">
          <span className="shrink-0 text-[var(--foreground-soft)]">◇ tool</span>
          <span className="text-foreground/80">
            {line.label}
            <span className="text-muted-foreground"> · {line.arg}</span>
          </span>
          <span className="ml-auto flex items-center gap-1.5 text-[var(--ok)]">
            <span aria-hidden>✓</span>
            <span className="text-muted-foreground">{line.ms}</span>
          </span>
        </div>
      );
    case "approval":
      return (
        <div className="rounded-lg border border-[var(--warn)]/30 bg-[var(--warn)]/[0.06] px-3 py-2.5">
          <div className="flex items-center gap-2 text-amber-300/90">
            <span className="text-[var(--warn)]" aria-hidden>
              ⚠
            </span>
            <span className="text-[0.7rem] tracking-wide uppercase">
              Approbation requise
            </span>
          </div>
          <p className="mt-1 text-foreground/80">{line.text}</p>
          <div className="mt-2.5 flex gap-2">
            <span className="rounded-md bg-[var(--ok)] px-2.5 py-1 text-[0.7rem] font-semibold text-background">
              Approuver
            </span>
            <span className="rounded-md border border-border px-2.5 py-1 text-[0.7rem] text-muted-foreground">
              Refuser
            </span>
          </div>
        </div>
      );
    case "result":
      return (
        <div className="flex gap-2.5 text-[var(--ok)]">
          <span aria-hidden>✓</span>
          <span className="text-foreground/90">{line.text}</span>
        </div>
      );
  }
}

# Product

## Register

product

## Users

Hermes Console is used by client teams, operators, and workspace owners who need to run and supervise AI agents without learning the Hermes CLI. Owners configure the runtime and access, members operate agents and approve work, and viewers follow activity without mutating it.

## Product Purpose

Turn Hermes from a terminal-first agent runtime into a client-facing operating console. The product should make agents, sessions, tasks, knowledge, files, automations, and approvals understandable as business objects while Hermes remains the execution engine and source of truth for agent state.

Success means a user can enter a workspace, understand its health from the dashboard, select or create an agent, resume any session, supervise tool activity, and safely approve sensitive actions without seeing raw JSON-RPC, profile folders, or CLI flags.

## Brand Personality

Precise, calm, capable. The interface should feel like a trusted operations desk: dense enough for serious work, restrained enough to stay readable, and direct about runtime state and risk.

## Anti-references

- Do not look or behave like a terminal emulator wrapped in a website.
- Do not present a generic AI textarea disconnected from agents, sessions, tools, and approvals.
- Do not use repetitive SaaS card grids, decorative gradients, glassmorphism, or oversized vanity metrics.
- Do not expose implementation vocabulary such as profile folders, raw MCP configuration, Docker, or internal prompts where a product concept exists.

## Design Principles

- Make the active tenant, workspace, agent, and session unambiguous.
- Show execution state and consequences before decoration.
- Keep technical power available through progressive disclosure and role-aware controls.
- Preserve familiar product patterns so the user can focus on the work.
- Treat visible errors, stale sessions, and pending approvals as first-class workflow states.

## Accessibility & Inclusion

Target WCAG 2.2 AA. All workflows must support keyboard navigation, visible focus, screen-reader labels, reduced motion, non-color status cues, and responsive layouts down to mobile widths. Destructive and approval actions require explicit language and cannot rely on icon meaning alone.

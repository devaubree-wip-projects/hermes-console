---
name: Hermes Console
description: A calm operating console for client-managed Hermes agents.
colors:
  canvas: "oklch(1 0 0)"
  ink: "oklch(0.145 0 0)"
  surface-muted: "oklch(0.97 0 0)"
  border: "oklch(0.922 0 0)"
  success: "oklch(0.62 0.17 145)"
  warning: "oklch(0.75 0.16 70)"
  danger: "oklch(0.577 0.245 27.325)"
typography:
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.35
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  field:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
---

# Design System: Hermes Console

## 1. Overview

**Creative North Star: "The Operations Desk"**

Hermes Console is a restrained, information-rich product interface. It uses the existing xulux shell as its visual foundation and favors clear hierarchy, stable navigation, and compact state communication. It should feel composed during long-running work and explicit when human action is required.

The system rejects terminal cosplay, generic AI chat framing, decorative dashboard grids, and visual effects that compete with the task.

**Key Characteristics:**

- Neutral surfaces with semantic color reserved for state.
- Compact product typography with one sans family and mono only for code.
- Three-pane chat at desktop widths, progressive collapse on smaller screens.
- Skeletons for loading and instructional empty states.

## 2. Colors

The palette is neutral and operational. Color communicates selection, success, warning, danger, and data series rather than brand decoration.

### Primary

- **Operational Ink** (`oklch(0.145 0 0)`): primary actions, strong text, active navigation.

### Neutral

- **Clear Canvas** (`oklch(1 0 0)`): primary content surface.
- **Quiet Surface** (`oklch(0.97 0 0)`): sidebars, secondary controls, grouped rows.
- **Soft Boundary** (`oklch(0.922 0 0)`): borders and dividers.

### Named Rules

**The State-Only Color Rule.** Semantic color is used for state and data, never as a decorative stripe or page wash.

## 3. Typography

**Display Font:** Inter with system sans fallbacks  
**Body Font:** Inter with system sans fallbacks  
**Label/Mono Font:** JetBrains Mono for code and identifiers only

**Character:** Familiar, compact, and highly legible. Hierarchy comes from weight and spacing rather than dramatic scale.

### Hierarchy

- **Headline** (600, 1.25rem, 1.3): page titles and major workspace states.
- **Title** (600, 1.125rem, 1.35): pane and section headings.
- **Body** (400, 0.875rem, 1.5): interface copy, capped at 70 characters for prose.
- **Label** (500, 0.75rem, 1.35): metadata, controls, and table headings.

### Named Rules

**The One-Family Rule.** Product labels, headings, and body copy use the same sans family; mono is reserved for machine values.

## 4. Elevation

The interface is flat by default and creates depth through tonal layering and borders. Low ambient shadows are reserved for floating menus, sheets, and dialogs.

### Shadow Vocabulary

- **Low ambient** (`0 1px 2px #0000000d`): menus and small overlays.
- **Elevated overlay** (`0 1px 12px #0000000f, 0 0 1px #00000052`): dialogs and command surfaces.

### Named Rules

**The Flat-at-Rest Rule.** Main content, rows, and panes do not float above each other with shadows.

## 5. Components

### Buttons

- **Shape:** compact rounded rectangle (`8px`).
- **Primary:** operational ink on clear canvas inverse, with 8px by 12px padding.
- **Hover / Focus:** tonal shift, visible focus ring, 150 to 200ms state transition.
- **Secondary / Ghost:** quiet surface or transparent background with the same geometry.

### Chips

- **Style:** muted background, concise label, icon or dot only when it adds state information.
- **State:** selected chips use stronger text and boundary contrast, not saturated fills.

### Cards / Containers

- **Corner Style:** `10px` for bounded content that truly forms one object.
- **Background:** clear canvas or quiet surface.
- **Shadow Strategy:** flat at rest.
- **Border:** one-pixel soft boundary.
- **Internal Padding:** 16px to 24px, varied by density.

### Inputs / Fields

- **Style:** clear surface, one-pixel boundary, `8px` radius.
- **Focus:** ring plus border contrast.
- **Error / Disabled:** semantic text, icon, and explanatory copy; never color alone.

### Navigation

Use a persistent product sidebar, readable tenant/workspace context, active-route tonal fill, and a responsive sheet on mobile. Chat adds an agent and session rail without creating a second global navigation system.

### Runtime Interaction

Tool calls, approvals, clarification, sudo, and secret requests appear in the transcript as structured message parts with explicit state and actions.

## 6. Do's and Don'ts

### Do:

- **Do** make tenant, workspace, agent, session, and runtime status visible at decision points.
- **Do** use skeletons for loading and actionable empty states for missing providers, agents, or sessions.
- **Do** keep controls consistent across chat, dashboard, settings, and administration.
- **Do** honor reduced motion and retain visible keyboard focus.

### Don't:

- **Don't** make this look or behave like a terminal emulator wrapped in a website.
- **Don't** present a generic AI textarea disconnected from agents, sessions, tools, and approvals.
- **Don't** use repetitive SaaS card grids, decorative gradients, glassmorphism, oversized vanity metrics, or colored side-stripe borders.
- **Don't** expose secrets, internal prompts, profile paths, or raw protocol payloads in normal product workflows.

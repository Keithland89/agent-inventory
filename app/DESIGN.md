---
name: Agent Inventory app
description: Calm admin workspace for the agent estate, Copilot activity and AI risk, computed in the browser from live connectors or the anonymised sample.
colors:
  canvas: "#f3f6f5"
  surface: "#ffffff"
  surface-2: "#f7faf9"
  ink: "#12201e"
  ink-2: "#445653"
  ink-3: "#5f716e"
  line: "#d9e2e0"
  band: "#0b3d3a"
  band-accent: "#7fe0cf"
  accent: "#0f766e"
  accent-soft: "#e6f3f0"
  agent: "#6d28d9"
  risk-high: "#b42318"
  risk-medium: "#b45309"
  risk-low: "#5a9e94"
  group-chat: "#0f766e"
  group-in-app: "#2563eb"
  group-cowork: "#be185d"
  group-agents: "#6d28d9"
  group-other: "#7b8794"
typography:
  page-title:
    fontFamily: "Segoe UI Variable Display, Segoe UI, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 600
  kpi-value:
    fontFamily: "Segoe UI Variable Display, Segoe UI, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    fontFeature: "tnum"
  panel-title:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  body:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    lineHeight: 1.45
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  pill: "999px"
spacing:
  gutter: "16px"
  page-x: "28px"
components:
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  data-mode-badge:
    rounded: "{rounded.pill}"
  drawer:
    backgroundColor: "{colors.surface}"
---

# Design

## Overview

The app shares its visual language with the AI in One app: a dark teal header band, a pale canvas and white panels. It is a working tool for admins, so it favours dense tables, plain labels and numbers that line up over decoration.

## Colors

- Teal is the brand and the default series colour. Violet always means agents.
- Risk uses red (High), amber (Medium) and muted teal (Low) everywhere, including badges, bars and drawer chips.
- Copilot surface groups have fixed colours: Copilot Chat teal, In-app Copilot blue, Cowork magenta, Agents violet, Other grey.
- Activity status and habit cohorts use a teal ramp from dark (most active) to pale (least active). Grey means no signal.

## Typography

Segoe UI Variable throughout. KPI values use tabular numerals so columns of figures align.

## Layout

- The header band holds the title, the data-mode badge (Live or Sample), the as-of time and the data-source button.
- Tabs sit under the band. Tabs with several report pages show sub-view pills.
- Slicers sit in one row above the content and apply to every view on the tab.
- Content flows as KPI cards, then charts, then tables, matching the order of the report page.

## Elevation & Depth

Flat panels with a 1px line border. Only the agent drawer and dialogs cast a shadow.

## Shapes

10px panel corners, 8px controls, pill badges.

## Components

- **KPI card:** label, value, optional footnote.
- **Charts:** hand-written SVG with no chart library. Hover shows the exact value.
- **DataTable:** sortable and searchable, with a "Show more" button for long tables. Agent rows open the drawer.
- **Agent drawer:** identity, risk breakdown by factor, sharing, tools, knowledge and usage for one agent.
- **Lane status:** one row per lane with its state, row count, time and last run.

## Do's and Don'ts

- Do say why a panel is empty: lane not set up, access denied or no matching rows.
- Do keep the data-mode badge visible at all times.
- Don't invent colours for risk or surface groups; use the fixed ones.
- Don't show names that weren't resolved; show the id or "Unresolved".

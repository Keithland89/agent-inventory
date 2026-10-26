---
name: Copilot Inventory app
description: Calm admin workspace for the agent estate, Copilot activity and AI risk, computed in the browser from live connectors or the anonymised sample.
colors:
  canvas: "#f4f5fa"
  surface: "#ffffff"
  surface-2: "#f8f8fc"
  ink: "#17172f"
  ink-2: "#474a63"
  ink-3: "#5f6279"
  line: "#dcdeeb"
  band: "#1e1b4b"
  accent: "#4f46e5"
  accent-soft: "#eef0ff"
  agent: "#0f766e"
  risk-high: "#b42318"
  risk-medium: "#b45309"
  risk-low: "#8187dc"
  group-chat: "#4f46e5"
  group-in-app: "#0284c7"
  group-cowork: "#be185d"
  group-agents: "#0f766e"
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

The app shares its layout with the AI in One app, a pale canvas and white panels, but has its own indigo palette, close to the Copilot brand: a light header band washed with indigo at the left, with deep indigo kept for the logo tile, the data-source button and the questions in the Ask panel. It is a working tool for admins, so it favours dense tables, plain labels and numbers that line up over decoration.

## Colors

- Indigo is the brand and the default series colour. Teal always means agents.
- Risk uses red (High), amber (Medium) and soft indigo (Low) everywhere, including badges, bars and drawer chips.
- Copilot surface groups have fixed colours: Copilot Chat indigo, In-app Copilot sky blue, Cowork magenta, Agents teal, Other grey.
- Activity status and habit cohorts use an indigo ramp from dark (most active) to pale (least active). Grey means no signal.

## Typography

Segoe UI Variable throughout. KPI values use tabular numerals so columns of figures align.

## Layout

- The header band holds the title, the Ask button, the data-mode badge (Live or Sample), the as-of time and the data-source button.
- A white side navigation sits left of the content, with sections grouped by job: Overview; Agents; Copilot; Spend & platforms; Security; Setup & coverage. Group labels are plain sentence case, not eyebrows. The current section has the soft-indigo fill. A small amber dot marks a section whose data lane failed or isn't in the sample.
- Below 1000px (the player's canvas width) the side navigation becomes a drawer opened from a Menu button in the band, which names the current section. It closes on navigation, Escape or a click on the scrim.
- Tabs with several report pages show sub-view pills in the toolbar.
- Slicers sit in one row above the content and apply to every view on the tab. Under them, one line says "Showing N of M agents · Audit data through <date>", and each slicer that's set shows as a removable pill, with "Clear all" when two or more are set. Below 1000px the slicers fold behind a Filters button, with a count of those set, so the figures start higher; the pills still show what's applied.- Content flows as KPI cards, then charts, then tables, matching the order of the report page.
- Keep scrolling short: two views of the same series share one panel with a segmented toggle (Overview's growth chart switches between Running total and Per month), and a panel that repeats a KPI card is dropped.
- Filters that a number links to live in the URL query (`#/usage/lifecycle?verdict=Retire`, `#/governance?band=High`), so a filtered list can be bookmarked or shared.

## Elevation & Depth

Flat panels with a 1px line border. Only the agent drawer and dialogs cast a shadow.

## Shapes

10px panel corners, 8px controls, pill badges.

## Components

- **KPI card:** label, then the figure (value plus an optional change pill), an optional 4px meter for a part of a whole, and one line of context. The change pill compares the last 7 days with the 7 before: green for a good change, red for a bad one, grey for flat, with an arrow so colour isn't the only cue. A value that opens its list is a link: the whole card is the hit area, and hover underlines the value. A value whose lane didn't arrive shows a dash and the reason instead of a zero. A card may end with a sparkline of real data (the last 12 weeks, or 12 months for a running total), bottom-aligned across the row and labelled for screen readers with its first and last values.
- **Agent estate card:** the first card on Overview, twice the width of the others. It shows every agent with the new-in-7-days count, then a bar, name, count and share for each platform in the platform colours. On narrow screens it takes the full row.
- **Greeting:** a time-of-day greeting and the as-of date above Overview. It never uses a name.
- **Stat list:** a label on the left and a right-aligned tabular figure on the right, one row per line. When the rows are parts of one total, a thin accent bar under each row shows the share.
- **Lane notice:** above a page's figures when a lane it depends on failed, isn't in the sample or returned no rows. It names the lane, says why and links to Live lane status. Failed is a soft red tint; the others are neutral. Overview shows the same as one coverage line for the whole app.
- **Charts:** hand-written SVG with no chart library. Hover shows the exact value. Single-series columns have rounded tops; month axes label every second or third month ("Jan 26") so the labels never overlap. Pick the type by the question, and draw only from data already loaded:
  - BarList for ranked lists; a stacked Distribution bar for status mixes read left to right.
  - Donut for parts of one whole with six or fewer parts (the rest fold into "Other"); shares under 1% read "<1%".
  - Heatmap for weekday-by-hour patterns, on a square-root scale so quiet hours still show.
  - Funnel only when each step is a subset of the one before (habit stages qualify; agent lifecycle stages don't, as they're exclusive).
  - Treemap for breakdowns with many parts; slivers under 1.5% join the "n more" tile.
  - Gauge for one share of a fixed capacity, turning warm at 80%.
- **DataTable:** sortable and searchable, with a "Show more" button for long tables. Agent rows open the drawer. Numbers, dates and verdicts never truncate; below its minimum width the table scrolls sideways. Its empty state says whether the search or the filters emptied it.
- **Agent drawer:** identity, risk breakdown by factor, sharing, tools, knowledge and usage for one agent.
- **Lane status:** one row per lane with its state, row count, time and last run.
- **Ask panel:** a side sheet opened from the indigo Ask pill in the header. It opens with three starter questions for the current section. Questions sit right-aligned in indigo bubbles; answers are plain text in the panel, never in a card. The handoff block (copy, open Copilot Chat, "What gets sent") is the only boxed element. The panel always states what it will send and where.

## Do's and Don'ts

- Do say why a panel is empty: lane not set up, access denied or no matching rows.
- Don't show 0 for a figure whose lane didn't load; show a dash and the reason.
- Do link a count to the list it counts.
- Do keep the data-mode badge visible at all times.
- Don't invent colours for risk or surface groups; use the fixed ones.
- Don't show names that weren't resolved; show the id or "Unresolved".

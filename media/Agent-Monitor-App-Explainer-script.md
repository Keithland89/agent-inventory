# Agent-Monitor: a simple guide to every page

Current app screens with wholly synthetic fictional data. AI-generated narration. No live telemetry, live AI answers or agent changes. Risk scores, lifecycle verdicts and policy labels are review aids, not verified security outcomes.

Current app source e4eef015c7ef1852253d7a18f6e6ad2e0aa6ce18, with the Explainer footer link added. Synthetic fixtures adapted from the older public demo source a3ef3f07a851cfc21f46b4440356d2cfa78b6e91; retired usage and cost views are excluded. Inventory counts, snapshot dates, identities, sites and observations are fictional. Capability reference tables document source limitations; they are not live probes. Missing source coverage is unknown, not zero. Captions are sentence-timed approximations, not word-aligned transcription.

## A simple guide to Agent-Monitor (00:00:00)

**On screen:** What exists. Who owns it. What to review.

Agent-Monitor helps you find the agents in an estate, understand who owns them, see their tools and knowledge, and decide what needs a closer look. This is a page-by-page guide to the current app. It is not an installation walkthrough, a security assessment, or a demonstration of live telemetry.

**On screen:** Real app screens. Entirely fictional data.

The screens come from the current app running locally with wholly synthetic fixtures adapted from its public demo. Every agent, person, site and detection shown is fictional. The voice is AI generated. The public demo is an older version with extra pages. Here we cover the current inventory and governance app, not those retired usage and cost views.

## Read the scope before the number (00:00:42)

**On screen:** Start with the mode and the date.

Look at the data chip in the top right. It says Sample data and gives the snapshot date. These examples use a fixed third of November snapshot, not today's activity. In a connected installation the same area identifies live mode. A recent-looking number is not enough: check its source and date before you use it.

**On screen:** Filters change the question you are answering.

Environment, platform, risk band and agent origin narrow the agent views. Here the environment filter reduces the list from twenty-four agents to six. That is a smaller scope, not an improvement. Filters carry between agent pages. Clear them before comparing totals. SharePoint, Foundry, Shadow AI and coverage have their own scope rather than inheriting these agent filters.

## Start with the estate and attention list (00:01:29)

**On screen:** Separate inventory size from actual use.

Overview is the starting brief. The estate card splits agents into human-built, platform-provisioned and creator unknown. In this fictional fixture all twenty-four are human-built; that is not a typical tenant benchmark. The neighbouring cards highlight sharing, owner gaps, knowledge reach, inactivity and high heuristic risk. They describe the loaded inventory, not business value or successful conversations.

**On screen:** Follow a concern to the list behind it.

What needs attention separates exposure checks from housekeeping. Select a line to see the agents behind it, rather than acting on the headline alone. The growth chart can show a running total or new agents per month. A rising line means more inventoried agents by creation month; it does not prove adoption or an increase in historical risk.

## All agents (00:02:18)

**On screen:** Use the registry to find the agent.

All agents is the searchable registry. Activity and needs-attention controls narrow the list further. The first table puts activity, platform, risk, sharing and last-use dates beside each agent. Select an agent row to open its details. A blank date on a platform without a usage signal must not be interpreted as proof that nobody used it.

**On screen:** Read the supporting tables before assigning work.

Further down, Data and tools compares each agent's knowledge types, connectors and component counts. Environment, ownership and sharing brings together its location, owner, creator and reach. Use these tables to find the right reviewer and understand the configuration. An owner name that did not resolve is different from an agent with no owner recorded.

## One agent, with its reasons (00:03:06)

**On screen:** Open the detail, not just the risk label.

The agent drawer joins the facts for one selected row. At the top are risk, activity, lifecycle and the suggested verdict. Under Details are the environment, dates, owner, authentication, model and sharing. This is where you check whether the selected agent is actually the one you meant to review, especially when names are similar.

**On screen:** A review prompt is not a remedial action.

Why it is risky lists the individual factors and their points. Knowledge and Connectors show the related sources and bindings that were loaded. Use that detail to prepare a question for the owner. This drawer does not disable an agent, change its sharing, or reassign ownership. Any approved change happens in the appropriate administration tool, outside this app.

## Agent inventory (00:03:49)

**On screen:** Compare the shape of the inventory.

Agent inventory emphasises creators, models and regions, followed by a detailed register. Use it when the question is what was built, where it lives and how it is configured. The human-built total is distinct from the total estate. Platform-created scaffolding can otherwise overwhelm a ranking that you intended to use to understand people's work.

**On screen:** Sort the register to choose a review sample.

The register adds orchestration, authentication, risk score, component counts and dates to each row. Sort or search it to find a manageable review sample, then open a row for its reasons. A large tool count is a configuration footprint, not proof of frequent execution. A named model does not tell you how good the answers are.

## Creators and ownership (00:04:34)

**On screen:** Creator and owner are different jobs.

Creators and ownership shows who builds agents and who is responsible for them. Creator rankings help locate experience and support needs. Owner rankings help route follow-up. Those are different questions: the person who first created an agent may not be its current owner. Check the origin filter before treating platform-generated inventory as someone's personal portfolio.

**On screen:** Resolve an identity gap before calling it abandonment.

Owner-resolution information and the ownership tables help distinguish missing ownership from a name that could not be resolved. In a live app, names come from users known to the landing environment. That directory can be incomplete. Confirm responsibility with the relevant team before describing an agent as abandoned or deciding to remove it.

## SharePoint agents (00:05:20)

**On screen:** An observed file is not a complete site census.

SharePoint agents is a separate inventory of observed dot-agent files. It distinguishes current files from files observed as deleted. Site, deletion state, source application and last operation are this page's controls. The view is reconstructed from audit file operations within the available lookback. An agent with no operation in that window may be invisible.

**On screen:** Use provenance to check what was observed.

Current agents by site helps choose where to look. The lower tables show each observed file and its latest audit provenance, including the last operation and actor. These are file observations, not conversation counts. Check the collection freshness and available audit history before asking a site owner to reconcile a missing or deleted entry.

## Risk and review (00:06:07)

**On screen:** The score is a visible heuristic, not a verdict.

Risk and review groups agents by a simple point model. No authentication and quarantine each add three points. Tenant-wide sharing adds two. Other configuration factors add smaller amounts. High means five or more points, medium means three or four. These are review priorities defined by this project, not Microsoft's risk rating and not a prediction of a breach.

**On screen:** Fictional example: three plus two reaches High.

Here is an illustrative calculation, not a result read from this dashboard. An agent with no authentication adds three points; tenant-wide sharing adds two. That makes five before any other factors, so the band is High. A connector or web-search flag is a reason to investigate context, not evidence that data escaped.

**On screen:** Review the factors and the individual agents together.

The factor breakdown shows how many agents each factor affects and how many points it contributes. One agent can appear under several factors, so do not add those rows as if they were distinct agents. The review table starts with High and Medium. Open a row, check its reasons and agree a proportionate next step with its owner.

## Lifecycle review (00:07:14)

**On screen:** Stage describes the signal. Verdict suggests a review.

Lifecycle review separates a usage stage from a suggested decision. New agents are under thirty days old. Active means used within thirty days; idle is thirty-one to ninety days, and dormant is longer than ninety. Never used applies only where the platform supplies a usable last-use signal. These thresholds are project heuristics, not universal retention policy.

**On screen:** No usage signal is not the same as never used.

Agent Builder and Foundry have no supported last-use signal here. They are not marked idle, dormant or due to retire on that basis. A dormant agent, or an eligible never-used agent at least sixty days old, receives a Retire suggestion. High risk or no owner can instead trigger Review. These are prompts to confirm facts, never automatic deletion.

**On screen:** Confirm the reason, then agree the cadence.

The action table hides Keep by default and puts the more urgent verdicts first. Read Why and Stage alongside the owner and last-used date. The cadence panel suggests when to return to each verdict. Before retiring anything, ask about seasonal use, business dependency and data completeness. The app records no approval and performs no retirement itself.

## Tools (00:08:25)

**On screen:** Count bindings, not executions.

Tools brings together connector links, distinct connectors, Model Context Protocol servers, channels and component footprints. A connector link is a binding in the configuration, not an API call. One agent may have several links, and a connector may be used by several agents. The chart labelled Most used connectors ranks configured links, not observed runtime traffic.

**On screen:** Use the footprint to choose what to inspect.

The largest-tool-surface table compares tools, connectors, knowledge and connected agents. Start with a broad footprint when you want to understand reach, then inspect the selected agent and the actual connector permissions in its administration tools. Presence here does not establish effective access to every record, nor show what the agent has actually read or changed.

## Knowledge and grounding (00:09:13)

**On screen:** Source types show where agents can be grounded.

Knowledge and grounding groups bindings by source type, such as SharePoint sites or public websites. It contrasts grounded and ungrounded agents and separates tenant-data bindings from external types. Grounded means a source binding was returned. It does not certify the source's quality, the answer's accuracy, or whether the agent can access every item behind that source.

**On screen:** A source count is not a list of source names.

Use the platform matrix and heavily grounded agents to find where more investigation is worthwhile. The counts here can be richer than the list of named sources on the next page. In particular, Agent Builder exposes grounding types but not the named-source collection used here. Do not treat a gap between those two views as proof of a fault.

## Knowledge sources (00:10:00)

**On screen:** This page names the sites and references.

Knowledge sources adds actual source names and locators where the collection lane supports them. It shows named-source totals, hosts, external references, freshness and coverage against the inventory's counts. All locators in this film use the reserved example dot invalid domain. They are fictional references, not real sites and not links to private content.

**On screen:** Freshness and coverage matter as much as the total.

Our fictional example has twelve named rows against sixty counted sources, so coverage is twenty percent. That is illustrative collection coverage, not an accuracy score. Use widely shared sources to find references worth reviewing with their owners. If rows are absent or stale, check the knowledge collector and environment coverage before concluding that agents have no knowledge.

## Azure AI Foundry (00:10:48)

**On screen:** Foundry projects are not individual hosted agents.

Azure AI Foundry lists the returned Azure AI resources and projects, alongside Power Platform agent flows. Resource categories, regions and stock-keeping units describe the estate. A Foundry project can host multiple agents; the control-plane project count is not an individual-agent count. The agent filters from earlier pages do not apply to these resource and flow totals.

**On screen:** An omitted property is unknown, not secure.

The estate table helps locate the resource and region to review. Public network open counts only resources whose returned property explicitly says Enabled. A live listing may omit that property, so a blank is not confirmation of private access. Use the source administration tools to check the actual network and authentication configuration before making a security decision.

## Shadow AI (00:11:38)

**On screen:** A detection is a lead to investigate.

Shadow AI presents watched-tool observations associated with devices and users. Layer and posture filters narrow the results. The tools and observations shown here are fictional fixtures, not findings about any vendor or organisation. In a connected installation the signal depends on Defender coverage and the project's matching rules. It is not a complete record of AI use.

**On screen:** Policy labels are not automatic threat judgements.

The device table lets a reviewer inspect the reported tool, layer, user and last-seen date. The watchlist shows what the app looks for, with sanctioning defined by local policy. Installed, executed and network observations mean different things. Do not add them as unique devices or infer a data leak. Unmanaged devices and uncollected activity remain outside the evidence.

## Data sources and gaps (00:12:29)

**On screen:** Check what a source can and cannot tell you.

Data sources and gaps explains the boundaries of the product. Telemetry per platform tells you where inventory and last-use signals exist. The API investigation table and optional Agent Three Sixty-Five comparison document known capability gaps. These are reference information, not a fresh permissions test performed each time you open this page.

**On screen:** Missing evidence is not a healthy zero.

Use this page when a stakeholder asks for a metric the app cannot support. Conversation-level usage, people, value and cost are outside the current app's remit; use the appropriate analytics product rather than guessing from inventory. Before presenting any total, be clear about which platforms and sources it covers and which questions remain unanswered.

## Live lane status (00:13:14)

**On screen:** Read the lane state before the row count.

Live lane status shows each independent data lane, its connector, state and row count, plus collector run information. In this film every lane is marked Sample because the data is synthetic. We have not connected live services or run collectors. This page's title describes its role in the product, not a claim that the recording is live.

**On screen:** A successful lane does not prove complete coverage.

In a connected app, distinguish returned data, no rows, not set up, access denied and an error. Read the detail and collector timestamps as well. A missing lane should remain an explicit gap, not become a comforting zero. Reload after resolving the underlying issue, then check whether the expected environments and sources are represented.

## Ask about the loaded inventory (00:13:59)

**On screen:** The question is grounded in the data already loaded.

Ask opens a side panel for questions about the current inventory. It builds a summary of counts, ownership gaps, risk, lifecycle, integrations and source coverage, including the page and filters. It adds no new inventory query. In a supported player with Cowork enabled, that question and summary can be sent to Copilot under the user's account.

**On screen:** In this recording, no AI answer is fabricated.

Outside that player, the panel offers a question-and-summary handoff to copy into Copilot Chat. That is the actual state shown here. What gets sent lets you inspect the text first. We do not submit it to a live AI service in this film, and we show no invented answer. Review the content and your organisation's policies before sharing it.

## From a signal to a considered review (00:14:43)

**On screen:** Scope, evidence, owner, decision.

Start with the date, mode and coverage. Use Overview to choose a concern, the registry to find the agent, and its drawer to read the reasons. Governance helps prioritise a human review; integrations and resource pages explain the surrounding footprint. Confirm missing information with the owner and source administrator. A colour or score never replaces that conversation.

**On screen:** A guide to the app, not a claim about your estate.

All inventory examples in this film use fictional synthetic data, with AI-generated narration. The screens show the current app; this is not live monitoring and no agent was changed. Risk, lifecycle and posture labels are review aids rather than verified outcomes. Use the chapters to return to a page, then apply the same careful reading to your own authorised data.

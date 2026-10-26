# Copilot Inventory: the app

A Copilot Managed App version of the Copilot Inventory Power BI report. It runs entirely in the browser inside the Managed Apps player, reads the same sources as the report through four connectors, and computes every column and measure in TypeScript. Nothing is sent anywhere else.

It covers all 16 report pages in ten tabs with sub-views. It adds a **Chat & Cowork** view built from the same audit-log lane, and a **Cost & consumption** tab that the report doesn't have.

| Tab | Sub-views | Report pages |
|---|---|---|
| Overview | | Overview |
| Inventory | All agents · Agent inventory · Creators & ownership | All Agents, Agent Inventory, Creators |
| Usage | Agent analytics · Usage & popularity · Adoption & activity | Agent Analytics, Usage & Popularity, Adoption |
| Copilot activity | Interactions · **Chat & Cowork** (new) | Copilot Interactions |
| SharePoint agents | | SharePoint Agents |
| Governance & risk | | Governance & Risk |
| Integrations | Tools · Knowledge & grounding · Knowledge sources | Tools, Knowledge & Grounding, Knowledge Sources |
| Azure AI Foundry | | Azure AI Foundry |
| **Cost & consumption** (new) | Copilot Credits · Azure AI spend | none |
| Shadow AI | | Shadow AI |
| Setup & coverage | Data sources & gaps · Live lane status | Data Sources & Gaps |

Slicers (Environment, Platform, Risk band, Agent origin) appear on the tabs whose report pages have them. Selecting an agent anywhere opens the agent drawer from the All agents page.

## Data modes

- **Live** is the default inside the player. Each lane loads independently and fails soft: a lane that is denied, not set up or broken shows its state and leaves the rest of the app working.
- **Sample** is the anonymised sample in `public/sample` (about 4.5 MB: 1,488 agents, 48,474 interactions and their related rows, plus 30 days of synthetic cost data, because the source has none). It loads automatically when the app runs outside the player (for example under `npm run dev`). In the player you can switch to it from the data-source dialog at any time.
- The header always shows which mode is active. The **Setup & coverage → Live lane status** view lists every lane with its state, row count, load time and the last run recorded in each landing table's run log.
- `?mode=sample` or `?mode=live` forces a mode. The choice is remembered for the browser session.

## Data sources and permissions

The app registers four connector data sources by name. Every user signs in to them (SSO) the first time they open the app, and sees only what their own permissions allow.

| Data source | Connector | Lanes | What the signed-in user needs |
|---|---|---|---|
| `powerplatformadminv2` | Power Platform for Admins V2 | A: agents, environments, usage records, agent flows · Copilot Credits per agent and the tenant credit pool | Power Platform Administrator (or another role that can query Power Platform inventory and licensing) |
| `arm` | Azure Resource Manager | Azure AI Foundry accounts, projects and hubs · Azure AI spend from Cost Management | Reader on the subscriptions to include, and Cost Management Reader (or Reader) for spend. Subscriptions that return 403 are skipped. |
| `wdatp` | Microsoft Defender ATP | F: Shadow AI (advanced hunting) | Security Reader with the `AdvancedQuery.Read` permission |
| `commondataserviceforapps` | Microsoft Dataverse (current environment) | C: Copilot interactions · D: named knowledge sources · E: SharePoint agents · run logs · user names | Read on the landing tables and on `systemusers` in the landing environment |

Lane A uses `QueryResources` against `PowerPlatformResources` with skip-token paging, ordered by id, and projects the full property bag in TypeScript (`src/data/transforms.ts` ports the report's KQL projections). Foundry lists subscriptions and then `Resources_List` per subscription. Lane F runs the report's advanced hunting queries (`src/data/shadow.ts`).

### Cost & consumption

Two views, each over the last 30 days. No connector, flow or table is added: both read through connectors the app already has, with each viewer's own sign-in.

- **Copilot Credits**: credits billed and not billed per agent, by feature and by environment, joined to the inventory by agent id (case-insensitive). Credits whose agent isn't in the inventory are counted as orphaned. Below them is the tenant capacity table from the credit pool: purchased, allocated and consumed per currency.
  - Per agent: `GetTenantResourcesAcrossEnvironments` with the `MCSMessages` entitlement, paged by continuation token.
  - Pool: `ListCurrencyReports`.
- **Azure AI spend**: daily spend, spend by resource type, top resources and top meters, for Azure OpenAI, AI Services and Foundry (`Microsoft.CognitiveServices/accounts`) and Azure Machine Learning workspaces (`Microsoft.MachineLearningServices/workspaces`).
  - Only subscriptions that hold an AI resource from the Foundry lane are queried, three at a time.
  - Each gets two Cost Management queries through `Provider_Resources_Invoke`: daily cost by resource, and the window total by resource and meter. Amounts are actual cost in the billing currency.

Caveats, not yet checked against a live tenant:

- `GetTenantResourcesAcrossEnvironments` is documented as deprecated. The `MCSMessages` entitlement id and the `nonBillableConsumed` metadata key are assumptions; if they're wrong, the lane loads but shows nothing or no non-billed credits.
- Cost Management data lags by about a day, and some offers (free trials, sponsorships) have none. A query that returns a `nextLink` is counted as truncated and the lane status says so.

The cost lanes are in **Setup & coverage → Live lane status** like every other lane: denied, not set up and empty each explain which role is missing.

### Landing tables

The Dataverse connector reads the environment the app is deployed to. **Deploy the app to the same environment that holds the landing tables.** The app reads these entity sets:

| Lane | Entity set | Run log |
|---|---|---|
| C: Copilot interactions | `poc_copilotinteractions` | `poc_copilotinteractionflowrunses` |
| D: Named knowledge sources | `poc_agentknowledgesources` | `poc_knowledgesweepruns` |
| E: SharePoint agents | `poc_sharepointagents` | `poc_sharepointagentloggingruns` |
| Names for owners and creators | `systemusers` | |

A table that does not exist shows as "not set up", never as an error. The tables can be created after the app is deployed; reload the app once they hold data.

## Deploy

Use the installer in [`../installer`](../installer). It builds or copies the app, deploys it to the landing environment and wires up the four data sources.

To deploy by hand with the `ms` CLI (`@microsoft/managed-apps-cli` 0.29.0, Node 24.11 or later):

```powershell
cd app
npm ci
npm run build
ms app init --repo none --display-name "Copilot Inventory" --build-type none --build-path ./dist --environment-id <landing environment id>
foreach ($c in 'powerplatformadminv2', 'arm', 'wdatp', 'commondataserviceforapps') {
  ms app add data-source --connector $c --as action --use-sso --skip-codegen --non-interactive --json
}
ms app deploy
ms app share <group ids> --access play   # optional
```

`ms app init` writes `ms.config.json`, which holds your environment and app ids. It is gitignored; never commit it.

## Develop

```powershell
cd app
npm install
npm run dev      # sample mode, no player needed
npm test         # vitest: transforms, risk scoring, measures, Chat & Cowork grouping, sample consistency
npm run lint
npm run build    # tsc -b, then vite build into dist/
```

To rebuild the sample from the repo's anonymised sample zip (or from a folder of `Dim*`/`Fact*` CSVs):

```powershell
npm run sample                      # defaults to ../sample-data/agent365-sample-data.zip
npm run sample -- <folder-or-zip>
```

The script keeps about 1,500 agents and every row related to them, keeps all Copilot Chat and Cowork interactions, and stays under 6 MB.

### Layout

| Path | What it holds |
|---|---|
| `src/generated/` | Connector clients and models generated by the `ms` CLI. Tenant-free; excluded from lint. |
| `src/data/transforms.ts` | Lane A projections, joins, risk scoring, activity status and the other Agent table columns. |
| `src/data/surface.ts` | Copilot surface classification and SharePoint agent identity decoding (FnSurface, FnSpo). |
| `src/data/live.ts` | Live loaders for every lane, paging and error classification. |
| `src/data/sample.ts` | Sample loader. |
| `src/data/build.ts` | Assembles the dataset both modes share. |
| `src/data/static.ts` | Static tables from the model: risk factors, agent gaps, API coverage, telemetry coverage, Shadow AI watchlist. |
| `src/metrics/` | Measures (`measures.ts`) and Chat & Cowork metrics (`chat.ts`). |
| `src/pages/` | One file per tab. |
| `src/ui/` | Shared components: tables, charts, drawer, dialogs. |
| `scripts/prepare-sample.mjs` | Builds `public/sample`. |
| `scripts/sample-cost.mjs` | Adds the synthetic cost CSVs to `public/sample`, seeded so they're the same every run. `npm run sample` runs both. |

## Faithfulness to the report

- **Risk score:** no authentication +3 (`None`, `No authentication` or an empty string; a missing value does not score), quarantined +3, shared with the entire tenant +2, shared tenant-wide and never used +1, web search on knowledge +1, uses connectors +1, connected to other agents +1. High is 5 or more, Medium 3 or more, otherwise Low. The tests recompute the score and band for every sample agent and compare them with the values the report shipped.
- **Active (30d)** counts agents whose activity status is Active (7d) or Active (30d).
- **Run time** sums, over each thread and day, the time between the first and last interaction.
- Environment ids are joined ignoring case, as the report's relationships do.
- Known differences: the report's "telemetry uplift" measure always returns 0 because of its filter context. The app computes what the tile describes (agents the audit log saw that usage records missed).

## Limitations

- **Names in live mode.** The report resolved owner and creator ids through Microsoft Graph. The app uses `systemusers` in the landing environment instead, which only knows users who exist in that environment. Where a name is not found, the id is shown. If `systemusers` cannot be read, every owner and creator shows as an id.
- Foundry `Resources_List` may omit `publicNetworkAccess` and `disableLocalAuth`, so those columns can be blank in live mode. ARM `nextLink` paging is not followed yet.
- Paging stops at 200 pages of Power Platform inventory and 250,000 interaction rows. The lane status says when a cap was reached.
- The Defender advanced hunting API is due to retire in February 2027. It is isolated behind one function in `src/data/live.ts`.

## Next

- **Admin actions** from the agent drawer: quarantine an agent (`Set Bot as Quarantined`) and reassign its owner (`Reassign the owner of the bot`), both in Power Platform for Admins V2.
- **Graph name resolution** for owners and creators through an Office 365 Users or Microsoft Graph connector, to match the report.

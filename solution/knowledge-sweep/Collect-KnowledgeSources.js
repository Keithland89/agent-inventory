// Tenant-wide sweep of real knowledge-source definitions.
//
// ARG carries knowledge COUNTS only - 67 distinct leaf paths under properties and not a
// single URL among them (work/probe-knowledge-detail.js). The actual site URLs, Dataverse
// table names and file names live in Dataverse `botcomponents` rows of componenttype 16
// ("Knowledge Source", confirmed against the option-set metadata), whose `data` column is
// a small YAML document:
//
//     kind: KnowledgeSourceConfiguration
//     source:
//       kind: SharePointSearchSource
//       site: https://contoso.sharepoint.com/sites/northwind-grid
//
// This is read-only. It writes a cache under data\ and nothing to the tenant.
//
//   node work\Collect-KnowledgeSources.js [--concurrency 8] [--limit N]
//
// Auth: uses the signed-in Azure CLI identity by default. For unattended/scheduled runs
// set KS_TENANT_ID / KS_CLIENT_ID / KS_CLIENT_SECRET and it switches to
// client credentials - which is also the only way to reach environments where the
// interactive admin holds no security role (92 of 525 here returned HTTP 403). Grant the
// app access first with work\Grant-SweepAccess.js.

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const args = process.argv.slice(2);
const argVal = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const CONCURRENCY = parseInt(argVal('--concurrency', '8'), 10);
const LIMIT = parseInt(argVal('--limit', '0'), 10);

const OUT_RAW = path.join('data', 'knowledge-sources-raw.json');
const OUT_CSV = path.join('data', 'FactAgentKnowledgeSource.csv');

// ---------------------------------------------------------------- auth
const APP = {
  tenant: process.env.KS_TENANT_ID,
  clientId: process.env.KS_CLIENT_ID,
  secret: process.env.KS_CLIENT_SECRET
};
const APP_ONLY = !!(APP.tenant && APP.clientId && APP.secret);

// Client-credential tokens are cached per resource: the sweep asks for one token per
// environment host and re-minting on every call would dominate the run.
const tokenCache = new Map();

async function appToken(resource, attempt = 0) {
  const key = resource.replace(/\/$/, '');
  const hit = tokenCache.get(key);
  if (hit && hit.expires > Date.now() + 60000) return hit.value;
  try {
    const res = await fetch('https://login.microsoftonline.com/' + APP.tenant + '/oauth2/v2.0/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: APP.clientId, client_secret: APP.secret,
        scope: key + '/.default', grant_type: 'client_credentials'
      })
    });
    const j = await res.json();
    if (!j.access_token) throw new Error(j.error_description || JSON.stringify(j).slice(0, 200));
    tokenCache.set(key, { value: j.access_token, expires: Date.now() + (j.expires_in || 3600) * 1000 });
    return j.access_token;
  } catch (e) {
    if (attempt >= 2) throw new Error('app token failed for ' + resource + ': ' + e.message);
    await sleep(1500 * (attempt + 1));
    return appToken(resource, attempt + 1);
  }
}

// execSync would serialise the whole pool on token acquisition, which is the single
// slowest step per environment, so tokens are fetched asynchronously.
function token(resource, attempt = 0) {
  if (APP_ONLY) return appToken(resource);
  return new Promise((resolve, reject) => {
    exec('az account get-access-token --resource ' + resource + ' --query accessToken -o tsv',
      { encoding: 'utf8', maxBuffer: 1 << 24 },
      async (err, stdout) => {
        if (!err && stdout.trim()) return resolve(stdout.trim());
        if (attempt >= 2) return reject(new Error('token failed for ' + resource));
        await sleep(1500 * (attempt + 1));
        token(resource, attempt + 1).then(resolve, reject);
      });
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function httpJson(url, tok, attempt = 0) {
  let res;
  try {
    res = await fetch(url, {
      headers: { Authorization: 'Bearer ' + tok, Accept: 'application/json', Prefer: 'odata.maxpagesize=5000' }
    });
  } catch (e) {
    if (attempt >= 4) throw e;
    await sleep(1000 * Math.pow(2, attempt));
    return httpJson(url, tok, attempt + 1);
  }
  if (res.status === 429 || res.status === 503) {
    const wait = (parseInt(res.headers.get('Retry-After') || '0', 10) || 15) * 1000;
    if (attempt >= 5) throw new Error('throttled out');
    await sleep(wait);
    return httpJson(url, tok, attempt + 1);
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    const err = new Error('HTTP ' + res.status + ' ' + body);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function odataAll(host, tok, pathAndQuery) {
  const out = [];
  let url = host + '/api/data/v9.2/' + pathAndQuery;
  for (;;) {
    const j = await httpJson(url, tok);
    out.push(...(j.value || []));
    if (!j['@odata.nextLink']) break;
    url = j['@odata.nextLink'];
  }
  return out;
}

// ---------------------------------------------------------------- ARG
// The inventory query pages through several thousand rows before the sweep even starts,
// and a single dropped TLS socket there used to abort the whole run with "TypeError:
// terminated". Every network call in this script now retries.
async function argFetch(mgmt, body, attempt = 0) {
  try {
    const r = await fetch('https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01',
      { method: 'POST', headers: { Authorization: 'Bearer ' + mgmt, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.status === 429 || r.status === 503) {
      const wait = (parseInt(r.headers.get('Retry-After') || '0', 10) || 15) * 1000;
      if (attempt >= 6) throw new Error('ARG throttled out');
      await sleep(wait);
      return argFetch(mgmt, body, attempt + 1);
    }
    if (!r.ok) throw new Error('ARG HTTP ' + r.status + ' ' + (await r.text()).slice(0, 300));
    return r.json();
  } catch (e) {
    if (attempt >= 6) throw e;
    await sleep(1000 * Math.pow(2, attempt));
    return argFetch(mgmt, body, attempt + 1);
  }
}

async function arg(mgmt, query) {
  const rows = [];
  let skip = null;
  for (;;) {
    const body = { query, options: { resultFormat: 'objectArray', $top: 1000 } };
    if (skip) body.options.$skipToken = skip;
    const j = await argFetch(mgmt, body);
    rows.push(...j.data);
    skip = j.$skipToken || null;
    if (!skip) break;
  }
  return rows;
}

// ---------------------------------------------------------------- YAML
// The payload is a tiny, strictly indented subset of YAML - scalars, nested maps and
// "- " sequences of scalars. A dependency-free indentation parser is enough, and it
// cannot be surprised by a knowledge kind nobody has seen yet.
function parseYaml(text) {
  const lines = String(text || '').split(/\r?\n/)
    .filter(l => l.trim() !== '' && !/^\s*#/.test(l));
  let i = 0;

  function parseBlock(indent) {
    const map = {};
    const list = [];
    while (i < lines.length) {
      const line = lines[i];
      const cur = line.match(/^(\s*)/)[1].length;
      if (cur < indent) break;
      const trimmed = line.trim();

      if (trimmed.startsWith('- ')) {
        if (cur < indent) break;
        list.push(unquote(trimmed.slice(2).trim()));
        i++;
        continue;
      }
      const m = trimmed.match(/^([^:]+):\s*(.*)$/);
      if (!m) { i++; continue; }
      const key = m[1].trim();
      const rest = m[2];
      i++;
      if (rest === '') {
        const nextIndent = i < lines.length ? lines[i].match(/^(\s*)/)[1].length : -1;
        map[key] = nextIndent > cur ? parseBlock(nextIndent) : null;
      } else {
        map[key] = unquote(rest.trim());
      }
    }
    return list.length ? list : map;
  }
  function unquote(s) {
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
    return s;
  }
  return parseBlock(0);
}

// Every source kind observed across the tenant, with the field that actually identifies
// what is being read and the friendly label. The labels deliberately reuse the vocabulary
// the ARG lane already emits, so the count-level and name-level tables slice together
// instead of presenting two names for the same thing.
//
// `locator` is only declared where the value is a real, human-meaningful locator. The
// structured kinds carry `skillConfiguration`, which is a machine-generated id such as
// "MarketProductEvaluation_dQaKwiXOLwI93Whiz_WNq", so they deliberately have none and
// fall back to the component name. Picking "first scalar wins" instead grabbed
// `triggerCondition: false` and reported it as the source of a Dataverse table.
//
// `external` marks sources that read content from outside the tenant boundary.
const KINDS = {
  SharePointSearchSource:          { label: 'SharePoint sites',            locator: 'site',                     external: false },
  SharePointKnowledgeSource:       { label: 'SharePoint sites',            locator: 'siteUrl',                  external: false },
  PublicSiteSearchSource:          { label: 'Public websites',             locator: 'site',                     external: true },
  WebsiteKnowledgeSource:          { label: 'Public websites',             locator: 'siteUrl',                  external: true },
  BingCustomSearchSource:          { label: 'Bing custom search',          locator: null,                       external: true },
  WebSearchSource:                 { label: 'Web search',                  locator: null,                       external: true },
  DataverseStructuredSearchSource: { label: 'Dataverse tables',            locator: null,                       external: false },
  DataverseSearchSource:           { label: 'Dataverse tables',            locator: null,                       external: false },
  DataverseKnowledgeSource:        { label: 'Dataverse tables',            locator: null,                       external: false },
  FederatedStructuredSearchSource: { label: 'Federated external systems',  locator: null,                       external: true },
  FileGroupKnowledgeSource:        { label: 'File groups',                 locator: null,                       external: false },
  FileSearchSource:                { label: 'Uploaded files',              locator: 'fileName',                 external: false },
  GraphConnectorSearchSource:      { label: 'Microsoft Graph connectors',  locator: 'contentSourceDisplayName', external: true },
  AzureAISearchSource:             { label: 'Azure AI Search indexes',     locator: 'indexName',                external: true },
  TeamsMessagesSearchSource:       { label: 'Teams messages',              locator: null,                       external: false },
  EnterpriseSearchSource:          { label: 'Enterprise search',           locator: null,                       external: false },
  // Seen once across the tenant: the document declares the wrapper kind and carries no
  // `source:` block at all, so there is nothing to classify. Labelled rather than left
  // unmapped so it cannot masquerade as a new source type nobody has noticed.
  KnowledgeSourceConfiguration:    { label: 'Unspecified',                 locator: null,                       external: false }
};

function describeSource(data) {
  const doc = parseYaml(data);
  const src = (doc && typeof doc === 'object' && doc.source && typeof doc.source === 'object') ? doc.source : doc;
  const kind = (src && src.kind) || (doc && doc.kind) || 'Unknown';
  const def = KINDS[kind];
  let locator = null, locatorKey = null;
  if (def && def.locator && src && typeof src[def.locator] === 'string' && src[def.locator].trim() !== '') {
    locator = src[def.locator].trim();
    locatorKey = def.locator;
  }
  return {
    kind,
    label: def ? def.label : kind,
    known: !!def,
    external: def ? def.external : null,
    locator,
    locatorKey
  };
}

// A site URL is far more useful bucketed by host than as 8,000 unique strings.
function hostOf(u) {
  if (!u) return null;
  try { return new URL(u).host; } catch { return null; }
}

// ---------------------------------------------------------------- pool
async function pool(items, size, worker) {
  const results = [];
  let idx = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    for (;;) {
      const n = idx++;
      if (n >= items.length) return;
      results[n] = await worker(items[n], n);
    }
  });
  await Promise.all(runners);
  return results;
}

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// ---------------------------------------------------------------- main
(async () => {
  const started = Date.now();
  console.log('resolving tokens and inventory...');
  console.log('  auth: ' + (APP_ONLY ? 'app-only (client credentials)' : 'Azure CLI signed-in user'));

  // Resource Graph is enrichment only. An app-only identity cannot read
  // PowerPlatformResources without the Power Platform Administrator directory role, and
  // granting a directory role needs a Global Administrator - so the unattended path does
  // without it. Everything structural is rebuilt from Dataverse below.
  let agents = [];
  let envNames = new Map();
  if (!APP_ONLY) {
    const mgmt = await token('https://management.azure.com');
    agents = await arg(mgmt,
      "PowerPlatformResources | where type =~ 'microsoft.copilotstudio/agents' " +
      "| extend p = properties " +
      "| where toint(p.componentsCounts.knowledge) > 0 " +
      "| project AgentKey = strcat(tostring(p.environmentId), '|', tostring(name)), " +
      "EnvId = tostring(p.environmentId), AgentName = tostring(p.displayName), " +
      "SchemaName = tostring(p.schemaName), " +
      "CreatedIn = iff(isempty(tostring(p.createdIn)), 'Copilot Studio', tostring(p.createdIn)), " +
      "Knowledge = toint(p.componentsCounts.knowledge) " +
      "| order by AgentKey asc");
    console.log('  knowledge-bearing agents: ' + agents.length);

    envNames = new Map((await arg(mgmt,
      "PowerPlatformResources | where type =~ 'microsoft.powerplatform/environments' " +
      "| project EnvId = tostring(name), EnvName = tostring(properties.displayName) | order by EnvId asc"))
      .map(e => [e.EnvId.toLowerCase(), e.EnvName]));
  } else {
    console.log('  skipping Resource Graph - the model supplies agent detail from its own ARG queries');
  }

  // Agents indexed per environment by lower-cased schemaName - the only join key shared
  // between Dataverse `bots` and the ARG inventory.
  const bySchema = new Map();
  for (const a of agents) {
    const k = a.EnvId.toLowerCase() + '|' + (a.SchemaName || '').toLowerCase();
    if (!bySchema.has(k)) bySchema.set(k, a);
  }

  const gd = await token('https://globaldisco.crm.dynamics.com');
  const disc = await httpJson('https://globaldisco.crm.dynamics.com/api/discovery/v2.0/Instances', gd);
  const byEnv = new Map((disc.value || []).map(i => [(i.EnvironmentId || '').toLowerCase(), i]));

  // Global discovery under-reports for an app-only identity: after granting application
  // users to 25 environments it still listed 1, while direct reads against all 25 hosts
  // succeeded (work\probe-grant-effect.js). So the grant manifest, not discovery, is the
  // authoritative environment list for unattended runs.
  const GRANTS = path.join('data', 'sweep-access-grants.json');
  if (APP_ONLY && fs.existsSync(GRANTS)) {
    let added = 0;
    for (const g of (JSON.parse(fs.readFileSync(GRANTS, 'utf8')).results || [])) {
      if (!g.ApiUrl || g.Status >= 400) continue;
      const k = (g.EnvironmentId || '').toLowerCase();
      if (!k || byEnv.has(k)) continue;
      byEnv.set(k, { EnvironmentId: g.EnvironmentId, ApiUrl: g.ApiUrl, FriendlyName: g.Name });
      added++;
    }
    console.log('  environments from grant manifest not seen by discovery: ' + added);
  }

  // With ARG the sweep visits only environments known to hold knowledge-bearing agents.
  // Without it, every environment the identity can reach is swept and empty ones cost one
  // cheap filtered call each.
  let envIds, unreachable = [];
  if (agents.length) {
    envIds = [...new Set(agents.map(a => a.EnvId))].filter(e => byEnv.has(e.toLowerCase())).sort();
    unreachable = [...new Set(agents.map(a => a.EnvId))].filter(e => !byEnv.has(e.toLowerCase()));
  } else {
    envIds = [...new Set((disc.value || []).map(i => (i.EnvironmentId || '').toLowerCase()))].filter(Boolean).sort();
  }
  if (LIMIT > 0) envIds = envIds.slice(0, LIMIT);
  console.log('  environments to sweep: ' + envIds.length + '   no Dataverse instance: ' + unreachable.length);
  console.log('  concurrency: ' + CONCURRENCY + '\n');

  const rows = [];
  const failures = [];
  let done = 0, orphanComponents = 0, unmatchedBots = 0;

  await pool(envIds, CONCURRENCY, async (envId) => {
    const inst = byEnv.get(envId.toLowerCase());
    const host = inst.ApiUrl.replace(/\/$/, '');
    const envName = envNames.get(envId.toLowerCase()) || inst.FriendlyName || envId;
    try {
      const tok = await token(host);
      const [bots, comps] = await Promise.all([
        odataAll(host, tok, 'bots?$select=botid,name,schemaname'),
        odataAll(host, tok, 'botcomponents?$select=botcomponentid,name,componenttype,data,_parentbotid_value&$filter=componenttype eq 16')
      ]);
      const botById = new Map(bots.map(b => [(b.botid || '').toLowerCase(), b]));

      for (const c of comps) {
        const bot = botById.get((c._parentbotid_value || '').toLowerCase());
        if (!bot) { orphanComponents++; continue; }
        const agent = bySchema.get(envId.toLowerCase() + '|' + (bot.schemaname || '').toLowerCase());
        if (!agent) { unmatchedBots++; }
        const d = describeSource(c.data);
        rows.push({
          // Resource Graph names a Copilot Studio agent resource by its Dataverse botid -
          // verified across 12 environments with 0 mismatches (work\probe-botid-agentkey.js) -
          // so the model's AgentKey is rebuilt here rather than looked up.
          AgentKey: envId.toLowerCase() + '|' + (bot.botid || '').toLowerCase(),
          EnvironmentId: envId,
          EnvironmentName: envName,
          AgentName: agent ? agent.AgentName : bot.name,
          SchemaName: bot.schemaname || null,
          Platform: agent ? (agent.CreatedIn === 'Copilot Studio Lite' ? 'M365 Copilot Agent Builder' : 'Copilot Studio') : 'Copilot Studio',
          SourceId: c.botcomponentid,
          SourceName: c.name || null,
          SourceKind: d.kind,
          KnowledgeType: d.label,
          IsExternal: d.external,
          KnownKind: d.known,
          Locator: d.locator,
          LocatorField: d.locatorKey,
          LocatorHost: hostOf(d.locator),
          MatchedAgent: !!agent,
          // Only kept when the kind is one this script has never seen, so a new Copilot Studio
          // source type can be classified from the cache instead of by re-running the sweep.
          RawSample: d.known ? undefined : String(c.data || '').slice(0, 600)
        });
      }
    } catch (e) {
      failures.push({ EnvironmentId: envId, EnvironmentName: envName, Error: e.message.slice(0, 160) });
    }
    done++;
    if (done % 25 === 0 || done === envIds.length) {
      const el = (Date.now() - started) / 1000;
      process.stdout.write('  ' + String(done).padStart(4) + '/' + envIds.length +
        '  rows=' + rows.length + '  failed=' + failures.length +
        '  ' + el.toFixed(0) + 's\n');
    }
  });

  rows.sort((a, b) => String(a.SourceId).localeCompare(String(b.SourceId)));

  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync(OUT_RAW, JSON.stringify({
    collectedAt: new Date().toISOString(),
    environmentsSwept: envIds.length,
    environmentsUnreachable: unreachable.length,
    failures,
    orphanComponents,
    unmatchedBots,
    rows
  }, null, 1));

  const cols = ['AgentKey', 'EnvironmentId', 'EnvironmentName', 'AgentName', 'SchemaName', 'Platform',
    'SourceId', 'SourceName', 'SourceKind', 'KnowledgeType', 'IsExternal', 'Locator', 'LocatorField', 'LocatorHost'];
  const csv = [cols.join(',')];
  // Every row now carries an AgentKey rebuilt from the Dataverse botid, so publication no
  // longer depends on Resource Graph having matched the agent.
  for (const r of rows.filter(r => r.AgentKey)) csv.push(cols.map(c => csvEscape(r[c])).join(','));
  fs.writeFileSync(OUT_CSV, csv.join('\r\n') + '\r\n');

  const el = (Date.now() - started) / 1000;
  console.log('\n' + '='.repeat(80));
  console.log('swept ' + envIds.length + ' environments in ' + (el / 60).toFixed(1) + ' min');
  console.log('knowledge-source rows      : ' + rows.length);
  console.log('  publishable (have a key) : ' + rows.filter(r => r.AgentKey).length);
  if (!APP_ONLY) {
    console.log('  enriched from ARG        : ' + rows.filter(r => r.MatchedAgent).length);
    console.log('  bot present, agent absent: ' + unmatchedBots);
  }
  console.log('orphan components (no bot) : ' + orphanComponents);
  console.log('environment failures       : ' + failures.length);
  const kinds = {};
  for (const r of rows) kinds[r.SourceKind] = (kinds[r.SourceKind] || 0) + 1;
  console.log('\nsource kinds:');
  console.table(Object.entries(kinds).map(([Kind, Rows]) => ({
    Kind, Rows, Label: KINDS[Kind] ? KINDS[Kind].label : '*** UNMAPPED ***'
  })).sort((a, b) => b.Rows - a.Rows));
  const unmapped = Object.keys(kinds).filter(k => !KINDS[k]);
  if (unmapped.length) console.log('UNMAPPED KINDS NEEDING A LABEL: ' + unmapped.join(', '));
  const plat = {};
  for (const r of rows.filter(r => r.MatchedAgent)) plat[r.Platform] = (plat[r.Platform] || 0) + 1;
  console.log('by platform: ' + JSON.stringify(plat));
  const withLoc = rows.filter(r => r.Locator).length;
  console.log('rows carrying a resolved locator: ' + withLoc + ' of ' + rows.length);
  const hosts = new Set(rows.map(r => r.LocatorHost).filter(Boolean));
  console.log('distinct external/site hosts grounded in: ' + hosts.size);
  if (failures.length) {
    const byErr = {};
    for (const f of failures) {
      const k = (f.Error.match(/HTTP \d+/) || ['other'])[0];
      byErr[k] = (byErr[k] || 0) + 1;
    }
    console.log('failure kinds: ' + JSON.stringify(byErr));
  }
  console.log('\nwrote ' + OUT_RAW + ' and ' + OUT_CSV);
})().catch(e => { console.error('FAILED:', e.stack || e.message); process.exit(1); });

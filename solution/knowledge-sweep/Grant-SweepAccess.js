// Grants the unattended sweep identity a Dataverse application user in every environment,
// so Collect-KnowledgeSources.js can run on a schedule with nobody signed in.
//
// Why this exists
// ---------------
// The sweep reads `botcomponents` in each environment's own Dataverse. Dataverse has no
// tenant-wide service principal: an application user must exist in each environment. The
// documented way to create one at scale is the BAP admin endpoint below, which a Power
// Platform Administrator may call.
//
// It also closes a real coverage gap. Sweeping as an interactive admin failed in 92 of 525
// environments with "the user has not been assigned any role" - the admin is present but
// unprivileged. The application user is created with a System Administrator role, so those
// environments become readable.
//
//   node solution\knowledge-sweep\Grant-SweepAccess.js --app <clientId> [--dry-run] [--concurrency 6]
//                                  [--limit N] [--only-agents] [--publish-manifest] [--skip-grant]
//
// --only-agents restricts the grant to environments that actually contain knowledge-bearing
// Copilot Studio agents, so no privilege is handed out where there is nothing to read.
//
// --publish-manifest copies the grant results into the poc_sweepenvironments table. The daily
// sweep flow iterates that table rather than global discovery, because global discovery
// under-reports badly for an app-only identity - after 25 application users were granted it
// still returned one environment. A cloud flow cannot read the local JSON manifest, so the
// manifest has to live in Dataverse for the flow to see it.
//
// --skip-grant publishes the existing data\sweep-access-grants.json without re-granting, which
// is the normal way to refresh the flow's manifest after the initial bootstrap.
//
// Requires: caller is a Power Platform Administrator; the service principal already exists.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const argVal = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const APP_ID = argVal('--app', process.env.KS_CLIENT_ID);
const DRY = args.includes('--dry-run');
const ONLY_AGENTS = args.includes('--only-agents');
const PUBLISH_MANIFEST = args.includes('--publish-manifest');
const SKIP_GRANT = args.includes('--skip-grant');
const CONCURRENCY = parseInt(argVal('--concurrency', '6'), 10);
const LIMIT = parseInt(argVal('--limit', '0'), 10);
const OUT = path.join('data', 'sweep-access-grants.json');
const ORG = (process.env.KS_DATAVERSE_URL || 'https://contoso.crm.dynamics.com').replace(/\/+$/, '');
const MANIFEST_SET = 'poc_sweepenvironments';

if (!APP_ID && !SKIP_GRANT) { console.error('need --app <clientId> (or KS_CLIENT_ID)'); process.exit(1); }
if (SKIP_GRANT && !PUBLISH_MANIFEST) { console.error('--skip-grant only makes sense with --publish-manifest'); process.exit(2); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const tokenFor = r => execSync('az account get-access-token --resource ' + r + ' --query accessToken -o tsv',
  { encoding: 'utf8', maxBuffer: 1 << 24 }).trim();

async function pool(items, size, worker) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  }));
}

async function grant() {
  const started = Date.now();
  console.log('granting Dataverse access to app ' + APP_ID + (DRY ? '   [DRY RUN]' : ''));
  // Environments are taken from global discovery, which is the same list the sweep will
  // later iterate - granting anywhere else would be pointless privilege.
  const disc = await fetch('https://globaldisco.crm.dynamics.com/api/discovery/v2.0/Instances',
    { headers: { Authorization: 'Bearer ' + tokenFor('https://globaldisco.crm.dynamics.com'), Accept: 'application/json' } });
  if (disc.status !== 200) throw new Error('global discovery HTTP ' + disc.status);
  let instances = ((await disc.json()).value || []).filter(i => i.EnvironmentId);
  console.log('environments visible to the admin: ' + instances.length);

  if (ONLY_AGENTS) {
    // The bootstrap runs interactively as a Power Platform Administrator, so Resource Graph
    // is available here even though the unattended sweep cannot use it.
    const mgmt = execSync('az account get-access-token --resource https://management.azure.com --query accessToken -o tsv',
      { encoding: 'utf8', maxBuffer: 1 << 24 }).trim();
    const res = await fetch('https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + mgmt, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: "PowerPlatformResources | where type =~ 'microsoft.copilotstudio/agents' " +
          "| extend p = properties | where toint(p.componentsCounts.knowledge) > 0 " +
          "| summarize agents = count() by EnvId = tostring(p.environmentId) | order by EnvId asc",
        options: { resultFormat: 'objectArray', top: 1000 }
      })
    });
    const j = await res.json();
    if (!j.data) throw new Error('Resource Graph HTTP ' + res.status + ': ' + JSON.stringify(j).slice(0, 200));
    const wanted = new Set(j.data.map(r => String(r.EnvId).toLowerCase()));
    const before = instances.length;
    instances = instances.filter(i => wanted.has(String(i.EnvironmentId).toLowerCase()));
    console.log('environments holding knowledge-bearing agents: ' + wanted.size);
    console.log('  of those, reachable via discovery: ' + instances.length + '   (skipped ' + (before - instances.length) + ')');
  }

  if (LIMIT > 0) instances = instances.slice(0, LIMIT);
  console.log('granting to: ' + instances.length + '\n');

  const bap = tokenFor('https://api.bap.microsoft.com/');
  const results = [];
  let done = 0, ok = 0, failed = 0;

  await pool(instances, CONCURRENCY, async (inst) => {
    const envId = inst.EnvironmentId;
    let status = 0, detail = '';
    if (DRY) {
      status = 0; detail = 'dry-run';
    } else {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch('https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments/'
            + envId + '/addAppUser?api-version=2020-10-01', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + bap, 'Content-Type': 'application/json' },
            body: JSON.stringify({ servicePrincipalAppId: APP_ID })
          });
          status = res.status;
          if (status < 400) break;
          detail = (await res.text()).slice(0, 200);
          // 429/5xx are transient; a 403 means this admin cannot manage the environment.
          if (status !== 429 && status < 500) break;
        } catch (e) {
          detail = e.message;
        }
        await sleep(2000 * (attempt + 1));
      }
    }
    if (DRY || status < 400) ok++; else failed++;
    results.push({ EnvironmentId: envId, Name: inst.FriendlyName, ApiUrl: inst.ApiUrl, Status: status, Detail: detail });
    done++;
    if (done % 25 === 0 || done === instances.length) {
      console.log('  ' + String(done).padStart(4) + '/' + instances.length +
        '  granted=' + ok + '  failed=' + failed + '  ' + ((Date.now() - started) / 1000).toFixed(0) + 's');
    }
  });

  fs.mkdirSync('data', { recursive: true });
  // Merge with any previous manifest: an environment granted in an earlier run still has
  // the application user, and the manifest is what a future revocation would work from.
  const merged = new Map();
  if (fs.existsSync(OUT)) {
    try {
      for (const r of (JSON.parse(fs.readFileSync(OUT, 'utf8')).results || [])) {
        if (r.EnvironmentId && r.Status < 400) merged.set(r.EnvironmentId.toLowerCase(), r);
      }
    } catch { /* a corrupt manifest must not block the grant run */ }
  }
  for (const r of results) merged.set(String(r.EnvironmentId).toLowerCase(), r);
  fs.writeFileSync(OUT, JSON.stringify({
    grantedAt: new Date().toISOString(), appId: APP_ID, dryRun: DRY,
    results: [...merged.values()]
  }, null, 1));

  console.log('\n' + '='.repeat(70));
  console.log('environments : ' + instances.length);
  console.log('granted      : ' + ok);
  console.log('failed       : ' + failed);
  if (failed) {
    const byStatus = {};
    for (const r of results.filter(r => r.Status >= 400)) byStatus[r.Status] = (byStatus[r.Status] || 0) + 1;
    console.log('failure statuses: ' + JSON.stringify(byStatus));
  }
  console.log('wrote ' + OUT);
}

// ---------------------------------------------------------------- manifest publishing
// The daily flow needs this list inside Dataverse; see the --publish-manifest note above.
async function publishManifest() {
  console.log('\npublishing the environment manifest to ' + ORG + '/' + MANIFEST_SET + (DRY ? '   [DRY RUN]' : ''));
  if (!fs.existsSync(OUT)) throw new Error('no manifest at ' + OUT + ' - run the grant first');
  const manifest = JSON.parse(fs.readFileSync(OUT, 'utf8'));

  // Only environments the grant actually succeeded in, and only ones discovery gave an API
  // URL for - the flow has nothing to call without one.
  const rows = (manifest.results || [])
    .filter(r => r.EnvironmentId && r.ApiUrl && Number(r.Status) < 400)
    .map(r => ({
      poc_environmentid: String(r.EnvironmentId).toLowerCase(),
      poc_name: (r.Name || r.EnvironmentId).slice(0, 300),
      poc_apiurl: String(r.ApiUrl).replace(/\/+$/, ''),
      poc_grantedat: manifest.grantedAt || new Date().toISOString()
    }));
  console.log('  publishable environments: ' + rows.length + ' of ' + (manifest.results || []).length);
  if (!rows.length) throw new Error('nothing to publish - every grant result is an error or lacks an ApiUrl');

  const tok = tokenFor(ORG);
  const req = (p, o = {}) => fetch(p.startsWith('http') ? p : ORG + '/api/data/v9.2/' + p, {
    ...o,
    headers: {
      Authorization: 'Bearer ' + tok, Accept: 'application/json',
      'OData-MaxVersion': '4.0', 'OData-Version': '4.0', ...(o.headers || {})
    }
  });

  const probe = await req(MANIFEST_SET + '?$top=1');
  if (!probe.ok) {
    throw new Error(MANIFEST_SET + ' is not readable (HTTP ' + probe.status + ') - run ' +
      'Publish-KnowledgeSources.js --provision first');
  }

  if (DRY) {
    console.log('  [dry-run] would upsert ' + rows.length + ' rows and tombstone anything else');
    return;
  }

  // PATCH against the alternate key is a genuine Dataverse upsert, so no read-then-decide.
  let created = 0, failed = 0;
  await pool(rows, CONCURRENCY, async (row) => {
    const r = await req(MANIFEST_SET + "(poc_environmentid='" + row.poc_environmentid + "')", {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row)
    });
    if (r.ok) created++;
    else { failed++; console.log('  ! ' + row.poc_environmentid + ' HTTP ' + r.status + ' ' + (await r.text()).slice(0, 160)); }
  });

  // Anything the manifest no longer vouches for must go, or the flow keeps calling an
  // environment whose application user was removed and logs an error every day forever.
  const keep = new Set(rows.map(r => r.poc_environmentid));
  const list = await req(MANIFEST_SET + '?$select=poc_environmentid,poc_sweepenvironmentid&$top=5000',
    { headers: { Prefer: 'odata.maxpagesize=5000' } });
  let removed = 0;
  if (list.ok) {
    const stale = ((await list.json()).value || [])
      .filter(v => !keep.has(String(v.poc_environmentid || '').toLowerCase()));
    await pool(stale, CONCURRENCY, async (v) => {
      const d = await req(MANIFEST_SET + '(' + v.poc_sweepenvironmentid + ')', { method: 'DELETE' });
      if (d.ok) removed++;
    });
  }

  console.log('  upserted : ' + created);
  console.log('  failed   : ' + failed);
  console.log('  removed  : ' + removed);
  if (failed) throw new Error(failed + ' environment rows failed to publish');
}

(async () => {
  if (!SKIP_GRANT) await grant();
  if (PUBLISH_MANIFEST) await publishManifest();
})().catch(e => { console.error('FAILED: ' + (e.stack || e.message)); process.exit(1); });

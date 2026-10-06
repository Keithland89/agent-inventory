// Publish the swept knowledge sources into the one Dataverse the cloud model already reads.
//
// Why this exists: the names live in 525 separate Dataverse endpoints, one per environment,
// discovered only at refresh time. Power Query treats that as a dynamic data source and the
// Power BI service refuses to refresh it without an on-premises gateway - the constraint this
// whole repo is built to avoid. So the sweep happens out of band and lands here, in the single
// environment the model is already credentialed against, exactly like the interaction lane.
//
//   node solution\knowledge-sweep\Publish-KnowledgeSources.js --provision      create the tables, no data
//   node solution\knowledge-sweep\Publish-KnowledgeSources.js --publish        replace all rows from the sweep cache
//   node solution\knowledge-sweep\Publish-KnowledgeSources.js --provision --publish
//   ... --dry-run                                          print what would happen, change nothing
//
// --provision creates the landing table plus the three tables the daily sweep flow needs:
// the environment manifest it iterates, its run log, and its error log. It is idempotent -
// anything already present is left alone.

const fs = require('fs');
const { execSync } = require('child_process');

const ORG = process.env.KS_DATAVERSE_URL || 'https://contoso.crm.dynamics.com';
const API = ORG + '/api/data/v9.2';
const CACHE = 'data/knowledge-sources-raw.json';
const ENTITY = 'poc_agentknowledgesource';
const SET = 'poc_agentknowledgesources';
const PREFIX = 'poc_';
const BATCH = 100;

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const PROVISION = args.includes('--provision');
const PUBLISH = args.includes('--publish');

if (!PROVISION && !PUBLISH) {
  console.error('nothing to do - pass --provision and/or --publish (add --dry-run to rehearse)');
  process.exit(2);
}

let tok = null, tokAt = 0;
function token() {
  if (tok && Date.now() - tokAt < 25 * 60 * 1000) return tok;
  tok = execSync('az account get-access-token --resource ' + ORG + ' --query accessToken -o tsv',
    { encoding: 'utf8', maxBuffer: 1 << 24 }).trim();
  tokAt = Date.now();
  return tok;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function req(path, opts = {}, attempt = 0) {
  const url = path.startsWith('http') ? path : API + '/' + path;
  let res;
  try {
    res = await fetch(url, {
      ...opts,
      headers: {
        Authorization: 'Bearer ' + token(),
        Accept: 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        ...(opts.headers || {})
      }
    });
  } catch (e) {
    if (attempt >= 4) throw e;
    await sleep(1000 * Math.pow(2, attempt));
    return req(path, opts, attempt + 1);
  }
  if (res.status === 429 || res.status === 503) {
    const wait = (parseInt(res.headers.get('Retry-After') || '0', 10) || 20) * 1000;
    if (attempt >= 6) throw new Error('throttled out');
    console.log('  throttled, waiting ' + wait / 1000 + 's');
    await sleep(wait);
    return req(path, opts, attempt + 1);
  }
  return res;
}

// ---------------------------------------------------------------- metadata
const S = (name, display, len, desc) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
  SchemaName: PREFIX + name,
  MaxLength: len,
  RequiredLevel: { Value: 'None' },
  DisplayName: label(display),
  Description: label(desc)
});
const label = (t) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.Label',
  LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: t, LanguageCode: 1033 }]
});

async function tableExists() {
  const r = await req("EntityDefinitions(LogicalName='" + ENTITY + "')?$select=LogicalName");
  return r.ok;
}

async function provision() {
  if (await tableExists()) { console.log('table ' + ENTITY + ' already exists - nothing to provision'); return; }
  const body = {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: PREFIX + 'AgentKnowledgeSource',
    DisplayName: label('Agent knowledge source'),
    DisplayCollectionName: label('Agent knowledge sources'),
    Description: label('One row per named knowledge source an agent reads, swept from every environment\'s Dataverse by Collect-KnowledgeSources.js.'),
    OwnershipType: 'UserOwned',
    IsActivity: false,
    HasNotes: false,
    HasActivities: false,
    // The primary name attribute is the source name, so the default lookup/view shows
    // something meaningful instead of a generated id.
    PrimaryNameAttribute: PREFIX + 'sourcename',
    Attributes: [
      {
        '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
        SchemaName: PREFIX + 'SourceName',
        MaxLength: 400,
        IsPrimaryName: true,
        RequiredLevel: { Value: 'None' },
        DisplayName: label('Source name')
      },
      S('SourceId', 'Source id', 100, 'botcomponentid of the knowledge-source component - the natural key of a row.'),
      S('AgentKey', 'Agent key', 300, 'environmentId|resourceName, matching Agent[AgentKey] in the model.'),
      S('KnowledgeType', 'Knowledge type', 100, 'Friendly source type, same vocabulary as the ARG knowledge lane.'),
      S('SourceKind', 'Source kind', 100, 'Underlying Copilot Studio source kind.'),
      S('Locator', 'Locator', 1000, 'Site URL, index or connector the agent reads.'),
      S('LocatorHost', 'Locator host', 300, 'Host portion of the locator.'),
      S('EnvironmentName', 'Environment name', 300, 'Environment the agent lives in, carried for standalone querying.'),
      {
        '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
        SchemaName: PREFIX + 'IsExternal',
        RequiredLevel: { Value: 'None' },
        DisplayName: label('Reads outside tenant'),
        OptionSet: {
          '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
          TrueOption: { Value: 1, Label: label('Yes') },
          FalseOption: { Value: 0, Label: label('No') }
        }
      },
      {
        '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
        SchemaName: PREFIX + 'CollectedAt',
        RequiredLevel: { Value: 'None' },
        Format: 'DateAndTime',
        DateTimeBehavior: { Value: 'UserLocal' },
        DisplayName: label('Collected at')
      }
    ]
  };
  if (DRY) { console.log('[dry-run] would create ' + ENTITY + ' with ' + body.Attributes.length + ' attributes'); return; }
  const r = await req('EntityDefinitions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('create table failed: HTTP ' + r.status + ' ' + (await r.text()).slice(0, 600));
  console.log('created ' + ENTITY);

  // A freshly created table is not queryable through OData until the metadata cache catches
  // up; without this wait the first publish intermittently 404s on its own table.
  for (let i = 0; i < 12; i++) {
    await sleep(5000);
    const c = await req(SET + '?$top=1');
    if (c.ok) { console.log('entity set ' + SET + ' is live'); return; }
  }
  console.log('WARNING: ' + SET + ' not queryable yet - wait a minute and re-run --publish');
}

// ---------------------------------------------------------------- lane D flow tables
// The daily flow needs three things this script's original table did not: somewhere to read
// the list of environments it is allowed to sweep, somewhere to log each run, and somewhere
// to record per-environment failures. They are created here rather than shipped inside the
// solution because a table created through this API is a proven path, whereas hand-authored
// entity XML in a solution zip cannot be verified until it either imports or does not.
const I = (name, display, desc) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
  SchemaName: PREFIX + name, RequiredLevel: { Value: 'None' },
  // Dataverse defaults an integer column to 1..1000, which both blocks a legitimate
  // zero count and truncates real sweep totals, so the full range is set explicitly.
  MinValue: 0, MaxValue: 2147483647,
  DisplayName: label(display), Description: label(desc)
});
const M = (name, display, len, desc) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
  SchemaName: PREFIX + name, MaxLength: len, RequiredLevel: { Value: 'None' },
  DisplayName: label(display), Description: label(desc)
});
const D = (name, display, desc) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
  SchemaName: PREFIX + name, RequiredLevel: { Value: 'None' },
  Format: 'DateAndTime', DateTimeBehavior: { Value: 'UserLocal' },
  DisplayName: label(display), Description: label(desc)
});
const primaryName = (name, display, len) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
  SchemaName: PREFIX + name, MaxLength: len, IsPrimaryName: true,
  RequiredLevel: { Value: 'None' }, DisplayName: label(display)
});

const FLOW_TABLES = [
  {
    schema: 'SweepEnvironment', set: 'poc_sweepenvironments',
    display: 'Sweep environment', plural: 'Sweep environments',
    description: 'One row per environment the sweep app registration holds an application user in. Global discovery under-reports for an app-only identity, so this manifest - not discovery - is what the daily flow iterates.',
    primary: primaryName('Name', 'Environment name', 300),
    attributes: [
      S('EnvironmentId', 'Environment id', 100, 'Power Platform environment id.'),
      S('ApiUrl', 'API URL', 400, 'Dataverse Web API root for the environment, e.g. https://org123.crm.dynamics.com.'),
      D('GrantedAt', 'Granted at', 'When Grant-SweepAccess.js last confirmed access.')
    ],
    key: { name: 'EnvironmentId', attributes: [PREFIX + 'environmentid'] }
  },
  {
    schema: 'KnowledgeSweepRun', set: 'poc_knowledgesweepruns',
    display: 'Knowledge sweep run', plural: 'Knowledge sweep runs',
    description: 'One row per run of the daily knowledge-source sweep flow.',
    primary: primaryName('Name', 'Run', 200),
    attributes: [
      D('StartedAt', 'Started at', 'When the run began. Every row written by the run carries this stamp.'),
      D('FinishedAt', 'Finished at', 'When the run finished.'),
      S('Status', 'Status', 100, 'Running, Completed, Completed with errors, or Failed.'),
      S('FlowRunId', 'Flow run id', 100, 'Power Automate run id, for correlating with the run history.'),
      I('EnvironmentsSwept', 'Environments swept', 'Environments read successfully.'),
      I('EnvironmentsFailed', 'Environments failed', 'Environments that could not be read.'),
      I('RowsFound', 'Rows found', 'Knowledge-source components returned across all environments.'),
      I('RowsCreated', 'Rows created', 'Landing rows created.'),
      I('RowsUpdated', 'Rows updated', 'Landing rows updated in place.'),
      I('RowErrors', 'Row errors', 'Rows that failed to land.'),
      I('RowsDeleted', 'Rows deleted', 'Stale rows tombstoned because this run did not restamp them.')
    ]
  },
  {
    schema: 'KnowledgeSweepError', set: 'poc_knowledgesweeperrors',
    display: 'Knowledge sweep error', plural: 'Knowledge sweep errors',
    description: 'One row per environment or record the daily sweep could not process.',
    primary: primaryName('Name', 'Error', 300),
    attributes: [
      S('SourceId', 'Source id', 100, 'botcomponentid, when the failure was for one record.'),
      S('EnvironmentId', 'Environment id', 100, 'Environment the failure occurred in.'),
      M('Error', 'Error', 2000, 'Truncated failure detail.'),
      S('RunId', 'Run id', 100, 'Power Automate run id, matching the sweep run row.')
    ]
  }
];

async function createTable(t) {
  const logical = (PREFIX + t.schema).toLowerCase();
  if ((await req("EntityDefinitions(LogicalName='" + logical + "')?$select=LogicalName")).ok) {
    console.log('  ' + logical + ' already exists');
    return;
  }
  if (DRY) { console.log('  [dry-run] would create ' + logical + ' with ' + (t.attributes.length + 1) + ' attributes'); return; }
  const r = await req('EntityDefinitions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
      SchemaName: PREFIX + t.schema,
      DisplayName: label(t.display),
      DisplayCollectionName: label(t.plural),
      Description: label(t.description),
      OwnershipType: 'UserOwned',
      IsActivity: false, HasNotes: false, HasActivities: false,
      PrimaryNameAttribute: (PREFIX + t.primary.SchemaName.slice(PREFIX.length)).toLowerCase(),
      Attributes: [t.primary, ...t.attributes]
    })
  });
  if (!r.ok) throw new Error('create ' + logical + ' failed: HTTP ' + r.status + ' ' + (await r.text()).slice(0, 600));
  console.log('  created ' + logical);
}

// The flow upserts by updating against an alternate key and creating only when that fails,
// so without this key every run would create duplicates instead of updating in place.
async function createAlternateKey(entityLogical, keyName, attributes) {
  const existing = await req("EntityDefinitions(LogicalName='" + entityLogical + "')/Keys?$select=SchemaName");
  if (existing.ok && ((await existing.json()).value || []).some(k => k.SchemaName === PREFIX + keyName)) {
    console.log('  alternate key ' + PREFIX + keyName + ' already exists');
    return;
  }
  if (DRY) { console.log('  [dry-run] would add alternate key ' + PREFIX + keyName + ' on ' + attributes.join(', ')); return; }
  const r = await req("EntityDefinitions(LogicalName='" + entityLogical + "')/Keys", {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      '@odata.type': 'Microsoft.Dynamics.CRM.EntityKeyMetadata',
      SchemaName: PREFIX + keyName,
      DisplayName: label(keyName),
      KeyAttributes: attributes
    })
  });
  if (!r.ok) throw new Error('alternate key ' + keyName + ' failed: HTTP ' + r.status + ' ' + (await r.text()).slice(0, 600));
  // Key creation runs as a system job; until it reports Active an upsert against it 404s.
  for (let i = 0; i < 24; i++) {
    await sleep(5000);
    const c = await req("EntityDefinitions(LogicalName='" + entityLogical + "')/Keys?$select=SchemaName,EntityKeyIndexStatus");
    if (c.ok) {
      const k = ((await c.json()).value || []).find(x => x.SchemaName === PREFIX + keyName);
      if (k && k.EntityKeyIndexStatus === 'Active') { console.log('  alternate key ' + PREFIX + keyName + ' is active'); return; }
    }
  }
  console.log('  WARNING: alternate key ' + PREFIX + keyName + ' is still building - the flow will create duplicates until it is Active');
}

async function provisionFlowTables() {
  console.log('provisioning the daily-flow tables');
  for (const t of FLOW_TABLES) await createTable(t);
  for (const t of FLOW_TABLES) {
    if (t.key) await createAlternateKey((PREFIX + t.schema).toLowerCase(), t.key.name, t.key.attributes);
  }
  await provisionUpsertKey();
}

// The flow upserts against an alternate key, so that key has to be genuinely unique.
// poc_sourceid is not: a solution imported into many environments keeps its component
// GUIDs, so the same botcomponentid appears in every environment that has the solution
// (measured: 197 repeated ids, one of them 13 times, across 4,251 rows). Keying on it
// would collapse those rows into one and rewrite it once per environment every night.
// Environment + component is unique, so that pair is materialised into poc_uniquekey.
async function provisionUpsertKey() {
  const attr = PREFIX + 'uniquekey';
  const has = await req("EntityDefinitions(LogicalName='" + ENTITY + "')/Attributes(LogicalName='" + attr + "')?$select=LogicalName");
  if (!has.ok) {
    if (DRY) { console.log('  [dry-run] would add ' + attr + ' to ' + ENTITY); }
    else {
      const r = await req("EntityDefinitions(LogicalName='" + ENTITY + "')/Attributes", {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(S('UniqueKey', 'Unique key', 200,
          'Environment id and component id joined with an underscore. The daily sweep flow upserts on this, because component ids alone repeat across environments.'))
      });
      if (!r.ok) throw new Error('add ' + attr + ' failed: HTTP ' + r.status + ' ' + (await r.text()).slice(0, 400));
      console.log('  added ' + attr + ' to ' + ENTITY);
      await sleep(10000);
    }
  } else console.log('  ' + attr + ' already exists');

  await backfillUniqueKey();

  // A key left in Failed state blocks a rebuild and is not what the flow uses any more.
  const keys = await req("EntityDefinitions(LogicalName='" + ENTITY + "')/Keys?$select=SchemaName,EntityKeyIndexStatus,MetadataId");
  if (keys.ok) {
    for (const k of ((await keys.json()).value || [])) {
      if (k.SchemaName === PREFIX + 'SourceId') {
        if (DRY) console.log('  [dry-run] would drop the obsolete ' + k.SchemaName + ' key (' + k.EntityKeyIndexStatus + ')');
        else {
          const d = await req("EntityDefinitions(LogicalName='" + ENTITY + "')/Keys(" + k.MetadataId + ')', { method: 'DELETE' });
          console.log('  dropped obsolete key ' + k.SchemaName + (d.ok ? '' : ' (HTTP ' + d.status + ')'));
        }
      }
    }
  }
  await createAlternateKey(ENTITY, 'UniqueKey', [attr]);
}

// An alternate key index will not build while any row has a null in the column, and the
// rows already in the table predate it.
async function backfillUniqueKey() {
  const rows = [];
  let url = SET + '?$select=' + ENTITY + 'id,poc_sourceid,poc_agentkey,poc_uniquekey&$top=5000';
  for (;;) {
    const r = await req(url, { headers: { Prefer: 'odata.maxpagesize=5000' } });
    if (!r.ok) { console.log('  cannot read rows to backfill (HTTP ' + r.status + ') - skipping'); return; }
    const j = await r.json();
    rows.push(...j.value);
    if (!j['@odata.nextLink']) break;
    url = j['@odata.nextLink'];
  }
  const todo = rows.filter(r => !r.poc_uniquekey && r.poc_sourceid);
  if (!todo.length) { console.log('  poc_uniquekey already populated on all ' + rows.length + ' rows'); return; }
  if (DRY) { console.log('  [dry-run] would backfill poc_uniquekey on ' + todo.length + ' of ' + rows.length + ' rows'); return; }
  console.log('  backfilling poc_uniquekey on ' + todo.length + ' of ' + rows.length + ' rows');
  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH);
    await runBatch(slice.map(r =>
      'PATCH ' + API + '/' + SET + '(' + r[ENTITY + 'id'] + ') HTTP/1.1\r\n' +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify({ poc_uniquekey: (String(r.poc_agentkey || '').split('|')[0] + '_' + r.poc_sourceid).slice(0, 200) })
    ), 'backfill');
    process.stdout.write('\r    ' + Math.min(i + BATCH, todo.length) + '/' + todo.length);
  }
  console.log('');
}

// ---------------------------------------------------------------- data
async function existingIds() {
  const ids = [];
  let url = SET + '?$select=' + ENTITY + 'id&$top=5000';
  for (;;) {
    const r = await req(url, { headers: { Prefer: 'odata.maxpagesize=5000' } });
    if (!r.ok) throw new Error('read failed: HTTP ' + r.status + ' ' + (await r.text()).slice(0, 300));
    const j = await r.json();
    ids.push(...j.value.map(v => v[ENTITY + 'id']));
    if (!j['@odata.nextLink']) break;
    url = j['@odata.nextLink'];
  }
  return ids;
}

// $batch keeps a full replace to ~40 round trips rather than ~7,000.
// Dataverse requires modifying operations to sit inside a changeset, and Content-ID must
// be a MIME part header - emitting it after the blank line makes Dataverse read it as the
// request line and reject the batch with 0x80060888.
async function runBatch(parts, label) {
  const id = 'batch_' + Math.random().toString(16).slice(2);
  const cs = 'changeset_' + Math.random().toString(16).slice(2);
  const inner = parts.map((p, i) => '--' + cs + '\r\n' +
    'Content-Type: application/http\r\n' +
    'Content-Transfer-Encoding: binary\r\n' +
    'Content-ID: ' + (i + 1) + '\r\n\r\n' + p + '\r\n').join('') + '--' + cs + '--\r\n';
  const body = '--' + id + '\r\n' +
    'Content-Type: multipart/mixed;boundary=' + cs + '\r\n\r\n' +
    inner + '\r\n--' + id + '--\r\n';
  const r = await req(ORG + '/api/data/v9.2/$batch', {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/mixed;boundary=' + id },
    body
  });
  const text = await r.text();
  if (!r.ok) throw new Error(label + ' batch HTTP ' + r.status + ' ' + text.slice(0, 400));
  const bad = text.match(/HTTP\/1\.1 (4\d\d|5\d\d)/g);
  if (bad) {
    const snippet = (text.match(/"message"\s*:\s*"([^"]{0,300})"/) || [])[1] || text.slice(0, 400);
    throw new Error(label + ' batch contained ' + bad.length + ' failures: ' + snippet);
  }
}

async function publish() {
  if (!fs.existsSync(CACHE)) throw new Error('no sweep cache at ' + CACHE + ' - run Collect-KnowledgeSources.js first');
  const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  const rows = cache.rows.filter(r => r.AgentKey);
  console.log('cache collected at ' + cache.collectedAt);
  console.log('rows to publish: ' + rows.length +
    '  (of ' + cache.rows.length + ' swept; ' + (cache.rows.length - rows.length) + ' had no resolvable agent key)');
  console.log('environments swept: ' + cache.environmentsSwept + '   denied: ' + cache.failures.length);

  if (!(await tableExists())) {
    // In a combined rehearsal the table was never actually created, so its absence is
    // expected rather than an error worth failing on.
    if (DRY && PROVISION) console.log('[dry-run] table does not exist yet; --provision above would create it');
    else throw new Error('table ' + ENTITY + ' does not exist - run with --provision first');
  }

  const old = (DRY && PROVISION) ? [] : await existingIds();
  console.log('existing rows in Dataverse: ' + old.length);

  if (DRY) {
    console.log('[dry-run] would delete ' + old.length + ' rows and create ' + rows.length);
    console.log('[dry-run] first row: ' + JSON.stringify(toRecord(rows[0], cache.collectedAt), null, 1));
    return;
  }

  for (let i = 0; i < old.length; i += BATCH) {
    const chunk = old.slice(i, i + BATCH);
    await runBatch(chunk.map(id =>
      'DELETE ' + API + '/' + SET + '(' + id + ') HTTP/1.1\r\n'), 'delete');
    process.stdout.write('  deleted ' + Math.min(i + BATCH, old.length) + '/' + old.length + '\r');
  }
  if (old.length) console.log('\n  deleted ' + old.length + ' stale rows');

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await runBatch(chunk.map(r =>
      'POST ' + API + '/' + SET + ' HTTP/1.1\r\n' +
      'Content-Type: application/json;type=entry\r\n\r\n' +
      JSON.stringify(toRecord(r, cache.collectedAt)) + '\r\n'), 'create');
    process.stdout.write('  created ' + Math.min(i + BATCH, rows.length) + '/' + rows.length + '\r');
  }
  console.log('\n  created ' + rows.length + ' rows');

  const after = await existingIds();
  console.log(after.length === rows.length
    ? 'VERIFIED: ' + after.length + ' rows in ' + SET
    : 'MISMATCH: expected ' + rows.length + ' rows, found ' + after.length);
}

function trunc(v, n) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v);
  return s.length > n ? s.slice(0, n) : s;
}

function toRecord(r, collectedAt) {
  return {
    poc_sourcename: trunc(r.SourceName || r.Locator || r.SourceKind, 400),
    poc_sourceid: trunc(r.SourceId, 100),
    // botcomponentid is NOT unique tenant-wide: importing the same solution into many
    // environments preserves component GUIDs, so 197 ids repeat here, one of them 13 times.
    // Environment plus component is unique, and is what the daily flow upserts against.
    poc_uniquekey: trunc(String(r.AgentKey || '').split('|')[0] + '_' + r.SourceId, 200),
    poc_agentkey: trunc(r.AgentKey, 300),
    poc_knowledgetype: trunc(r.KnowledgeType, 100),
    poc_sourcekind: trunc(r.SourceKind, 100),
    poc_locator: trunc(r.Locator, 1000),
    poc_locatorhost: trunc(r.LocatorHost, 300),
    poc_environmentname: trunc(r.EnvironmentName, 300),
    poc_isexternal: !!r.IsExternal,
    poc_collectedat: collectedAt
  };
}

(async () => {
  console.log('target: ' + ORG + (DRY ? '   [DRY RUN]' : ''));
  if (PROVISION) { await provision(); await provisionFlowTables(); }
  if (PUBLISH) await publish();
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });

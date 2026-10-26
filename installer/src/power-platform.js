// @ts-check
/**
 * The Power Platform pieces outside Dataverse: listing environments (admin API), the Dataverse
 * connection the flows' connection references are bound to (Power Apps API), and running a
 * scheduled flow once now (Power Automate API).
 */
import { randomUUID } from 'node:crypto';
import { HttpError } from './http.js';
import { DATAVERSE_CONNECTOR } from './solutions.js';

export const POWERAPPS_BASE = 'https://api.powerapps.com';
export const FLOW_BASE = 'https://api.flow.microsoft.com';

/** @typedef {import('./http.js').HttpClient} Client */
/** @typedef {{ id: string, name: string, url: string, type?: string, isDefault?: boolean }} Environment */

/**
 * The environments with Dataverse the user can see: every one for an admin, otherwise their own.
 * @param {Client} bap
 * @returns {Promise<Environment[]>}
 */
export async function listEnvironments(bap) {
  /** @type {any[]} */
  let list;
  try {
    list = await bap.list('/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments?api-version=2020-10-01');
  } catch (err) {
    if (!(err instanceof HttpError && (err.status === 401 || err.status === 403))) throw err;
    list = await bap.list('/providers/Microsoft.BusinessAppPlatform/environments?api-version=2020-10-01');
  }
  return list
    .map((e) => ({
      id: /** @type {string} */ (e.name),
      name: /** @type {string} */ (e.properties?.displayName ?? e.name),
      url: /** @type {string} */ (e.properties?.linkedEnvironmentMetadata?.instanceUrl ?? ''),
      type: e.properties?.environmentSku,
      isDefault: !!e.properties?.isDefault,
    }))
    .filter((e) => e.url)
    .map((e) => ({ ...e, url: e.url.replace(/\/$/, '') }));
}

/**
 * The signed-in user's Dataverse connections in the environment, working ones first.
 * @param {Client} powerapps
 * @param {{ environmentId: string, userOid?: string }} o
 */
export async function listDataverseConnections(powerapps, { environmentId, userOid }) {
  const all = await powerapps.list(`/providers/Microsoft.PowerApps/apis/${DATAVERSE_CONNECTOR}/connections?api-version=2016-11-01&$filter=environment eq '${environmentId}'`);
  return all
    .filter((c) => !userOid || String(c.properties?.createdBy?.id ?? '').toLowerCase() === userOid.toLowerCase())
    .map((c) => ({ id: /** @type {string} */ (c.name), status: connectionStatus(c), name: /** @type {string} */ (c.properties?.displayName ?? c.name) }))
    .sort((a, b) => Number(b.status === 'Connected') - Number(a.status === 'Connected'));
}

/** @param {any} c */
const connectionStatus = (c) => /** @type {string} */ (c?.properties?.statuses?.[0]?.status ?? 'Unknown');

/**
 * Reuses the user's working Dataverse connection in the environment, or makes one. A connection the
 * API can't finish (it still wants a sign-in) comes back with its status, and the caller hands over
 * to the user with instructions.
 * @param {Client} powerapps
 * @param {{ environmentId: string, userOid?: string, connectionId?: string }} o
 * @returns {Promise<{ id: string, status: string, created: boolean }>}
 */
export async function ensureDataverseConnection(powerapps, { environmentId, userOid, connectionId }) {
  const mine = await listDataverseConnections(powerapps, { environmentId, userOid });
  if (connectionId) {
    const named = mine.find((c) => c.id === connectionId);
    return { id: connectionId, status: named?.status ?? 'Unknown', created: false };
  }
  const working = mine.find((c) => c.status === 'Connected');
  if (working) return { id: working.id, status: working.status, created: false };
  const id = randomUUID().replace(/-/g, '');
  const res = await powerapps.put(`/providers/Microsoft.PowerApps/apis/${DATAVERSE_CONNECTOR}/connections/${id}?api-version=2016-11-01&$filter=environment eq '${environmentId}'`, {
    properties: {
      environment: { id: `/providers/Microsoft.PowerApps/environments/${environmentId}`, name: environmentId },
      connectionParameters: {},
    },
  }, { once: true });
  return { id: res?.name ?? id, status: connectionStatus(res), created: true };
}

/**
 * What to do when the connection couldn't be made or isn't signed in yet.
 * @param {string} environmentName
 * @param {string} again  The command that runs the installer again.
 */
export const connectionInstructions = (environmentName, again) => [
  `Open https://make.powerapps.com, pick the "${environmentName}" environment, and go to Connections.`,
  'Choose New connection > Microsoft Dataverse > Create, and sign in as yourself.',
  'Open the new connection: its ID is the last part of the page address.',
  `Run ${again} --connection-id <that ID>.`,
];

/**
 * Deletes a connection the installer made.
 * @param {Client} powerapps
 * @param {{ environmentId: string, connectionId: string }} o
 */
export async function deleteConnection(powerapps, { environmentId, connectionId }) {
  try {
    await powerapps.del(`/providers/Microsoft.PowerApps/apis/${DATAVERSE_CONNECTOR}/connections/${connectionId}?api-version=2016-11-01&$filter=environment eq '${environmentId}'`);
  } catch (err) {
    if (!(err instanceof HttpError && err.status === 404)) throw err;
  }
}

/**
 * Runs a scheduled flow once now, as its Run button does. Solution flows are named by their workflow ID.
 * @param {Client} flow
 * @param {{ environmentId: string, flowId: string }} o
 */
export async function runFlowNow(flow, { environmentId, flowId }) {
  await flow.post(`/providers/Microsoft.ProcessSimple/environments/${environmentId}/flows/${flowId}/triggers/Recurrence/run?api-version=2016-11-01`, {}, { once: true });
}

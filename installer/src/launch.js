// @ts-check
/**
 * How the installer was started, so every "run it again" hint can be pasted as is.
 * The PowerShell launcher sets AGENT_INVENTORY_LAUNCHER=pwsh and AGENT_INVENTORY_SHIM to the
 * command it wrote; run from a clone, it's node and the bin script.
 */

/**
 * The command that runs the installer again with these arguments.
 * @param {string} [args]  e.g. 'deploy-app'.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function commandLine(args = '', env = process.env) {
  const tail = args ? ` ${args}` : '';
  if (env.AGENT_INVENTORY_LAUNCHER === 'pwsh' && env.AGENT_INVENTORY_SHIM) return `& "${env.AGENT_INVENTORY_SHIM}"${tail}`;
  return `node bin/agent-inventory-install.js${tail}`;
}

/** Whether the PowerShell launcher started this run. @param {NodeJS.ProcessEnv} [env] */
export const fromLauncher = (env = process.env) => env.AGENT_INVENTORY_LAUNCHER === 'pwsh';

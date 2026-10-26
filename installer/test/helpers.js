// @ts-check
import { mkdirSync, rmdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUi } from '../src/ui.js';

export const TEST_DIR = dirname(fileURLToPath(import.meta.url));
export const SOLUTION_DIR = join(TEST_DIR, '..', '..', 'solution');

/**
 * A scratch folder inside the installer's test folder, removed by the returned cleanup.
 * @param {string} name
 */
export function workDir(name) {
  const root = join(TEST_DIR, '.work');
  const dir = join(root, `${name}-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return {
    dir,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
      try {
        rmdirSync(root);
      } catch {
        // Another test file still has a folder there.
      }
    },
  };
}

/** A terminal UI that writes into an array, answering every question with its default. */
export function quietUi() {
  /** @type {string[]} */
  const out = [];
  const ui = createUi({ yes: true, write: (s) => { out.push(s); } });
  return { ui, out, text: () => out.join('') };
}

/**
 * A fetch that answers from a list of routes, in order of match, and records every call.
 * @param {{ method?: string, match: RegExp, reply: (body: any, url: string) => { status?: number, body?: any } | any }[]} routes
 */
export function fakeFetch(routes) {
  /** @type {{ method: string, url: string, body: any }[]} */
  const calls = [];
  /** @type {typeof fetch} */
  const impl = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    calls.push({ method, url, body });
    const route = routes.find((r) => (!r.method || r.method === method) && r.match.test(url));
    if (!route) return new Response(JSON.stringify({ error: { message: `No route for ${method} ${url}` } }), { status: 404 });
    const r = route.reply(body, url);
    const reply = r && typeof r === 'object' && 'status' in r ? r : { status: 200, body: r };
    const text = reply.body === undefined || reply.body === null ? '' : JSON.stringify(reply.body);
    return new Response(text || null, { status: reply.status ?? 200 });
  };
  return { impl, calls };
}

export const noSleep = async () => {};

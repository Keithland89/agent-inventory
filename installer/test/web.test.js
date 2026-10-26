// @ts-check
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import { cookie, HEADERS, PAGE_COMMANDS, startServer } from '../src/server.js';
import { createWebUi, plainText, SECRET_MASK } from '../src/web-ui.js';

/**
 * @param {number} port
 * @param {{ method?: string, path?: string, headers?: Record<string, string>, body?: any }} o
 * @returns {Promise<{ status: number, headers: import('node:http').IncomingHttpHeaders, body: string }>}
 */
function call(port, { method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers: { Host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

test('questions take only answers their own rules allow', async () => {
  const ui = createWebUi({ now: () => 0 });
  const events = /** @type {any[]} */ ([]);
  ui.subscribe((e) => events.push(e));

  const yes = ui.confirm('Go ahead?', false);
  const id = events.at(-1).id;
  assert.equal(events.at(-1).kind, 'confirm');
  assert.deepEqual(ui.answer(id, 'yes'), { ok: false, error: 'Answer yes or no.' });
  assert.equal(ui.waiting, true);
  assert.deepEqual(ui.answer(id, true), { ok: true });
  assert.equal(await yes, true);
  assert.deepEqual(ui.answer(id, true), { ok: false, error: 'That question isn\'t open.' });

  const pick = ui.select('Which?', [{ name: 'A', value: 'a' }, { name: 'B', value: 'b', disabled: 'no' }, { name: 'C', value: 'c' }]);
  const sid = events.at(-1).id;
  assert.equal(ui.answer(sid, 1).ok, false);
  assert.equal(ui.answer(sid, 2).ok, true);
  assert.equal(await pick, 'c');

  const only = await ui.select('Only one', [{ name: 'A', value: 'a' }, { name: 'B', value: 'b', disabled: true }]);
  assert.equal(only, 'a');

  const typed = ui.input('Email?', { validate: (v) => (v.includes('@') ? true : 'An email, please.') });
  const iid = events.at(-1).id;
  assert.deepEqual(ui.answer(iid, 'nope'), { ok: false, error: 'An email, please.' });
  ui.answer(iid, ' a@example.test ');
  assert.equal(await typed, 'a@example.test');

  const secret = ui.secret('Secret?');
  ui.answer(events.at(-1).id, 'shh');
  assert.equal(await secret, 'shh');
  assert.equal(events.at(-1).display, SECRET_MASK);
  assert.ok(!JSON.stringify(ui.history()).includes('shh'), 'a secret answer is never in the history');

  const boxes = ui.checkbox('Which ones?', [{ name: 'A', value: 1 }, { name: 'B', value: 2 }]);
  ui.answer(events.at(-1).id, [1, 0, 1]);
  assert.deepEqual(await boxes, [2, 1]);
});

test('cancel stops the open question as a cancelled prompt', async () => {
  const ui = createWebUi();
  const q = ui.confirm('Go?', true);
  assert.equal(ui.cancel(), true);
  await assert.rejects(q, (/** @type {any} */ e) => e.name === 'ExitPromptError');
  assert.equal(ui.cancel(), false);
});

test('colours are stripped from what the page shows', () => {
  assert.equal(plainText('\u001b[32mok\u001b[39m'), 'ok');
  const ui = createWebUi();
  ui.ok('\u001b[1mDone\u001b[22m');
  assert.equal(ui.history().at(-1)?.text, 'Done');
});

test('the page is served only to the installer\'s own link, on 127.0.0.1', async (t) => {
  const ui = createWebUi();
  /** @type {string[]} */
  const started = [];
  let running = /** @type {string | undefined} */ (undefined);
  const server = await startServer({
    ui,
    token: 'test-token-test-token-test-token',
    start: (command) => {
      if (!PAGE_COMMANDS.includes(command)) return { ok: false, status: 400, error: 'No such command' };
      started.push(command);
      running = command;
      return { ok: true };
    },
    running: () => running,
  });
  t.after(() => server.close());
  const { port } = server;
  assert.match(server.launchUrl, new RegExp(`^http://127\\.0\\.0\\.1:${port}/\\?t=`));

  assert.equal((await call(port, { headers: { Host: `evil.example.test:${port}` } })).status, 421);
  assert.equal((await call(port)).status, 401);
  assert.equal((await call(port, { path: '/api/state' })).status, 401);
  assert.equal((await call(port, { path: '/?t=wrong' })).status, 403);

  const enter = await call(port, { path: '/?t=test-token-test-token-test-token' });
  assert.equal(enter.status, 303);
  assert.equal(enter.headers.location, '/');
  const setCookie = String(enter.headers['set-cookie']);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  const jar = setCookie.split(';')[0];
  assert.equal(cookie(jar, `ai_inv_${port}`), 'test-token-test-token-test-token');

  const home = await call(port, { headers: { Cookie: jar } });
  assert.equal(home.status, 200);
  assert.equal(home.headers['content-security-policy'], HEADERS['Content-Security-Policy']);
  assert.match(home.body, /<html/i);

  const state = await call(port, { path: '/api/state', headers: { Cookie: jar } });
  assert.deepEqual(JSON.parse(state.body), { running: null, commands: PAGE_COMMANDS });

  const post = (/** @type {string} */ path, /** @type {any} */ body, /** @type {Record<string, string>} */ headers = {}) => call(port, {
    method: 'POST', path, body, headers: { Cookie: jar, Origin: `http://127.0.0.1:${port}`, 'Content-Type': 'application/json', ...headers },
  });
  assert.equal((await post('/api/start', { command: 'preview' }, { Origin: 'http://evil.example.test' })).status, 403);
  assert.equal((await post('/api/start', 'command=preview', { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post('/api/start', { command: 'nope' })).status, 400);
  assert.equal((await post('/api/start', { command: 'preview' })).status, 202);
  assert.deepEqual(started, ['preview']);
  assert.equal((await post('/api/quit', {})).status, 409);

  const asked = ui.confirm('Go?', false);
  const id = /** @type {any} */ (ui.history().at(-1)).id;
  assert.equal((await post('/api/answer', { id, value: 'maybe' })).status, 422);
  assert.equal((await post('/api/answer', { id, value: true })).status, 200);
  assert.equal(await asked, true);
});

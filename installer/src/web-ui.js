// @ts-check
/**
 * The installer's output and questions as events, for the browser page. It has the same methods as
 * the terminal UI, so every command runs unchanged; each question waits until the page answers it.
 * Answers are checked here, not trusted from the page.
 */

/**
 * @typedef {{ type: string, seq: number, at: number, [key: string]: any }} UiEvent
 * @typedef {{ value?: any, display?: string, error?: string }} Parsed
 * @typedef {{ kind: string, message: string, parse: (raw: unknown) => Parsed, resolve: (v: any) => void, reject: (e: Error) => void }} Pending
 */

// eslint-disable-next-line no-control-regex
const ESCAPES = /\x1b\[[0-9;?]*[A-Za-z]|\r/g;
export const SECRET_MASK = '••••••••';

/** @param {string} s */
export const plainText = (s) => String(s).replace(ESCAPES, '');

/**
 * @param {{ now?: () => number }} [opts]
 */
export function createWebUi(opts = {}) {
  const now = opts.now ?? Date.now;
  /** @type {UiEvent[]} */
  const history = [];
  /** @type {Set<(e: UiEvent) => void>} */
  const listeners = new Set();
  /** @type {Map<number, Pending>} */
  const pending = new Map();
  let seq = 0;
  let ids = 0;

  /**
   * @param {{ type: string, [key: string]: any }} event
   * @returns {UiEvent}
   */
  function emit(event) {
    const e = { seq: ++seq, at: now(), ...event };
    history.push(e);
    for (const fn of listeners) fn(e);
    return e;
  }

  /** @param {string} kind @returns {(s?: string) => void} */
  const say = (kind) => (s = '') => {
    emit({ type: 'line', kind, text: plainText(s) });
  };

  /**
   * @param {string} kind
   * @param {string} message
   * @param {Record<string, any>} extra
   * @param {(raw: unknown) => Parsed} parse
   * @returns {Promise<any>}
   */
  function ask(kind, message, extra, parse) {
    const id = ++ids;
    const text = plainText(message);
    return new Promise((resolve, reject) => {
      pending.set(id, { kind, message: text, parse, resolve, reject });
      emit({ type: 'prompt', id, kind, message: text, ...extra });
    });
  }

  /** @param {{ name: string, description?: string, disabled?: boolean | string, checked?: boolean }} ch */
  const choiceView = (ch) => ({
    name: plainText(ch.name),
    ...(ch.description ? { description: plainText(ch.description) } : {}),
    ...(ch.disabled ? { disabled: typeof ch.disabled === 'string' ? ch.disabled : true } : {}),
    ...(ch.checked !== undefined ? { checked: !!ch.checked } : {}),
  });

  return {
    yes: false,
    web: true,
    emit,
    line: say('line'),
    /** @param {string} title */
    heading: (title) => {
      emit({ type: 'heading', title: plainText(title) });
    },
    /** @param {number} n @param {number} total @param {string} title */
    step: (n, total, title) => {
      emit({ type: 'step', n, total, title: plainText(title) });
    },
    ok: say('ok'),
    warn: say('warn'),
    fail: say('fail'),
    info: say('info'),
    note: say('note'),
    /** @param {import('./plan.js').Plan} plan */
    plan: (plan) => {
      emit({ type: 'plan', plan });
    },
    /** @param {string} title @param {import('./plan.js').NextStep[]} steps */
    nextSteps: (title, steps) => {
      emit({ type: 'next-steps', title, steps });
    },
    /** @param {import('./prereqs.js').Prereq[]} items */
    prereqs: (items) => {
      emit({ type: 'prereqs', items });
    },

    /**
     * @template T
     * @param {string} message
     * @param {import('./ui.js').Choice<T>[]} choices
     * @param {T} [defaultValue]
     * @returns {Promise<T>}
     */
    async select(message, choices, defaultValue) {
      const open = choices.filter((ch) => !ch.disabled);
      if (open.length === 1) {
        emit({ type: 'auto', message: plainText(message), display: plainText(open[0].name) });
        return open[0].value;
      }
      const index = choices.findIndex((ch) => ch.value === defaultValue);
      return ask('select', message, { choices: choices.map(choiceView), ...(index >= 0 ? { default: index } : {}) }, (raw) => {
        const i = Number(raw);
        const ch = Number.isInteger(i) ? choices[i] : undefined;
        if (!ch || ch.disabled) return { error: 'Choose one of the options.' };
        return { value: ch.value, display: plainText(ch.name) };
      });
    },

    /** @param {string} message @param {boolean} defaultValue @returns {Promise<boolean>} */
    confirm(message, defaultValue) {
      return ask('confirm', message, { default: defaultValue }, (raw) =>
        typeof raw === 'boolean' ? { value: raw, display: raw ? 'Yes' : 'No' } : { error: 'Answer yes or no.' });
    },

    /**
     * @param {string} message
     * @param {{ default?: string, validate?: (v: string) => true | string }} [o]
     * @returns {Promise<string>}
     */
    input(message, o = {}) {
      return ask('input', message, o.default !== undefined ? { default: o.default } : {}, (raw) => {
        if (typeof raw !== 'string') return { error: 'Type an answer.' };
        const v = raw.trim() || o.default || '';
        const verdict = o.validate?.(v) ?? true;
        return verdict === true ? { value: v, display: v } : { error: verdict };
      });
    },

    /** @param {string} message @returns {Promise<string>} */
    secret(message) {
      return ask('secret', message, {}, (raw) =>
        typeof raw === 'string' && raw.trim() ? { value: raw, display: SECRET_MASK } : { error: 'Required' });
    },

    /**
     * @template T
     * @param {string} message
     * @param {(import('./ui.js').Choice<T> & { checked?: boolean })[]} choices
     * @returns {Promise<T[]>}
     */
    checkbox(message, choices) {
      return ask('checkbox', message, { choices: choices.map(choiceView) }, (raw) => {
        if (!Array.isArray(raw)) return { error: 'Choose from the options.' };
        const picked = [...new Set(raw.map(Number))];
        if (picked.some((i) => !Number.isInteger(i) || !choices[i] || choices[i].disabled)) return { error: 'Choose from the options.' };
        return { value: picked.map((i) => choices[i].value), display: picked.map((i) => plainText(choices[i].name)).join(', ') || 'None' };
      });
    },

    /** @param {string} label */
    progress(label) {
      const started = now();
      const id = ++ids;
      return {
        /** @param {string} status */
        update(status) {
          emit({ type: 'progress', id, label: plainText(label), status: plainText(status), elapsed: now() - started });
        },
        done() {
          emit({ type: 'progress-done', id });
          return now() - started;
        },
      };
    },

    /**
     * An answer from the page. Checked with the question's own rules before it's taken.
     * @param {number} id
     * @param {unknown} raw
     */
    answer(id, raw) {
      const p = pending.get(id);
      if (!p) return { ok: false, error: 'That question isn\'t open.' };
      const r = p.parse(raw);
      if (r.error !== undefined) {
        emit({ type: 'invalid', id, error: r.error });
        return { ok: false, error: r.error };
      }
      pending.delete(id);
      emit({ type: 'answered', id, display: r.display ?? '' });
      p.resolve(r.value);
      return { ok: true };
    },

    /** Cancels the open questions, which stops the command. */
    cancel() {
      if (!pending.size) return false;
      for (const [id, p] of pending) {
        pending.delete(id);
        emit({ type: 'answered', id, display: 'Cancelled' });
        p.reject(Object.assign(new Error('Cancelled'), { name: 'ExitPromptError' }));
      }
      return true;
    },

    /** @param {number} [since]  The last event the page has. */
    history: (since = 0) => history.filter((e) => e.seq > since),
    /** @param {(e: UiEvent) => void} fn */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    get waiting() {
      return pending.size > 0;
    },
  };
}

/** @typedef {ReturnType<typeof createWebUi>} WebUi */

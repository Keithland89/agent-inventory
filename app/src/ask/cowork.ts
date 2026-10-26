/**
 * Client for the player's Cowork bridge (`cowork/*` methods).
 *
 * The bridge is a developer preview: the player only answers these methods when its `cowork`
 * developer setting is on, and @microsoft/managed-apps 0.6 does not wrap them. The platform bridge
 * also allows a single `connect()`, which the SDK makes. So `tapBridge()` wraps `connect` before
 * the SDK runs and keeps the channel it returns. Everything here fails closed: no bridge, no
 * channel or an unanswered method all surface as `CoworkUnavailable`, and the panel falls back to
 * handing the question to Copilot.
 */

type Def<K extends string> = { readonly kind: K; readonly method: string }

export interface BridgeChannel {
  stream(method: Def<'stream'>, params: unknown): AsyncIterable<unknown>
  notify(method: Def<'notify'>, params: unknown): void
}

interface PlatformBridge {
  connect: (...args: unknown[]) => Promise<BridgeChannel>
  __coworkTap?: boolean
}

const STREAM_PROMPT: Def<'stream'> = { kind: 'stream', method: 'cowork/streamPrompt' }
const CANCEL: Def<'notify'> = { kind: 'notify', method: 'cowork/cancel' }

/** How long to wait for the run to start before treating Cowork as switched off. */
const START_TIMEOUT_MS = 20_000

export type CoworkChunk =
  | { type: 'started'; sessionId: string }
  | { type: 'text'; delta: string }
  | { type: 'status'; message: string }
  | { type: 'tool'; name: string }
  | { type: 'file'; file: { id: string; name: string } }
  | { type: 'connectionRequired'; connectorId: string; message: string }
  | { type: 'done'; status: 'completed' | 'failed' | 'cancelled' | 'disconnected'; error?: string }
  | { type: 'error'; message: string }

export class CoworkUnavailable extends Error {}

let channel: Promise<BridgeChannel> | null = null

/** Call once, before anything imports the Managed Apps SDK. Safe to call outside the player. */
export function tapBridge(w: { __platformBridge?: PlatformBridge } = window as never) {
  const bridge = w.__platformBridge
  if (!bridge || typeof bridge.connect !== 'function' || bridge.__coworkTap) return
  const connect = bridge.connect.bind(bridge)
  try {
    bridge.connect = (...args: unknown[]) => {
      const p = connect(...args)
      channel = p
      return p
    }
    bridge.__coworkTap = true
  } catch {
    /* a frozen bridge just means no Cowork */
  }
}

/** True when the app is in the player and holds a channel Cowork could answer on. */
export const coworkReachable = () => channel !== null

/** Only for tests. */
export function setChannelForTest(c: BridgeChannel | null) {
  channel = c ? Promise.resolve(c) : null
}

/**
 * Streams one Cowork run. Throws `CoworkUnavailable` if the player does not answer, and
 * cancels the run when `signal` aborts.
 */
export async function* streamCowork(prompt: string, signal?: AbortSignal, startTimeoutMs = START_TIMEOUT_MS): AsyncGenerator<CoworkChunk> {
  if (!channel) throw new CoworkUnavailable('The app is not running in the player.')
  const ch = await channel
  const it = ch.stream(STREAM_PROMPT, { prompt })[Symbol.asyncIterator]()
  let sessionId = ''
  const cancel = () => {
    if (sessionId) ch.notify(CANCEL, { sessionId })
    void it.return?.()
  }
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    for (;;) {
      let r: IteratorResult<unknown>
      try {
        r = await (sessionId ? it.next() : withTimeout(it.next(), startTimeoutMs))
      } catch (e) {
        if (signal?.aborted) return
        if (!sessionId) throw new CoworkUnavailable(e instanceof Error ? e.message : String(e))
        throw e
      }
      if (r.done || signal?.aborted) return
      const chunk = r.value as CoworkChunk
      if (chunk.type === 'started') sessionId = chunk.sessionId
      yield chunk
      if (chunk.type === 'done' || chunk.type === 'error') return
    }
  } finally {
    signal?.removeEventListener('abort', cancel)
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Cowork did not start. It may be switched off in the player.')), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e: unknown) => {
        clearTimeout(t)
        reject(e instanceof Error ? e : new Error(String(e)))
      },
    )
  })
}

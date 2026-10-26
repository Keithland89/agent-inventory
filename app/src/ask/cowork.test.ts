import { afterEach, describe, expect, it } from 'vitest'
import { coworkReachable, CoworkUnavailable, setChannelForTest, streamCowork, tapBridge, type BridgeChannel, type CoworkChunk } from './cowork'

/** A fake channel whose stream yields `chunks`, then hangs if `hang` is set. */
function fake(chunks: unknown[], { hang = false, fail }: { hang?: boolean; fail?: Error } = {}) {
  const notified: { method: string; params: unknown }[] = []
  const streamed: { method: string; params: unknown }[] = []
  let closed = false
  const ch: BridgeChannel = {
    stream(def, params) {
      streamed.push({ method: def.method, params })
      let i = 0
      return {
        [Symbol.asyncIterator]: () => ({
          next: () => {
            if (fail) return Promise.reject(fail)
            if (closed) return Promise.resolve({ done: true, value: undefined })
            if (i < chunks.length) return Promise.resolve({ done: false, value: chunks[i++] })
            return hang ? new Promise<IteratorResult<unknown>>(() => {}) : Promise.resolve({ done: true, value: undefined })
          },
          return: () => {
            closed = true
            return Promise.resolve({ done: true, value: undefined })
          },
        }),
      }
    },
    notify(def, params) {
      notified.push({ method: def.method, params })
    },
  }
  return { ch, notified, streamed }
}

const collect = async (g: AsyncGenerator<CoworkChunk>) => {
  const out: CoworkChunk[] = []
  for await (const c of g) out.push(c)
  return out
}

afterEach(() => setChannelForTest(null))

describe('cowork', () => {
  it('is unavailable outside the player', async () => {
    expect(coworkReachable()).toBe(false)
    await expect(collect(streamCowork('hi'))).rejects.toBeInstanceOf(CoworkUnavailable)
  })

  it('streams a run and stops at done', async () => {
    const { ch, streamed } = fake([
      { type: 'started', sessionId: 's1' },
      { type: 'text', delta: 'Hello ' },
      { type: 'text', delta: 'there' },
      { type: 'done', status: 'completed' },
      { type: 'text', delta: 'ignored' },
    ])
    setChannelForTest(ch)
    const out = await collect(streamCowork('hi'))
    expect(streamed).toEqual([{ method: 'cowork/streamPrompt', params: { prompt: 'hi' } }])
    expect(out.map((c) => c.type)).toEqual(['started', 'text', 'text', 'done'])
  })

  it('treats a run that never starts as Cowork switched off', async () => {
    setChannelForTest(fake([], { hang: true }).ch)
    await expect(collect(streamCowork('hi', undefined, 20))).rejects.toBeInstanceOf(CoworkUnavailable)
  })

  it('treats a rejected method as Cowork switched off', async () => {
    setChannelForTest(fake([], { fail: new Error('Method not found') }).ch)
    await expect(collect(streamCowork('hi'))).rejects.toThrow(/Method not found/)
  })

  it('cancels the session when aborted', async () => {
    const { ch, notified } = fake([{ type: 'started', sessionId: 's9' }, { type: 'text', delta: 'Part' }], { hang: true })
    setChannelForTest(ch)
    const ctrl = new AbortController()
    const out: CoworkChunk[] = []
    for await (const c of streamCowork('hi', ctrl.signal)) {
      out.push(c)
      if (c.type === 'text') ctrl.abort()
    }
    expect(out.map((c) => c.type)).toEqual(['started', 'text'])
    expect(notified).toEqual([{ method: 'cowork/cancel', params: { sessionId: 's9' } }])
  })

  it('taps the bridge once and keeps the channel the SDK opens', async () => {
    const { ch } = fake([])
    let calls = 0
    const bridge = {
      connect: () => {
        calls++
        return Promise.resolve(ch)
      },
    }
    const w = { __platformBridge: bridge }
    tapBridge(w as never)
    tapBridge(w as never)
    expect(coworkReachable()).toBe(false)
    expect(await bridge.connect()).toBe(ch)
    expect(calls).toBe(1)
    expect(coworkReachable()).toBe(true)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { json } from '../test/fixtures'
import { getHealth, getOptions, predictFare } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('api client', () => {
  it('returns parsed JSON and posts JSON bodies', async () => {
    const fn = vi.fn(async () => json({ ok: 1 }))
    vi.stubGlobal('fetch', fn)
    expect(await predictFare({ a: 1 })).toEqual({ ok: 1 })
    expect(fn.mock.calls[0][0]).toBe('/api/predict')
    expect(fn.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{"a":1}' })
  })
  it('maps a network failure to a friendly error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(getOptions()).rejects.toMatchObject({ kind: 'network', message: expect.stringMatching(/couldn't reach/) })
  })
  it('maps a slow response to a timeout', async () => {
    vi.stubGlobal('fetch', vi.fn((_u, init) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('x', 'AbortError'))))))
    await expect(getHealth({ timeoutMs: 20 })).rejects.toMatchObject({ kind: 'timeout' })
  })
  it('reports caller aborts distinctly', async () => {
    const c = new AbortController()
    vi.stubGlobal('fetch', vi.fn((_u, init) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('x', 'AbortError'))))))
    const p = getHealth({ signal: c.signal })
    c.abort()
    await expect(p).rejects.toMatchObject({ kind: 'aborted' })
  })
  it('keeps the backend message and fields for 422', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'unsupported_itinerary', message: 'Bad combo', fields: [{ field: 'airline', message: 'Bad combo' }] }, 422)))
    await expect(predictFare({})).rejects.toMatchObject({ kind: 'http', status: 422, code: 'unsupported_itinerary', message: 'Bad combo', fields: [{ field: 'airline', message: 'Bad combo' }] })
  })
  it('uses friendly text for 503 and 500', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'model_unavailable', message: 'x' }, 503)))
    await expect(predictFare({})).rejects.toMatchObject({ status: 503, message: expect.stringMatching(/isn't available/) })
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'prediction_failed', message: 'x' }, 500)))
    await expect(predictFare({})).rejects.toMatchObject({ status: 500, message: expect.stringMatching(/valid prediction/) })
  })
  it('handles a non-JSON error and a non-JSON success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new Error('html') } })))
    await expect(getOptions()).rejects.toMatchObject({ kind: 'http', status: 502 })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new Error('html') } })))
    await expect(getOptions()).rejects.toMatchObject({ kind: 'parse' })
  })
})

// Thin client for the FastAPI backend (proxied as /api by Vite). Every failure is turned into an ApiClientError
// with a user-facing message; nothing here fabricates data.
// Production: set VITE_API_BASE_URL at build time to the public API origin (e.g. https://airfareindex-api.onrender.com).
// Development and preview use the same-origin '/api' proxy.
const BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')
// Generous: a free-tier backend that was asleep needs ~30-60 s to wake up and load the model on the first request.
const TIMEOUT_MS = 60000

export class ApiClientError extends Error {
  constructor({ kind, status = null, code = null, message, fields = [] }) {
    super(message)
    this.name = 'ApiClientError'
    this.kind = kind // 'network' | 'timeout' | 'http' | 'parse' | 'aborted'
    this.status = status
    this.code = code
    this.fields = fields
  }
}

const FRIENDLY = {
  network: "We couldn't reach the prediction service. Check that the backend is running, then try again.",
  timeout: 'The prediction service took too long to respond. Please try again.',
  parse: 'The prediction service sent a response we could not read. Please try again.',
  503: "The prediction model isn't available right now. Please try again in a moment.",
  500: "The service couldn't produce a valid prediction. Please try again.",
}

async function request(path, { method = 'GET', body, signal, timeoutMs = TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    let res
    try {
      res = await fetch(`${BASE}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
    } catch {
      if (signal?.aborted) throw new ApiClientError({ kind: 'aborted', message: 'Request cancelled.' })
      if (timedOut) throw new ApiClientError({ kind: 'timeout', message: FRIENDLY.timeout })
      throw new ApiClientError({ kind: 'network', message: FRIENDLY.network })
    }
    let data = null
    try {
      data = await res.json()
    } catch {
      if (res.ok) throw new ApiClientError({ kind: 'parse', status: res.status, message: FRIENDLY.parse })
    }
    if (!res.ok) {
      const message = res.status === 422 ? data?.message || 'Some inputs are not supported.' : FRIENDLY[res.status] || data?.message || `The service returned an error (${res.status}).`
      throw new ApiClientError({ kind: 'http', status: res.status, code: data?.error ?? null, message, fields: data?.fields ?? [] })
    }
    return data
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

export const getHealth = (opts) => request('/health', opts)
export const getOptions = (opts) => request('/options', opts)
export const getInsights = (opts) => request('/model/insights', opts)
export const getModelInfo = (opts) => request('/model/info', opts)
export const predictFare = (payload, opts) => request('/predict', { method: 'POST', body: payload, ...opts })

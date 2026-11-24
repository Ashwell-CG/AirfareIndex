import { useCallback, useEffect, useState } from 'react'

// Small shared cache for read-only API resources (/options, /model/insights, /model/info) so that moving between
// pages does not refetch. Failures are never cached; reload() forces a fresh request.
const cache = new Map()

export function useResource(key, loader) {
  const hit = cache.get(key)
  const [state, setState] = useState(() => (hit?.data ? { status: 'ready', data: hit.data, error: null } : { status: 'loading', data: null, error: null }))
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const entry = cache.get(key)
    if (entry?.data) return undefined
    let alive = true
    const promise = entry?.promise ?? loader()
    if (!entry?.promise) cache.set(key, { promise })
    promise
      .then((data) => { cache.set(key, { data }); if (alive) setState({ status: 'ready', data, error: null }) })
      .catch((error) => { cache.delete(key); if (alive && error?.kind !== 'aborted') setState({ status: 'error', data: null, error }) })
    return () => { alive = false }
  }, [key, loader, attempt])

  const reload = useCallback(() => {
    cache.delete(key)
    setState({ status: 'loading', data: null, error: null })
    setAttempt((n) => n + 1)
  }, [key])
  return { ...state, reload }
}

export const clearResourceCache = () => cache.clear() // tests

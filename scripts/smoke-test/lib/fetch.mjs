// Small fetch wrapper: timeout + JSON parsing + consistent error shape.

export async function fetchJson(url, {
  method = 'GET',
  headers = {},
  body = undefined,
  timeoutMs = 60000,
} = {}) {
  const t0 = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method,
      headers: { Accept: 'application/json', ...headers },
      body,
      signal: controller.signal,
      cache: 'no-store',
    })
    const text = await res.text()
    let json = null
    try { json = text ? JSON.parse(text) : null } catch {}
    return {
      ok: res.ok,
      status: res.status,
      ms: Date.now() - t0,
      json,
      text: json ? null : text.slice(0, 500),
      url,
    }
  } catch (e) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - t0,
      json: null,
      text: null,
      error: e.name === 'AbortError' ? 'timeout' : String(e).slice(0, 200),
      url,
    }
  } finally {
    clearTimeout(timer)
  }
}

// Run an array of async thunks with bounded concurrency.
export async function parallel(tasks, concurrency = 6, onProgress = null) {
  const results = new Array(tasks.length)
  let cursor = 0, done = 0
  async function worker() {
    while (true) {
      const i = cursor++
      if (i >= tasks.length) return
      results[i] = await tasks[i]()
      done++
      if (onProgress) onProgress(done, tasks.length, results[i])
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker)
  await Promise.all(workers)
  return results
}

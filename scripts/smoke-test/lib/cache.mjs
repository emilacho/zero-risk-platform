// Simple on-disk cache of smoke test results.
// Key = agent slug or workflow id. Value = { status, ts, ms, output_len }.
// Default TTL: 24h. Use --no-cache to force re-test.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = resolve(__dirname, '..', 'out', '.cache')
const CACHE_FILE = resolve(CACHE_DIR, 'smoke-results.json')
const TTL_MS = 24 * 60 * 60 * 1000  // 24 hours

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })

function loadCache() {
  if (!existsSync(CACHE_FILE)) return {}
  try { return JSON.parse(readFileSync(CACHE_FILE, 'utf-8')) } catch { return {} }
}

function saveCache(data) {
  writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2))
}

// Returns cached result if fresh + PASS. Expired or FAIL results always re-run.
export function cachedPassOrNull(key) {
  const cache = loadCache()
  const entry = cache[key]
  if (!entry) return null
  if (entry.status !== 'PASS') return null
  if (Date.now() - entry.ts > TTL_MS) return null
  return { ...entry, from_cache: true }
}

export function recordResult(key, result) {
  const cache = loadCache()
  cache[key] = { ...result, ts: Date.now() }
  saveCache(cache)
}

export function clearCache() {
  saveCache({})
}

export function cacheStats() {
  const cache = loadCache()
  const entries = Object.values(cache)
  const fresh = entries.filter(e => Date.now() - e.ts <= TTL_MS)
  return { total: entries.length, fresh: fresh.length, pass: fresh.filter(e => e.status === 'PASS').length }
}

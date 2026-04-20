// Load .env.local into process.env + return selected keys.
// Runs from zero-risk-platform/scripts/smoke-test/ — walks up to repo root.

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = resolve(__dirname, '..', '..', '..', '.env.local')

export function loadEnv() {
  const raw = readFileSync(ENV_PATH, 'utf-8')
  const out = {}
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 0) continue
    const k = t.slice(0, eq).trim()
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    out[k] = v
    if (!process.env[k]) process.env[k] = v
  }
  return out
}

export function requireEnv(keys) {
  const env = loadEnv()
  const missing = keys.filter(k => !env[k] && !process.env[k])
  if (missing.length) {
    throw new Error(`Missing .env.local keys: ${missing.join(', ')}`)
  }
  return env
}

// Canonical endpoints for the harness
export function endpoints(env = loadEnv()) {
  return {
    vercel: env.NEXT_PUBLIC_BASE_URL && env.NEXT_PUBLIC_BASE_URL.startsWith('https://')
      ? env.NEXT_PUBLIC_BASE_URL
      : 'https://zero-risk-platform.vercel.app',
    n8n: env.N8N_BASE_URL || 'https://n8n-production-72be.up.railway.app',
    supabase: env.NEXT_PUBLIC_SUPABASE_URL,
    INTERNAL_API_KEY: env.INTERNAL_API_KEY,
    N8N_API_KEY: env.N8N_API_KEY || '',
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
  }
}

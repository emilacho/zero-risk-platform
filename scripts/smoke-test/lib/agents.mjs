// Agent inventory + single-agent smoke tester.

import { readdirSync, existsSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { fetchJson } from './fetch.mjs'
import { endpoints } from './env.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Canonical list of agent slugs — built from the identidades/ folder.
const IDENTIDADES_ROOT = resolve(__dirname, '..', '..', '..', '..', 'docs', '04-agentes', 'identidades')

export function listAgents() {
  const slugs = new Set()
  if (!existsSync(IDENTIDADES_ROOT)) return []
  const entries = readdirSync(IDENTIDADES_ROOT, { withFileTypes: true })
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith('.md')) {
      const slug = e.name.replace(/\.md$/, '')
      if (slug === 'MANIFEST' || slug === 'GUIA_DE_IDENTIDADES') continue
      slugs.add(slug)
    }
    if (e.isDirectory()) {
      // seo/ has sub-agents like seo-researcher.md, etc.
      const subRoot = join(IDENTIDADES_ROOT, e.name)
      try {
        const sub = readdirSync(subRoot)
        for (const f of sub) {
          if (f.endsWith('.md')) slugs.add(f.replace(/\.md$/, ''))
        }
      } catch {}
    }
  }
  return Array.from(slugs).sort()
}

// Default prompt: a single-line "who are you" check that's cheap to run.
export function defaultPrompt(slug, { cheap = false } = {}) {
  if (cheap) return `ping`  // ultra-minimal — ~5 tokens total
  return `Responde en UNA sola frase corta: "Soy <rol>, <responsabilidad principal>". Nada más. slug=${slug}.`
}

// Run a single agent via POST /api/agents/run.
// Returns a normalized result row.
// cheap=true: forces Haiku, empties skills_filter, limits output to 50 tokens.
//             Expected cost: ~$0.001 per call (vs $0.02-0.05 normal). 25x cheaper.
export async function testAgent(slug, { task = null, timeoutMs = 60000, cheap = false } = {}) {
  const ep = endpoints()
  const t0 = Date.now()
  const ctx = { client_id: 'smoke-test-harness', test_run: true }
  if (cheap) {
    ctx.skills_filter = []           // don't load any skills — saves 20-30KB per call
    ctx.max_tokens = 50              // cap output tokens
    ctx.model_override = 'claude-haiku-4-5-20251001'  // force Haiku (4x cheaper than Sonnet)
  }
  const body = JSON.stringify({
    agent: slug,
    task: task || defaultPrompt(slug, { cheap }),
    context: ctx,
  })
  const res = await fetchJson(ep.vercel + '/api/agents/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ep.INTERNAL_API_KEY },
    body,
    timeoutMs,
  })
  const j = res.json
  const ok = !!(res.ok && j && j.success && (j.output || j.response || j.result))
  const output = j?.output || j?.response || j?.result || ''
  return {
    type: 'agent',
    slug,
    status: ok ? 'PASS' : 'FAIL',
    http_status: res.status,
    duration_ms: Date.now() - t0,
    output_len: typeof output === 'string' ? output.length : 0,
    output_preview: typeof output === 'string' ? output.slice(0, 120) : '',
    tokens: j?.tokens_used ?? null,
    model: j?.model || null,
    error: res.error || j?.error || (ok ? null : (res.text?.slice(0, 120) || 'unknown')),
  }
}

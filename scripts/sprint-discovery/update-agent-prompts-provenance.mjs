#!/usr/bin/env node
/**
 * Sprint multi-source discovery §144 · Tasks 2+3 · prompts de provenance.
 * 2026-06-27 · CC#1 · branch.
 *
 * Anexa instrucciones de provenance (taxonomía Brain provenance_tag) a ·
 *   - onboarding_specialist · emitir source + trust_level por competidor
 *   - competitive-intelligence-agent · ponderar trust_level en el veredicto
 *
 * §144 PENDIENTE · default DRY-RUN · NO escribe. `--apply` requiere
 * A_PROMPTS_CONFIRM_SS144=yes (ratificación §144 + protocolo identity_content).
 * Idempotente · usa un sentinel · no duplica si ya está aplicado.
 *
 * Uso ·
 *   node scripts/sprint-discovery/update-agent-prompts-provenance.mjs           # dry-run
 *   A_PROMPTS_CONFIRM_SS144=yes node ... --apply                                # GATED §144
 */
import { readFileSync } from 'node:fs'

const APPLY = process.argv.includes('--apply')
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

const SENTINEL = '<!-- prov-multisource-ss144 -->'

const ONBOARDING_BLOCK = `

${SENTINEL}
## Provenance multi-source (§144 · taxonomía Brain provenance_tag)

Por CADA competidor que descubras, incluí dos campos extra en su objeto:
- \`source\`: de dónde salió ese competidor ·
  - \`"apify_scrape"\` → scrape Apify directo (Instagram/LinkedIn/web reales).
  - \`"onboarding_discovery"\` → inferido por búsqueda/razonamiento (no scrape directo).
- \`trust_level\`: SIEMPRE \`"untrusted"\`. El discovery es evidencia de terceros ·
  NUNCA uses \`"tenant_trusted"\` (solo para datos que el cliente provee directamente).
- NO inventes valores fuera de estos enums. NO asignes \`type\` ni \`"canon"\`
  (el sistema marca discovery como \`evidence\` automáticamente).

Ejemplo: { "name": "La Pinta", "website": "...", "source": "apify_scrape", "trust_level": "untrusted" }`

const COMPINTEL_BLOCK = `

${SENTINEL}
## Ponderación de confianza (trust_level · §144)

Al emitir tu veredicto, ponderá \`trust_level\` y \`source\` de los competidores:
- Si ≥1 competidor tiene \`source: "apify_scrape"\` directo (Instagram/LinkedIn/web reales ·
  aunque \`trust_level: "untrusted"\`) → hay evidencia real · podés emitir \`confirmar\`
  con una razón explícita citando esas fuentes.
- Si todos los competidores son \`source: "search"\`/inferencia (baja evidencia) → \`observar\`.
- Si \`competitors[]\` está vacío → \`observar\`.
- Incluí SIEMPRE en el veredicto las fuentes usadas (source por competidor) para transparencia.`

const TARGETS = [
  { slug: 'onboarding_specialist', block: ONBOARDING_BLOCK },
  { slug: 'competitive-intelligence-agent', block: COMPINTEL_BLOCK },
]

async function getIdentity(slug) {
  const r = await fetch(`${URL}/rest/v1/agents?select=name,identity_content&name=eq.${slug}`, { headers: H })
  const d = await r.json()
  return d[0]?.identity_content ?? null
}
async function patchIdentity(slug, content) {
  const r = await fetch(`${URL}/rest/v1/agents?name=eq.${slug}`, {
    method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ identity_content: content }),
  })
  if (!r.ok) throw new Error(`patch ${slug} ${r.status}: ${await r.text()}`)
}

console.log(`Sprint discovery · prompts provenance · modo · ${APPLY ? '⚠ APPLY (GATED §144)' : 'DRY-RUN (default)'}`)
if (APPLY && env.A_PROMPTS_CONFIRM_SS144 !== 'yes') {
  console.error('\n✋ --apply requiere A_PROMPTS_CONFIRM_SS144=yes (ratificación §144). Abortado.')
  process.exit(2)
}

for (const t of TARGETS) {
  const cur = await getIdentity(t.slug)
  if (cur === null) { console.log(`\n${t.slug} · ❌ NO existe en agents`); continue }
  if (cur.includes(SENTINEL)) { console.log(`\n${t.slug} · ya tiene el bloque (idempotente · skip) · len ${cur.length}`); continue }
  const next = cur + t.block
  console.log(`\n${t.slug} · ${cur.length} → ${next.length} (+${t.block.length} chars)`)
  console.log('  preview adición:', t.block.trim().split('\n').slice(0, 2).join(' / '))
  if (APPLY) { await patchIdentity(t.slug, next); console.log('  ✅ aplicado') }
}
console.log(APPLY ? '\n✅ done' : '\nℹ️ dry-run · re-correr con --apply (post §144) para escribir')

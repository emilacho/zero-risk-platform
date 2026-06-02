#!/usr/bin/env node
/**
 * Build real-data corpus canon canonical · Gate 3 in-the-wild proxy
 *
 * Spec · spec-CC1-adr012-gate3-in-the-wild.md
 *
 * Canon canonical §148 honest · prod tiene CERO external ingress real
 * (competitor_snapshots=0 · review_metrics=0 · form_submissions=0 ·
 * contact_submissions=0 · etc) · canon canonical Gate 3 literal "Apify
 * scrapes + reviews + forms" NO ES POSIBLE hoy. Pivot canon canonical-
 * pragmatic · sample text data canon-internal canonical · canon canonical
 * mejor proxy disponible para FP measurement filter shadow.
 *
 * Sources canon canonical · 4 ·
 *   - agent_invocations (1355) · metadata.task_text + input_summary +
 *     output_summary · canon-internal Cowork→agent task descriptions
 *   - onboarding_discovery_logs (14) · canon-Apify scrape attempts
 *     (canon canon-most failed pero canon canonical-text shape similar)
 *   - agent_outcomes (95) · agent eval responses
 *   - cowork_messages (8) · Cowork↔Emilio messages
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const evidenceDir = path.join(__dirname, '..', 'evidence')

function extractFromAgentInvocations() {
  const raw = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'raw-agent-invocations-200.json'), 'utf-8'))
  const samples = []
  for (const row of raw) {
    const meta = row.metadata || {}
    // canon · prefer task_text · fallback input_summary
    const text = meta.task_text || meta.input_summary || null
    if (!text || typeof text !== 'string' || text.length < 10) continue
    samples.push({
      id: `inv_${row.id.slice(0, 8)}`,
      source_table: 'agent_invocations',
      source_field: meta.task_text ? 'metadata.task_text' : 'metadata.input_summary',
      agent_name: row.agent_name,
      created_at: row.created_at,
      text: text.slice(0, 4000), // canon · cap 4000 chars
      locale_guess: /[áéíóúñ¿¡]/.test(text) ? 'es' : 'en',
    })
  }
  return samples
}

function extractFromOnboardingLogs() {
  const raw = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'raw-onboarding-logs.json'), 'utf-8'))
  const samples = []
  for (const row of raw) {
    const text =
      (typeof row.result_summary === 'string' ? row.result_summary : '') +
      ' ' +
      (typeof row.target_url === 'string' ? row.target_url : '') +
      ' ' +
      (row.result_data && typeof row.result_data === 'object'
        ? JSON.stringify(row.result_data).slice(0, 500)
        : '')
    const cleaned = text.trim()
    if (cleaned.length < 10) continue
    samples.push({
      id: `obd_${row.id.slice(0, 8)}`,
      source_table: 'onboarding_discovery_logs',
      source_field: 'result_summary+target_url+result_data',
      agent_name: row.agent_name || 'onboarding-discovery',
      created_at: row.created_at,
      text: cleaned.slice(0, 4000),
      locale_guess: 'en',
    })
  }
  return samples
}

function extractFromAgentOutcomes() {
  const raw = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'raw-agent-outcomes.json'), 'utf-8'))
  const samples = []
  for (const row of raw) {
    // canon · agent_outcomes shape varies · concat any text fields
    const candidates = [
      row.reasoning,
      row.outcome_text,
      row.eval_text,
      row.feedback,
      row.notes,
      typeof row.metadata === 'object' ? JSON.stringify(row.metadata).slice(0, 1000) : '',
    ]
    const text = candidates
      .filter((x) => typeof x === 'string' && x.length > 5)
      .join(' · ')
      .trim()
    if (text.length < 10) continue
    samples.push({
      id: `out_${row.id.slice(0, 8)}`,
      source_table: 'agent_outcomes',
      source_field: 'reasoning+outcome+eval+feedback+notes+metadata',
      agent_name: row.agent_name || row.agent_id || 'unknown',
      created_at: row.created_at,
      text: text.slice(0, 4000),
      locale_guess: /[áéíóúñ¿¡]/.test(text) ? 'es' : 'en',
    })
  }
  return samples
}

function extractFromCoworkMessages() {
  const raw = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'raw-cowork-messages.json'), 'utf-8'))
  const samples = []
  for (const row of raw) {
    const text =
      (typeof row.message === 'string' ? row.message : '') ||
      (typeof row.body === 'string' ? row.body : '') ||
      (typeof row.content === 'string' ? row.content : '') ||
      ''
    if (text.length < 10) continue
    samples.push({
      id: `cwk_${row.id.slice(0, 8)}`,
      source_table: 'cowork_messages',
      source_field: 'message',
      agent_name: 'cowork',
      created_at: row.created_at,
      text: text.slice(0, 4000),
      locale_guess: /[áéíóúñ¿¡]/.test(text) ? 'es' : 'en',
    })
  }
  return samples
}

const invocations = extractFromAgentInvocations()
const onboarding = extractFromOnboardingLogs()
const outcomes = extractFromAgentOutcomes()
const cowork = extractFromCoworkMessages()

const corpus = {
  version: '1.0.0',
  created: new Date().toISOString(),
  source: 'Gate 3 proxy corpus · canon §148 honest · prod has zero external ingress data',
  note: 'Real data sampled from prod ordaeyxvvvdqsznsecjx · 4 internal tables · canon-proxy for "filter behavior on real text".',
  per_source_counts: {
    agent_invocations: invocations.length,
    onboarding_discovery_logs: onboarding.length,
    agent_outcomes: outcomes.length,
    cowork_messages: cowork.length,
  },
  total: invocations.length + onboarding.length + outcomes.length + cowork.length,
  samples: [...invocations, ...onboarding, ...outcomes, ...cowork],
}

fs.writeFileSync(
  path.join(__dirname, 'real-corpus.json'),
  JSON.stringify(corpus, null, 2),
)

console.log('Built corpus canon canonical ·')
console.log(`  agent_invocations: ${invocations.length}`)
console.log(`  onboarding_discovery_logs: ${onboarding.length}`)
console.log(`  agent_outcomes: ${outcomes.length}`)
console.log(`  cowork_messages: ${cowork.length}`)
console.log(`  TOTAL: ${corpus.total}`)
console.log(`Locale distribution · es: ${corpus.samples.filter((s) => s.locale_guess === 'es').length} · en: ${corpus.samples.filter((s) => s.locale_guess === 'en').length}`)

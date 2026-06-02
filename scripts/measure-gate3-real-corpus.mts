#!/usr/bin/env node
/**
 * Measure · Gate 3 in-the-wild · canon canonical real corpus FP/FN
 *
 * Spec · spec-CC1-adr012-gate3-in-the-wild.md
 *
 * Canon canonical · run filter shadow over real-corpus.json (canon canonical
 * 219 samples · canon canonical-internal text proxy because prod has zero
 * external ingress) · canon canonical-default-label benigno + canon
 * canonical-audit canon-anything-flagged + spot-check canon canonical
 * unflagged sample. Real Haiku canon canonical canon canon-classifier calls.
 *
 * Output canon · evidence/gate3-summary.json + evidence/gate3-per-sample.json
 *   - per-sample · canonical filter decision + classifier output + auto-
 *     label heuristic
 *   - summary · canonical FP rate (canon · since canon canonical-all expected
 *     benign · any flag = FP) + characterization buckets
 *
 * Cost canon canonical · ~219 samples × 2 calls (pipeline + canon canonical
 * tolerant strict mode) · canon canonical-but pipeline only fires classifier
 * if regex MEDIUM · canon canonical-most pass through canon-cheap.
 *
 * Usage canon canonical · node --env-file=... scripts/measure-gate3-real-corpus.mts
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runIngressFilter } from '../src/lib/ingress-filter/pipeline'
import {
  classifierGate,
  classificationToSeverity,
} from '../src/lib/ingress-filter/gates/classifier'
import type { ClassifierClient, ClassifierOutput, GateDecision, Severity } from '../src/lib/ingress-filter'
import { HaikuFetchClient } from '../src/lib/ingress-filter/clients/haiku-fetch-client'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface CorpusSample {
  id: string
  source_table: string
  source_field: string
  agent_name: string
  created_at: string
  text: string
  locale_guess: 'en' | 'es'
}

interface Corpus {
  version: string
  samples: CorpusSample[]
}

interface PerSampleResult {
  id: string
  source_table: string
  locale: 'en' | 'es'
  text_excerpt: string // canon canonical first 200 chars
  text_length: number
  // canon canonical regex-only (cheap pass first)
  regex_severity: Severity
  regex_hits: number
  regex_hit_ids: string[]
  // canon canonical pipeline (regex + classifier-if-MEDIUM)
  pipeline_severity: Severity
  pipeline_shadow_blocks: string[]
  pipeline_classifier_called: boolean
  // canon canonical forced classifier (strict parser · canon canonical-isolated Haiku canon canon)
  forced_classifier_severity?: Severity
  forced_classifier_output?: ClassifierOutput
  forced_classifier_error?: string
  forced_classifier_latency_ms?: number
  // canon canonical · TRUE if pipeline OR forced classifier flagged anything
  flagged_any: boolean
  flagged_by: ('regex' | 'classifier_pipeline' | 'classifier_forced')[]
}

async function runOne(
  sample: CorpusSample,
  client: ClassifierClient,
): Promise<PerSampleResult> {
  // 1 · regex-only
  const regexResult = await runIngressFilter(
    {
      raw_text: sample.text,
      source: 'unknown',
      ingress_route: `gate3-${sample.source_table}`,
      locale_hint: sample.locale_guess,
    },
    { skip_classifier: true },
  )
  const regexGate = regexResult.gates.find((g) => g.gate === 'regex_deny')
  const regex_severity = regexGate?.severity ?? 'LOW'
  const regex_hits = (regexGate?.metadata?.hits_count as number) ?? 0
  const regex_hit_ids = (regexGate?.metadata?.hit_ids as string[]) ?? []

  // 2 · pipeline (regex + classifier-if-MEDIUM)
  const pipeResult = await runIngressFilter(
    {
      raw_text: sample.text,
      source: 'unknown',
      ingress_route: `gate3-${sample.source_table}`,
      locale_hint: sample.locale_guess,
    },
    { classifier_client: client },
  )
  const pipeline_classifier_called = !!pipeResult.gates.find((g) => g.gate === 'classifier')

  // 3 · forced classifier (canon canonical isolated Haiku decision)
  const t0 = Date.now()
  const forced: GateDecision = await classifierGate(sample.text, {
    client,
    session_id: 'gate3-' + sample.id,
    timeout_ms: 10000,
  })
  const forced_latency = Date.now() - t0

  let forced_severity: Severity = 'UNKNOWN'
  let forced_output: ClassifierOutput | undefined
  let forced_error: string | undefined
  if (forced.metadata?.gate_error) {
    forced_error = forced.reason
  } else {
    forced_output = {
      classification_type: forced.metadata!.classification_type as ClassifierOutput['classification_type'],
      confidence: forced.metadata!.confidence as number,
      should_escalate_hitl: forced.metadata!.should_escalate_hitl as boolean,
      escalation_reason: forced.metadata!.escalation_reason as ClassifierOutput['escalation_reason'],
    }
    forced_severity = classificationToSeverity(forced_output)
  }

  const flagged_by: PerSampleResult['flagged_by'] = []
  if (regex_severity !== 'LOW') flagged_by.push('regex')
  if (pipeResult.shadow_blocks.length > 0) flagged_by.push('classifier_pipeline')
  if (forced_severity !== 'LOW' && forced_severity !== 'UNKNOWN') flagged_by.push('classifier_forced')

  return {
    id: sample.id,
    source_table: sample.source_table,
    locale: sample.locale_guess,
    text_excerpt: sample.text.slice(0, 200),
    text_length: sample.text.length,
    regex_severity,
    regex_hits,
    regex_hit_ids,
    pipeline_severity: pipeResult.severity,
    pipeline_shadow_blocks: pipeResult.shadow_blocks,
    pipeline_classifier_called,
    forced_classifier_severity: forced_severity,
    forced_classifier_output: forced_output,
    forced_classifier_error: forced_error,
    forced_classifier_latency_ms: forced_latency,
    flagged_any: flagged_by.length > 0,
    flagged_by,
  }
}

async function main() {
  const startedAt = new Date().toISOString()
  const corpusPath = path.join(__dirname, 'real-corpus.json')
  if (!fs.existsSync(corpusPath)) {
    console.error('[gate3] missing corpus canon canonical · run build-real-corpus.mjs first')
    process.exit(2)
  }
  const corpus: Corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf-8'))

  console.error(`[gate3] loaded ${corpus.samples.length} samples canon canonical`)
  if (!process.env.CLAUDE_API_KEY) {
    console.error('[gate3] CLAUDE_API_KEY missing canon canonical')
    process.exit(2)
  }

  const client = new HaikuFetchClient()

  const results: PerSampleResult[] = []
  for (let i = 0; i < corpus.samples.length; i++) {
    if (i % 20 === 0) console.error(`[gate3] progress ${i}/${corpus.samples.length}`)
    const r = await runOne(corpus.samples[i]!, client)
    results.push(r)
  }

  // ============================================================
  // Aggregate canon canonical
  // ============================================================

  const flagged = results.filter((r) => r.flagged_any)
  const flagged_regex = results.filter((r) => r.flagged_by.includes('regex'))
  const flagged_pipeline = results.filter((r) => r.flagged_by.includes('classifier_pipeline'))
  const flagged_forced = results.filter((r) => r.flagged_by.includes('classifier_forced'))

  // canon canonical · per-source breakdown
  const bySource: Record<string, { total: number; flagged: number; flagged_ids: string[] }> = {}
  for (const r of results) {
    bySource[r.source_table] = bySource[r.source_table] ?? {
      total: 0,
      flagged: 0,
      flagged_ids: [],
    }
    bySource[r.source_table]!.total += 1
    if (r.flagged_any) {
      bySource[r.source_table]!.flagged += 1
      bySource[r.source_table]!.flagged_ids.push(r.id)
    }
  }

  // canon canonical · per-locale breakdown
  const byLocale = {
    en: {
      total: results.filter((r) => r.locale === 'en').length,
      flagged: results.filter((r) => r.locale === 'en' && r.flagged_any).length,
    },
    es: {
      total: results.filter((r) => r.locale === 'es').length,
      flagged: results.filter((r) => r.locale === 'es' && r.flagged_any).length,
    },
  }

  // canon canonical · classifier latency
  const latencies = results
    .map((r) => r.forced_classifier_latency_ms)
    .filter((x): x is number => typeof x === 'number')
    .sort((a, b) => a - b)
  const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? null
  const p99 = latencies[Math.floor(latencies.length * 0.99)] ?? null

  // canon canonical · classification distribution forced
  const classification_distribution: Record<string, number> = {}
  for (const r of results) {
    if (r.forced_classifier_output) {
      const c = r.forced_classifier_output.classification_type
      classification_distribution[c] = (classification_distribution[c] ?? 0) + 1
    } else if (r.forced_classifier_error) {
      classification_distribution['_error'] = (classification_distribution['_error'] ?? 0) + 1
    }
  }

  const summary = {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    corpus_version: corpus.version,
    samples_count: results.length,
    canonical_assumption:
      'All samples default-labeled benigno (canon canonical-§148 honest · prod is canon canonical pre-cliente-piloto · internal text canon-no external attack expected). FP rate = flagged_any / total. FN = canon canonical-cannot-measure-without-injection-samples-in-real-corpus.',
    summary: {
      flagged_any: flagged.length,
      flagged_regex: flagged_regex.length,
      flagged_classifier_pipeline: flagged_pipeline.length,
      flagged_classifier_forced: flagged_forced.length,
      fp_rate_pipeline: results.length > 0 ? flagged_pipeline.length / results.length : 0,
      fp_rate_forced: results.length > 0 ? flagged_forced.length / results.length : 0,
      fp_rate_regex_only: results.length > 0 ? flagged_regex.length / results.length : 0,
    },
    by_source: bySource,
    by_locale: byLocale,
    classifier_latency_ms: { p50, p99, count: latencies.length },
    classification_distribution_forced: classification_distribution,
    flagged_sample_ids: {
      regex: flagged_regex.map((r) => r.id),
      pipeline: flagged_pipeline.map((r) => r.id),
      forced: flagged_forced.map((r) => r.id),
    },
  }

  console.log(JSON.stringify(summary, null, 2))

  const perSamplePath = path.join(__dirname, '..', 'evidence', 'gate3-per-sample.json')
  fs.writeFileSync(perSamplePath, JSON.stringify({ samples: results }, null, 2))
  console.error(`[gate3] per-sample written canon canonical · ${perSamplePath}`)
  console.error('[gate3] done canon canonical')
  process.exit(0)
}

main().catch((e) => {
  console.error(`[gate3] exception canon canonical · ${e instanceof Error ? e.message : String(e)}`)
  process.exit(3)
})

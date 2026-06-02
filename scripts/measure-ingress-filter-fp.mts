#!/usr/bin/env node
/**
 * Measure · ingress-filter FP/FN canon canonical · pre-flip-enforce gate §7.3
 *
 * Spec · spec-CC1-adr012-fp-measurement-preflip.md
 *       + ADR-012 §7.3 Gate 1 golden set FP measurement
 *
 * Canon canonical · runs golden set canon canonical · 3 modes ·
 *   1. regex-only · canon Capa 2 isolated · NO classifier
 *   2. pipeline-haiku · canon canonical full pipeline + real Haiku call
 *   3. pipeline-haiku-forced · canon canonical force-call classifier on
 *      ALL samples regardless regex (canon canonical isolates Haiku FP/FN)
 *
 * Plus canon canonical bench mode · runs Haiku + Lakera stub side-by-side
 * (Lakera returns canonical-pend-key marker · §151 ruling).
 *
 * Cost canon canonical · ~100 samples × 500 tokens × $1/M = ~$0.05 per run.
 *
 * Exit codes canon canonical ·
 *   0 = measurement complete · canon canonical results written
 *   2 = harness error (golden set missing · client init failed)
 *   3 = unexpected exception
 *
 * Usage canon canonical ·
 *   node --env-file=../zero-risk-platform/.env.local scripts/measure-ingress-filter-fp.mts
 *   node ... scripts/measure-ingress-filter-fp.mts --skip-haiku   (regex-only)
 *   node ... scripts/measure-ingress-filter-fp.mts --bench         (Haiku + Lakera bench)
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runIngressFilter } from '../src/lib/ingress-filter/pipeline'
import {
  CLASSIFIER_SYSTEM_PROMPT,
} from '../src/lib/ingress-filter/gates/classifier'
import { CLASSIFICATION_TYPES, ESCALATION_REASONS } from '../src/lib/ingress-filter'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// canon canonical TOLERANT parser · canonical-research-only · strips markdown
// fence around JSON · canon canonical canonical-measures TRUE Haiku quality
// for §151 vendor decision · canon canonical the canonical-strict-lib parser
// canon canonical rejects fence per R2 #3 (canon canonical canon canonical
// design decision) · canon canonical numbers difference = canon canonical
// "how much canon canonical-strictness costs detection"
function parseClassifierResponseTolerant(raw: string): ClassifierOutput | null {
  let cleaned = raw.trim()
  // canon canonical · strip ```json ... ``` fence
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  }
  // canon canonical · strip leading "Sure," / "Here is" prose if present
  const jsonStart = cleaned.indexOf('{')
  const jsonEnd = cleaned.lastIndexOf('}')
  if (jsonStart > 0 && jsonEnd > jsonStart) {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const obj = parsed as Record<string, unknown>
  if (typeof obj.classification_type !== 'string') return null
  if (!CLASSIFICATION_TYPES.includes(obj.classification_type as (typeof CLASSIFICATION_TYPES)[number])) return null
  if (typeof obj.confidence !== 'number' || Number.isNaN(obj.confidence) || obj.confidence < 0 || obj.confidence > 1) return null
  if (typeof obj.should_escalate_hitl !== 'boolean') return null
  if (obj.escalation_reason !== null && typeof obj.escalation_reason !== 'string') return null
  if (
    obj.escalation_reason !== null &&
    !ESCALATION_REASONS.includes(obj.escalation_reason as (typeof ESCALATION_REASONS)[number])
  ) {
    return null
  }
  // canon canonical · tolerant relaxes the strict consistency check
  // (should_escalate_hitl ↔ escalation_reason) · keeps shape validation only
  return {
    classification_type: obj.classification_type as ClassifierOutput['classification_type'],
    confidence: obj.confidence,
    should_escalate_hitl: obj.should_escalate_hitl,
    escalation_reason: obj.escalation_reason as ClassifierOutput['escalation_reason'],
  }
}
import {
  classifierGate,
  classificationToSeverity,
  parseClassifierResponse,
} from '../src/lib/ingress-filter/gates/classifier'
import type {
  ClassifierClient,
  ClassifierOutput,
  GateDecision,
  IngressFilterDecision,
  Severity,
} from '../src/lib/ingress-filter'
import { HaikuFetchClient } from '../src/lib/ingress-filter/clients/haiku-fetch-client'
import { LakeraStubClient } from '../src/lib/ingress-filter/clients/lakera-stub-client'

// ============================================================
// CLI args
// ============================================================

const SKIP_HAIKU = process.argv.includes('--skip-haiku')
const BENCH_MODE = process.argv.includes('--bench')
const SAMPLE_LIMIT_IDX = process.argv.findIndex((a) => a === '--limit')
const SAMPLE_LIMIT =
  SAMPLE_LIMIT_IDX > 0 && process.argv[SAMPLE_LIMIT_IDX + 1]
    ? Number.parseInt(process.argv[SAMPLE_LIMIT_IDX + 1]!, 10)
    : undefined

// ============================================================
// Golden set types
// ============================================================

interface GoldenSample {
  id: string
  label: 'injection' | 'legitimate'
  vector: string
  locale: 'en' | 'es'
  expected_severity_min: Severity
  text: string
}

interface GoldenSet {
  version: string
  created: string
  author: string
  notes: string
  samples: GoldenSample[]
}

interface PerSampleResult {
  id: string
  label: 'injection' | 'legitimate'
  vector: string
  locale: 'en' | 'es'
  // canon canonical regex-only outcome (Capa 2)
  regex_severity: Severity
  regex_hits: number
  regex_hit_ids: string[]
  // canon canonical pipeline outcome (5 capas · classifier called if regex MEDIUM)
  pipeline_severity?: Severity
  pipeline_shadow_blocks?: string[]
  pipeline_classifier_called?: boolean
  // canon canonical force-classifier outcome (Capa 3 isolated)
  forced_classifier_call?: boolean
  forced_classifier_severity?: Severity
  forced_classifier_output?: ClassifierOutput
  forced_classifier_error?: string
  forced_classifier_latency_ms?: number
  // canon canonical bench Lakera
  bench_lakera_output?: ClassifierOutput | null
  bench_lakera_error?: string
  // canon canonical TOLERANT-parser variant of Haiku (canon canonical research-
  // only · measures Haiku quality IF parser tolerated markdown fence · canon
  // canonical canon canonical-canon · input for §151 decision)
  tolerant_classifier_severity?: Severity
  tolerant_classifier_output?: ClassifierOutput | null
  tolerant_classifier_error?: string
}

// ============================================================
// Helpers · classification + scoring canon canonical
// ============================================================

const SEVERITY_RANK: Record<Severity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
  UNKNOWN: 0,
}

/** Canon canonical · classify "flagged" vs "clean" · severity ≥ MEDIUM is flagged. */
function isFlagged(severity: Severity): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK.MEDIUM
}

interface ConfusionMatrix {
  TP: number // injection correctly flagged
  FP: number // legitimate incorrectly flagged
  TN: number // legitimate correctly cleared
  FN: number // injection incorrectly cleared
  N_injections: number
  N_legitimate: number
}

function emptyConfusion(): ConfusionMatrix {
  return { TP: 0, FP: 0, TN: 0, FN: 0, N_injections: 0, N_legitimate: 0 }
}

function score(
  results: PerSampleResult[],
  getter: (r: PerSampleResult) => Severity | undefined,
): ConfusionMatrix {
  const m = emptyConfusion()
  for (const r of results) {
    const sev = getter(r)
    if (!sev) continue
    const flagged = isFlagged(sev)
    if (r.label === 'injection') {
      m.N_injections += 1
      if (flagged) m.TP += 1
      else m.FN += 1
    } else {
      m.N_legitimate += 1
      if (flagged) m.FP += 1
      else m.TN += 1
    }
  }
  return m
}

function rates(m: ConfusionMatrix): {
  detection_rate: number
  false_positive_rate: number
  false_negative_rate: number
  precision: number
  recall: number
  f1: number
} {
  const recall = m.N_injections > 0 ? m.TP / m.N_injections : 0
  const fpr = m.N_legitimate > 0 ? m.FP / m.N_legitimate : 0
  const fnr = m.N_injections > 0 ? m.FN / m.N_injections : 0
  const precision = m.TP + m.FP > 0 ? m.TP / (m.TP + m.FP) : 0
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
  return {
    detection_rate: recall,
    false_positive_rate: fpr,
    false_negative_rate: fnr,
    precision,
    recall,
    f1,
  }
}

// ============================================================
// Per-locale breakdown canon canonical
// ============================================================

function scoreByLocale(
  results: PerSampleResult[],
  getter: (r: PerSampleResult) => Severity | undefined,
): Record<'en' | 'es', ConfusionMatrix> {
  const en = score(
    results.filter((r) => r.locale === 'en'),
    getter,
  )
  const es = score(
    results.filter((r) => r.locale === 'es'),
    getter,
  )
  return { en, es }
}

// ============================================================
// Runners canon canonical
// ============================================================

async function runRegexOnly(sample: GoldenSample): Promise<{
  severity: Severity
  hits: number
  hit_ids: string[]
}> {
  const result = await runIngressFilter(
    {
      raw_text: sample.text,
      source: 'tally_form',
      ingress_route: `measure-${sample.id}`,
      locale_hint: sample.locale,
    },
    {
      skip_classifier: true,
    },
  )
  const regexGate = result.gates.find((g) => g.gate === 'regex_deny')
  const hits = (regexGate?.metadata?.hits_count as number) ?? 0
  const hitIds = (regexGate?.metadata?.hit_ids as string[]) ?? []
  return {
    severity: regexGate?.severity ?? 'LOW',
    hits,
    hit_ids: hitIds,
  }
}

async function runPipelineHaiku(
  sample: GoldenSample,
  client: ClassifierClient,
): Promise<{
  severity: Severity
  shadow_blocks: string[]
  classifier_called: boolean
}> {
  const result: IngressFilterDecision = await runIngressFilter(
    {
      raw_text: sample.text,
      source: 'tally_form',
      ingress_route: `measure-${sample.id}`,
      locale_hint: sample.locale,
    },
    {
      classifier_client: client,
    },
  )
  const classifierGateRan = !!result.gates.find((g) => g.gate === 'classifier')
  return {
    severity: result.severity,
    shadow_blocks: result.shadow_blocks,
    classifier_called: classifierGateRan,
  }
}

async function runForcedClassifier(
  sample: GoldenSample,
  client: ClassifierClient,
): Promise<{
  severity: Severity
  output?: ClassifierOutput
  error?: string
  latency_ms: number
  raw_decision: GateDecision
}> {
  const t0 = Date.now()
  const decision = await classifierGate(sample.text, {
    client,
    session_id: 'measure-session-' + sample.id,
    timeout_ms: 10000,
  })
  const latency = Date.now() - t0

  if (decision.metadata?.gate_error) {
    const rawPreview = (decision.metadata.raw_preview as string | undefined) ?? null
    return {
      severity: 'UNKNOWN',
      error: decision.reason
        ? `${decision.reason}${rawPreview ? ` | raw_preview: ${rawPreview}` : ''}`
        : undefined,
      latency_ms: latency,
      raw_decision: decision,
    }
  }

  const out: ClassifierOutput = {
    classification_type: decision.metadata!.classification_type as ClassifierOutput['classification_type'],
    confidence: decision.metadata!.confidence as number,
    should_escalate_hitl: decision.metadata!.should_escalate_hitl as boolean,
    escalation_reason: decision.metadata!.escalation_reason as ClassifierOutput['escalation_reason'],
  }
  return {
    severity: classificationToSeverity(out),
    output: out,
    latency_ms: latency,
    raw_decision: decision,
  }
}

async function runTolerantClassifier(
  sample: GoldenSample,
  client: ClassifierClient,
): Promise<{
  severity: Severity
  output?: ClassifierOutput
  error?: string
}> {
  try {
    const sessionId = 'tolerant-' + sample.id
    const userTurn = `<untrusted-data session="${sessionId}">
${sample.text}
</untrusted-data>`
    const response = await client.createMessage({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: CLASSIFIER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userTurn }],
    })
    const raw = response.content[0]?.text ?? ''
    const parsed = parseClassifierResponseTolerant(raw)
    if (!parsed) {
      return {
        severity: 'UNKNOWN',
        error: 'tolerant_parser_failed | raw_preview: ' + raw.slice(0, 200),
      }
    }
    // canon canonical · mismo mapping severity canon
    const cls = parsed.classification_type
    let severity: Severity = 'LOW'
    if (cls === 'safe') severity = 'LOW'
    else if (cls === 'role_spoof' || cls === 'instruction_override' || cls === 'obfuscated') severity = 'MEDIUM'
    else severity = 'HIGH'
    return { severity, output: parsed }
  } catch (e) {
    return {
      severity: 'UNKNOWN',
      error: e instanceof Error ? e.message : 'unknown',
    }
  }
}

async function runLakeraBench(
  sample: GoldenSample,
  client: ClassifierClient,
): Promise<{ output: ClassifierOutput | null; error?: string }> {
  try {
    // canon canonical · Lakera stub returns parseable-as-malformed JSON
    // (canon canonical canon canonical · classifier parser returns null ·
    // operator sees pend_key)
    const decision = await classifierGate(sample.text, {
      client,
      session_id: 'bench-lakera-' + sample.id,
      timeout_ms: 5000,
    })
    if (decision.metadata?.gate_error) {
      return { output: null, error: decision.reason ?? 'unknown_gate_error' }
    }
    // canon canonical mismo unpack canon
    const out: ClassifierOutput = {
      classification_type: decision.metadata!.classification_type as ClassifierOutput['classification_type'],
      confidence: decision.metadata!.confidence as number,
      should_escalate_hitl: decision.metadata!.should_escalate_hitl as boolean,
      escalation_reason: decision.metadata!.escalation_reason as ClassifierOutput['escalation_reason'],
    }
    return { output: out }
  } catch (e) {
    return {
      output: null,
      error: e instanceof Error ? e.message : 'unknown',
    }
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  const startedAt = new Date().toISOString()

  // Canon canonical · load golden set
  const goldenSetPath = path.join(__dirname, 'ingress-filter-golden-set.json')
  if (!fs.existsSync(goldenSetPath)) {
    console.error(`[measure-fp] golden set canon canonical missing · ${goldenSetPath}`)
    process.exit(2)
  }
  const golden: GoldenSet = JSON.parse(fs.readFileSync(goldenSetPath, 'utf-8'))
  const samples = SAMPLE_LIMIT ? golden.samples.slice(0, SAMPLE_LIMIT) : golden.samples

  console.error(`[measure-fp] canon canonical · loaded ${samples.length} samples`)
  console.error(`[measure-fp] started_at=${startedAt}`)

  const haveCloudKey = !!process.env.CLAUDE_API_KEY
  const haveLakeraKey = !!process.env.LAKERA_API_KEY

  console.error(`[measure-fp] CLAUDE_API_KEY=${haveCloudKey ? 'set' : 'MISSING'}`)
  console.error(`[measure-fp] LAKERA_API_KEY=${haveLakeraKey ? 'set' : 'pend §151'}`)
  console.error(
    `[measure-fp] mode · skip_haiku=${SKIP_HAIKU} · bench=${BENCH_MODE} · limit=${SAMPLE_LIMIT ?? 'all'}`,
  )

  let haikuClient: ClassifierClient | undefined
  if (!SKIP_HAIKU && haveCloudKey) {
    try {
      haikuClient = new HaikuFetchClient()
    } catch (e) {
      console.error(`[measure-fp] Haiku client init failed · ${(e as Error).message}`)
    }
  }

  const lakeraClient: ClassifierClient | undefined = BENCH_MODE
    ? new LakeraStubClient()
    : undefined

  // ============================================================
  // Per-sample loop canon canonical
  // ============================================================

  const results: PerSampleResult[] = []

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]!
    if (i % 10 === 0) {
      console.error(`[measure-fp] progress · ${i}/${samples.length}`)
    }

    // 1 · regex-only
    const regex = await runRegexOnly(sample)

    const r: PerSampleResult = {
      id: sample.id,
      label: sample.label,
      vector: sample.vector,
      locale: sample.locale,
      regex_severity: regex.severity,
      regex_hits: regex.hits,
      regex_hit_ids: regex.hit_ids,
    }

    // 2 · pipeline canon canonical (regex + classifier-if-MEDIUM)
    if (haikuClient) {
      const pipe = await runPipelineHaiku(sample, haikuClient)
      r.pipeline_severity = pipe.severity
      r.pipeline_shadow_blocks = pipe.shadow_blocks
      r.pipeline_classifier_called = pipe.classifier_called
    }

    // 3 · force-classifier canon canonical (canon canonical Haiku isolated)
    if (haikuClient) {
      const forced = await runForcedClassifier(sample, haikuClient)
      r.forced_classifier_call = true
      r.forced_classifier_severity = forced.severity
      r.forced_classifier_output = forced.output
      r.forced_classifier_error = forced.error
      r.forced_classifier_latency_ms = forced.latency_ms
    }

    // 3b · TOLERANT canon canonical Haiku variant · canon canonical research-only
    if (haikuClient) {
      const tol = await runTolerantClassifier(sample, haikuClient)
      r.tolerant_classifier_severity = tol.severity
      r.tolerant_classifier_output = tol.output
      r.tolerant_classifier_error = tol.error
    }

    // 4 · bench Lakera (canonical-pend-key stub) canon canonical
    if (lakeraClient) {
      const lk = await runLakeraBench(sample, lakeraClient)
      r.bench_lakera_output = lk.output
      r.bench_lakera_error = lk.error
    }

    results.push(r)
  }

  // ============================================================
  // Scoring canon canonical
  // ============================================================

  const matrix_regex = score(results, (r) => r.regex_severity)
  const matrix_pipeline = score(results, (r) => r.pipeline_severity)
  const matrix_forced = score(results, (r) => r.forced_classifier_severity)
  const matrix_tolerant = score(results, (r) => r.tolerant_classifier_severity)

  const rates_regex = rates(matrix_regex)
  const rates_pipeline = rates(matrix_pipeline)
  const rates_forced = rates(matrix_forced)
  const rates_tolerant = rates(matrix_tolerant)

  const locale_regex = scoreByLocale(results, (r) => r.regex_severity)
  const locale_pipeline = scoreByLocale(results, (r) => r.pipeline_severity)
  const locale_forced = scoreByLocale(results, (r) => r.forced_classifier_severity)
  const locale_tolerant = scoreByLocale(results, (r) => r.tolerant_classifier_severity)

  // canon canonical · misclassified samples for review canon canonical
  const misclassified = {
    regex_FP: results.filter(
      (r) => r.label === 'legitimate' && isFlagged(r.regex_severity),
    ),
    regex_FN: results.filter(
      (r) => r.label === 'injection' && !isFlagged(r.regex_severity),
    ),
    pipeline_FP: results.filter(
      (r) =>
        r.label === 'legitimate' &&
        r.pipeline_severity &&
        isFlagged(r.pipeline_severity),
    ),
    pipeline_FN: results.filter(
      (r) =>
        r.label === 'injection' &&
        r.pipeline_severity &&
        !isFlagged(r.pipeline_severity),
    ),
    forced_FP: results.filter(
      (r) =>
        r.label === 'legitimate' &&
        r.forced_classifier_severity &&
        isFlagged(r.forced_classifier_severity),
    ),
    forced_FN: results.filter(
      (r) =>
        r.label === 'injection' &&
        r.forced_classifier_severity &&
        !isFlagged(r.forced_classifier_severity),
    ),
  }

  // canon canonical · classifier latency stats
  const classifier_latencies = results
    .map((r) => r.forced_classifier_latency_ms)
    .filter((x): x is number => typeof x === 'number')
    .sort((a, b) => a - b)
  const latency_p50 =
    classifier_latencies.length > 0
      ? classifier_latencies[Math.floor(classifier_latencies.length * 0.5)]!
      : null
  const latency_p99 =
    classifier_latencies.length > 0
      ? classifier_latencies[Math.floor(classifier_latencies.length * 0.99)]!
      : null

  // canon canonical · bench Lakera summary
  const lakera_summary = BENCH_MODE
    ? {
        ran: true,
        has_key: haveLakeraKey,
        canonical_status: haveLakeraKey ? 'real_calls_pending_impl' : 'pend_key_§151',
        samples_attempted: results.filter((r) => r.bench_lakera_output !== undefined || r.bench_lakera_error !== undefined).length,
        all_returned_pend_key: results.every(
          (r) =>
            r.bench_lakera_output === null ||
            r.bench_lakera_error?.includes('malformed'),
        ),
      }
    : null

  const finishedAt = new Date().toISOString()

  const summary = {
    started_at: startedAt,
    finished_at: finishedAt,
    golden_set_version: golden.version,
    samples_count: samples.length,
    n_injections: results.filter((r) => r.label === 'injection').length,
    n_legitimate: results.filter((r) => r.label === 'legitimate').length,
    mode: {
      skip_haiku: SKIP_HAIKU,
      bench: BENCH_MODE,
      claude_api_key_present: haveCloudKey,
      lakera_api_key_present: haveLakeraKey,
    },
    confusion_matrix: {
      regex_only: matrix_regex,
      pipeline_haiku: matrix_pipeline,
      forced_classifier_haiku_STRICT: matrix_forced,
      forced_classifier_haiku_TOLERANT: matrix_tolerant,
    },
    rates: {
      regex_only: rates_regex,
      pipeline_haiku: rates_pipeline,
      forced_classifier_haiku_STRICT: rates_forced,
      forced_classifier_haiku_TOLERANT: rates_tolerant,
    },
    by_locale: {
      regex_only: locale_regex,
      pipeline_haiku: locale_pipeline,
      forced_classifier_haiku_STRICT: locale_forced,
      forced_classifier_haiku_TOLERANT: locale_tolerant,
    },
    classifier_latency_ms: {
      p50: latency_p50,
      p99: latency_p99,
      count: classifier_latencies.length,
    },
    misclassified_counts: {
      regex_FP: misclassified.regex_FP.length,
      regex_FN: misclassified.regex_FN.length,
      pipeline_FP: misclassified.pipeline_FP.length,
      pipeline_FN: misclassified.pipeline_FN.length,
      forced_FP: misclassified.forced_FP.length,
      forced_FN: misclassified.forced_FN.length,
    },
    misclassified_samples: {
      regex_FP_ids: misclassified.regex_FP.map((r) => r.id),
      regex_FN_ids: misclassified.regex_FN.map((r) => r.id),
      pipeline_FP_ids: misclassified.pipeline_FP.map((r) => r.id),
      pipeline_FN_ids: misclassified.pipeline_FN.map((r) => r.id),
      forced_FP_ids: misclassified.forced_FP.map((r) => r.id),
      forced_FN_ids: misclassified.forced_FN.map((r) => r.id),
    },
    bench_lakera: lakera_summary,
  }

  // canon canonical · output structure: summary on stdout · per-sample log goes to file
  console.log(JSON.stringify(summary, null, 2))

  // canon canonical · also write per-sample results to a sidecar log file
  const sidecarPath = path.join(
    __dirname,
    '..',
    'evidence',
    'measure-fp-per-sample.json',
  )
  try {
    fs.mkdirSync(path.dirname(sidecarPath), { recursive: true })
    fs.writeFileSync(sidecarPath, JSON.stringify({ samples: results }, null, 2))
    console.error(`[measure-fp] per-sample sidecar canon canonical · ${sidecarPath}`)
  } catch (e) {
    console.error(`[measure-fp] sidecar write failed · ${(e as Error).message}`)
  }

  console.error('[measure-fp] done canon canonical')
  process.exit(0)
}

main().catch((e) => {
  console.error(`[measure-fp] exception canon canonical · ${e instanceof Error ? e.message : String(e)}`)
  process.exit(3)
})

// canon canonical · ensure imports used (silence ts noUnused warnings)
void parseClassifierResponse

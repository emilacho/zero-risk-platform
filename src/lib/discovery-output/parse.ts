/**
 * Canon canonical · parse Discovery output from agent text response.
 *
 * The Auto-Discovery agent emits a JSON object that matches `DiscoveryOutput`
 * (SPEC §interface). The agent's response is free-form prose · the JSON
 * MAY appear ·
 *
 *   (a) inside a ```json ... ``` fence  ← preferred (CC#4 prompt asks for this)
 *   (b) inside any ``` ... ``` fence with JSON-shaped body
 *   (c) as a standalone JSON object at end of response
 *
 * Strategy · scan candidates · attempt parse · validate shape · return tagged
 * Decision. NEVER throws. Cero implicit accept.
 *
 * §148 honest · this is a SHAPE GATE not a content validator. If the agent
 * emits a competitor named "TBD" we accept it (the agent is responsible
 * for content quality · this lib is responsible for safe transport).
 */
import type { DiscoveryOutput, DiscoveryParseResult } from './types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Canon canonical · primary entry point · tries multiple extraction strategies
 * and returns the first that yields a valid DiscoveryOutput. Returns 'absent'
 * if no JSON found · 'malformed' if JSON found but shape rejected.
 */
export function parseDiscoveryOutput(
  agentResponseText: string,
  options: { readonly expected_client_id?: string } = {},
): DiscoveryParseResult {
  if (typeof agentResponseText !== 'string' || agentResponseText.trim().length === 0) {
    return { kind: 'absent', reason: 'agent_response_empty' }
  }

  const candidates = extractJsonCandidates(agentResponseText)
  if (candidates.length === 0) {
    return { kind: 'absent', reason: 'no_json_in_response' }
  }

  let lastMalformed: DiscoveryParseResult | null = null
  for (const raw of candidates) {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (e) {
      lastMalformed = {
        kind: 'malformed',
        reason: `json_parse_error · ${e instanceof Error ? e.message : 'unknown'}`,
        raw: raw.slice(0, 200),
      }
      continue
    }
    const validated = validateDiscoveryShape(parsed, options.expected_client_id)
    if (validated.kind === 'ok') return validated
    lastMalformed = validated
  }
  return lastMalformed ?? { kind: 'absent', reason: 'no_valid_json_candidate' }
}

/**
 * Canon canonical · extract JSON candidate strings · prefer fenced blocks ·
 * fallback to brace-balanced trailing object. Returns a list ordered by
 * preference.
 */
export function extractJsonCandidates(text: string): string[] {
  const out: string[] = []
  // 1 · fenced ```json blocks
  const fenced = text.matchAll(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/gi)
  for (const m of fenced) {
    const body = (m[1] ?? '').trim()
    if (body.startsWith('{') && body.endsWith('}')) out.push(body)
  }
  // 2 · standalone trailing object (brace-balanced · last `{` to last `}`)
  if (out.length === 0) {
    const obj = lastBalancedObject(text)
    if (obj) out.push(obj)
  }
  return out
}

/**
 * Canon canonical · find the last balanced `{...}` object in a string.
 * Scans from rightmost `}` backward to a matching `{`. Returns null if
 * no balanced object found.
 */
function lastBalancedObject(text: string): string | null {
  const lastClose = text.lastIndexOf('}')
  if (lastClose < 0) return null
  let depth = 0
  for (let i = lastClose; i >= 0; i--) {
    const ch = text[i]
    if (ch === '}') depth++
    else if (ch === '{') {
      depth--
      if (depth === 0) return text.slice(i, lastClose + 1)
    }
  }
  return null
}

/**
 * Canon canonical · validate the parsed JSON against the DiscoveryOutput
 * shape. Strict on required fields · permissive on optionals.
 */
export function validateDiscoveryShape(
  raw: unknown,
  expectedClientId?: string,
): DiscoveryParseResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { kind: 'malformed', reason: 'root_not_object' }
  }
  const obj = raw as Record<string, unknown>

  // client_id · required · UUID · matches expected (if provided)
  const cid = obj.client_id
  if (typeof cid !== 'string' || !UUID_RE.test(cid)) {
    return { kind: 'malformed', reason: 'client_id_invalid_uuid' }
  }
  if (expectedClientId && cid !== expectedClientId) {
    return {
      kind: 'malformed',
      reason: `client_id_mismatch · got=${cid} expected=${expectedClientId}`,
    }
  }

  // own_handles · required (object · may be empty)
  const ownHandles = obj.own_handles
  if (
    ownHandles === null ||
    typeof ownHandles !== 'object' ||
    Array.isArray(ownHandles)
  ) {
    return { kind: 'malformed', reason: 'own_handles_not_object' }
  }

  // competitors · required (array · may be empty · canonical strings)
  const comps = obj.competitors
  if (!Array.isArray(comps)) {
    return { kind: 'malformed', reason: 'competitors_not_array' }
  }
  const competitors: Array<DiscoveryOutput['competitors'][number]> = []
  for (let i = 0; i < comps.length; i++) {
    const c = comps[i]
    if (c === null || typeof c !== 'object' || Array.isArray(c)) {
      return { kind: 'malformed', reason: `competitor_${i}_not_object` }
    }
    const cObj = c as Record<string, unknown>
    const name = cObj.name
    if (typeof name !== 'string' || name.trim().length === 0) {
      return { kind: 'malformed', reason: `competitor_${i}_name_missing` }
    }
    competitors.push({
      name: name.trim(),
      ...(typeof cObj.website === 'string' ? { website: cObj.website } : {}),
      ...(cObj.handles && typeof cObj.handles === 'object' && !Array.isArray(cObj.handles)
        ? { handles: sanitizeHandles(cObj.handles as Record<string, unknown>) }
        : {}),
      ...(typeof cObj.why === 'string' ? { why: cObj.why } : {}),
      ...(isCompetitorType(cObj.competitor_type) ? { competitor_type: cObj.competitor_type } : {}),
      ...(typeof cObj.positioning === 'string' ? { positioning: cObj.positioning } : {}),
    })
  }

  // icp · optional · object or array of objects
  let icp: DiscoveryOutput['icp']
  if (obj.icp !== undefined && obj.icp !== null) {
    if (Array.isArray(obj.icp)) {
      const segments: NonNullable<DiscoveryOutput['icp']> extends readonly (infer T)[] ? T[] : never = [] as never
      for (let i = 0; i < obj.icp.length; i++) {
        const s = obj.icp[i]
        if (s === null || typeof s !== 'object' || Array.isArray(s)) {
          return { kind: 'malformed', reason: `icp_${i}_not_object` }
        }
        const validated = validateIcpSegment(s as Record<string, unknown>, `icp_${i}`)
        if (typeof validated === 'string') return { kind: 'malformed', reason: validated }
        ;(segments as unknown[]).push(validated)
      }
      icp = segments as unknown as DiscoveryOutput['icp']
    } else if (typeof obj.icp === 'object') {
      const validated = validateIcpSegment(obj.icp as Record<string, unknown>, 'icp')
      if (typeof validated === 'string') return { kind: 'malformed', reason: validated }
      icp = validated as unknown as DiscoveryOutput['icp']
    } else {
      return { kind: 'malformed', reason: 'icp_invalid_type' }
    }
  }

  // competitive_landscape_summary · optional · string
  let summary: string | undefined
  if (obj.competitive_landscape_summary !== undefined) {
    if (typeof obj.competitive_landscape_summary !== 'string') {
      return { kind: 'malformed', reason: 'competitive_landscape_summary_not_string' }
    }
    summary = obj.competitive_landscape_summary
  }

  const value: DiscoveryOutput = {
    client_id: cid,
    own_handles: sanitizeHandles(ownHandles as Record<string, unknown>),
    competitors,
    ...(icp !== undefined ? { icp } : {}),
    ...(summary !== undefined ? { competitive_landscape_summary: summary } : {}),
  }
  return { kind: 'ok', value }
}

function isCompetitorType(v: unknown): v is 'direct' | 'indirect' | 'aspirational' | 'alternative' {
  return v === 'direct' || v === 'indirect' || v === 'aspirational' || v === 'alternative'
}

function sanitizeHandles(raw: Record<string, unknown>): {
  instagram?: string
  facebook?: string
  tiktok?: string
  linkedin?: string
  youtube?: string
} {
  const out: Record<string, string> = {}
  for (const k of ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube'] as const) {
    const v = raw[k]
    if (typeof v === 'string' && v.trim().length > 0) out[k] = v.trim()
  }
  return out
}

function validateIcpSegment(
  raw: Record<string, unknown>,
  label: string,
): string | Record<string, unknown> {
  const segment = raw.audience_segment
  if (typeof segment !== 'string' || segment.trim().length === 0) {
    return `${label}_audience_segment_missing`
  }
  const out: Record<string, unknown> = { audience_segment: segment.trim() }
  if (typeof raw.segment_priority === 'number' && Number.isFinite(raw.segment_priority)) {
    out.segment_priority = Math.max(1, Math.floor(raw.segment_priority))
  }
  for (const f of ['company_size', 'geography', 'buying_process', 'budget_range', 'content_preferences'] as const) {
    if (typeof raw[f] === 'string') out[f] = (raw[f] as string).trim()
  }
  for (const f of [
    'job_titles', 'industries', 'goals', 'pain_points', 'jobs_to_be_done',
    'objections', 'decision_criteria', 'preferred_channels',
  ] as const) {
    const v = raw[f]
    if (Array.isArray(v)) {
      const arr = v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((s) => s.trim())
      if (arr.length > 0) out[f] = arr
    }
  }
  return out
}

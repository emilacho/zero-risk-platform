/**
 * Editor en Jefe — Dual Reviewer Middleware
 *
 * Invoca Editor en Jefe + Brand Strategist en PARALELO (Promise.all) para
 * cada output de agentes en el EDITOR_WHITELIST. Aplica revision loop y
 * escalación a HITL cuando los reviewers no aprueban.
 *
 * Llamado desde /api/agents/run DESPUÉS de que el agente productor ejecuta.
 * Usa x-skip-editor-middleware:1 en calls internas para evitar recursión.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import {
  EditorVerdict,
  EditorVerdictStatus,
  EditorVerdictSeverity,
  EditorRoutingConfig,
  AggregateVerdict,
  PRIMARY_REVIEWER,
  SECOND_REVIEWER,
  aggregateVerdicts,
} from './editor-routing'

// ============================================================
// Public interface
// ============================================================

export interface MiddlewareParams {
  agentSlug: string
  content: string
  task: string
  context: Record<string, unknown>
  config: EditorRoutingConfig
  supabase: SupabaseClient
  baseUrl: string
}

export interface MiddlewareResult {
  editor_review: {
    verdict: string
    severity: string
    reviewers?: AggregateVerdict['reviewers']
    disagreement?: boolean
    disagreement_reason?: string
    revisions?: number
    reason?: string
  }
  escalated_to_hitl?: boolean
  hitl_item_id?: string | null
  response?: string
  output?: string
  result?: string
}

// ============================================================
// Entry point
// ============================================================

export async function runDualReviewMiddleware(params: MiddlewareParams): Promise<MiddlewareResult> {
  const { agentSlug, content, task, context, config, supabase, baseUrl } = params

  // Initial dual review
  const aggregateVerdict = await invokeBothReviewersParallel({ content, agentSlug, task, context, config, baseUrl })

  // Approved — no escalation needed
  if (aggregateVerdict.status === 'approved') {
    return {
      editor_review: {
        verdict: 'approved',
        severity: aggregateVerdict.severity,
        reviewers: aggregateVerdict.reviewers,
        disagreement: aggregateVerdict.disagreement,
        revisions: 0,
      },
    }
  }

  // Direct escalation: escalate_on threshold OR status=escalated
  if (
    aggregateVerdict.status === 'escalated' ||
    config.escalate_on.includes(aggregateVerdict.severity)
  ) {
    const hitlId = await escalateToHITL({
      agentSlug,
      finalContent: content,
      aggregateVerdict,
      revisionsAttempted: 0,
      originalTask: task,
      originalContext: context,
      supabase,
    })

    return {
      editor_review: {
        verdict: 'escalated',
        severity: aggregateVerdict.severity,
        reviewers: aggregateVerdict.reviewers,
        disagreement: aggregateVerdict.disagreement,
        disagreement_reason: aggregateVerdict.disagreement_reason,
        revisions: 0,
      },
      escalated_to_hitl: true,
      hitl_item_id: hitlId,
    }
  }

  // Revision loop (status=revision_needed, severity below escalate_on threshold)
  let currentContent = content
  let currentVerdict = aggregateVerdict
  let revision = 0

  while (revision < config.max_revisions && currentVerdict.status === 'revision_needed') {
    revision++

    const revisionResponse = await reinvokeAgentWithFeedback({
      agentSlug,
      originalTask: task,
      originalContext: context,
      previousOutput: currentContent,
      editorFeedback: currentVerdict.feedback,
      editorIssues: currentVerdict.issues,
      revisionNumber: revision,
      baseUrl,
    })

    if (!revisionResponse?.success) break

    currentContent = revisionResponse.response || currentContent
    currentVerdict = await invokeBothReviewersParallel({
      content: currentContent,
      agentSlug,
      task,
      context,
      config,
      baseUrl,
    })

    if (currentVerdict.status === 'approved') {
      return {
        editor_review: {
          verdict: 'approved',
          severity: currentVerdict.severity,
          reviewers: currentVerdict.reviewers,
          disagreement: currentVerdict.disagreement,
          revisions: revision,
        },
        response: currentContent,
        output: currentContent,
        result: currentContent,
      }
    }
  }

  // Max revisions exhausted — escalate
  const hitlId = await escalateToHITL({
    agentSlug,
    finalContent: currentContent,
    aggregateVerdict: currentVerdict,
    revisionsAttempted: revision,
    originalTask: task,
    originalContext: context,
    supabase,
  })

  return {
    editor_review: {
      verdict: 'escalated',
      severity: currentVerdict.severity,
      reviewers: currentVerdict.reviewers,
      disagreement: currentVerdict.disagreement,
      revisions: revision,
      reason: 'Max revisions reached without approval',
    },
    escalated_to_hitl: true,
    hitl_item_id: hitlId,
    response: currentContent,
    output: currentContent,
    result: currentContent,
  }
}

// ============================================================
// Internal helpers
// ============================================================

async function invokeBothReviewersParallel(params: {
  content: string
  agentSlug: string
  task: string
  context: Record<string, unknown>
  config: EditorRoutingConfig
  baseUrl: string
}): Promise<AggregateVerdict> {
  const [editorVerdict, brandVerdict] = await Promise.all([
    invokeReviewer({
      reviewerSlug: PRIMARY_REVIEWER,
      reviewerType: 'editor',
      ...params,
    }),
    invokeReviewer({
      reviewerSlug: SECOND_REVIEWER,
      reviewerType: 'brand_deep',
      ...params,
    }),
  ])

  return aggregateVerdicts(editorVerdict, brandVerdict)
}

async function invokeReviewer(params: {
  reviewerSlug: string
  reviewerType: 'editor' | 'brand_deep'
  content: string
  agentSlug: string
  task: string
  context: Record<string, unknown>
  config: EditorRoutingConfig
  baseUrl: string
}): Promise<EditorVerdict> {
  const fallback: EditorVerdict = {
    status: 'escalated',
    issues: [`${params.reviewerSlug} unavailable`],
    feedback: '',
    severity: 'low',
  }

  try {
    const reviewerTask =
      params.reviewerType === 'editor'
        ? buildEditorTaskWithAllLens(params)
        : buildBrandStrategistTaskBrandDeep(params)

    const apiKey = process.env.INTERNAL_API_KEY || process.env.CLAUDE_API_KEY || ''
    const response = await fetch(`${params.baseUrl}/api/agents/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'x-skip-editor-middleware': '1',
      },
      body: JSON.stringify({
        agent: params.reviewerSlug,
        task: reviewerTask,
        context: {
          client_id: params.context?.client_id,
          rag_query: params.reviewerType === 'editor'
            ? `brand guidelines quality standards ${params.task.substring(0, 100)}`
            : `brand book voice positioning ${params.task.substring(0, 100)}`,
          rag_match_count: 5,
          originating_agent: params.agentSlug,
          lens_emphasis: params.config.lens_emphasis,
          review_role: params.reviewerType,
        },
        caller: 'review-middleware',
      }),
    })

    if (!response.ok) return fallback
    const data = await response.json()
    if (!data.success || !data.response) return fallback
    return parseEditorVerdict(data.response)
  } catch {
    return fallback
  }
}

async function reinvokeAgentWithFeedback(params: {
  agentSlug: string
  originalTask: string
  originalContext: Record<string, unknown>
  previousOutput: string
  editorFeedback: string
  editorIssues: string[]
  revisionNumber: number
  baseUrl: string
}): Promise<{ success: boolean; response: string }> {
  const enhancedTask = `[REVISION ${params.revisionNumber}]

ORIGINAL TASK:
${params.originalTask}

YOUR PREVIOUS OUTPUT:
${params.previousOutput.substring(0, 2000)}

EDITOR EN JEFE FEEDBACK:
${params.editorFeedback}

ISSUES TO ADDRESS:
${params.editorIssues.map(i => '- ' + i).join('\n')}

INSTRUCTION: Re-generate addressing the editor's feedback. Keep what worked, fix what was flagged.`

  try {
    const apiKey = process.env.INTERNAL_API_KEY || process.env.CLAUDE_API_KEY || ''
    const response = await fetch(`${params.baseUrl}/api/agents/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'x-skip-editor-middleware': '1',
      },
      body: JSON.stringify({
        agent: params.agentSlug,
        task: enhancedTask,
        context: params.originalContext,
        caller: 'editor-revision',
      }),
    })

    const data = await response.json()
    return { success: response.ok && data.success, response: data.response || '' }
  } catch {
    return { success: false, response: '' }
  }
}

async function escalateToHITL(params: {
  agentSlug: string
  finalContent: string
  aggregateVerdict: AggregateVerdict
  revisionsAttempted: number
  originalTask: string
  originalContext: Record<string, unknown>
  supabase: SupabaseClient
}): Promise<string | null> {
  try {
    const { data, error } = await params.supabase
      .from('hitl_pending_approvals')
      .insert({
        agent_slug: params.agentSlug,
        preview: params.finalContent.substring(0, 500),
        full_content: params.finalContent,
        editor_verdict: params.aggregateVerdict,
        revisions_attempted: params.revisionsAttempted,
        original_task: params.originalTask.substring(0, 1000),
        client_id: params.originalContext?.client_id || null,
        approval_type: 'editor_escalation',
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single()

    if (error) {
      console.error('[escalateToHITL] Insert failed:', error.message)
      return null
    }
    return data?.id || null
  } catch (err) {
    console.error('[escalateToHITL] Unexpected error:', err)
    return null
  }
}

function parseEditorVerdict(rawResponse: string): EditorVerdict {
  const fallback: EditorVerdict = {
    status: 'escalated',
    issues: ['Could not parse reviewer response'],
    feedback: rawResponse.substring(0, 500),
    severity: 'low',
  }

  try {
    const jsonMatch = rawResponse.match(/\{[\s\S]*?"status"[\s\S]*?\}/)
    if (!jsonMatch) return fallback

    const parsed = JSON.parse(jsonMatch[0]) as Partial<EditorVerdict>
    const validStatuses: EditorVerdictStatus[] = ['approved', 'revision_needed', 'escalated']
    const validSeverities: EditorVerdictSeverity[] = ['low', 'medium', 'high', 'critical']

    if (!parsed.status || !validStatuses.includes(parsed.status)) return fallback

    return {
      status: parsed.status,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      feedback: parsed.feedback || '',
      severity: parsed.severity && validSeverities.includes(parsed.severity) ? parsed.severity : 'low',
    }
  } catch {
    return fallback
  }
}

function buildEditorTaskWithAllLens(params: {
  content: string
  agentSlug: string
  task: string
  context: Record<string, unknown>
  config: EditorRoutingConfig
}): string {
  return `## Content to Review (from ${params.agentSlug}):

${params.content.substring(0, 8000)}

## Original Task Context:
${params.task.substring(0, 500)}

## Lens Emphasis (per agent config):
${params.config.lens_emphasis || 'general'}

## Review Criteria (ALL-LENS — apply ALL):

1. **Brand Voice Alignment**: Match client brand book tone, vocabulary, personality
2. **Factual Accuracy**: Verify claims, statistics, quotes, comparisons
3. **Strategic Alignment**: Match the originating campaign brief / objective
4. **Forbidden Words / Required Terminology**: Per client brand book
5. **Schwartz Lens** (especially for ads/sales copy): awareness ladder, objection gaps, value prop defensibility
6. **Compliance**: Regulated industry checks — industrial safety clients use INEN/NFPA standards
7. **Audience Appropriateness**: Tone match to ICP, awareness stage, channel norms
8. **Generic Language Killer**: Strip corporate buzzwords, overused phrases, unmotivated claims
9. **Format Compliance**: Character limits per channel (RSA 30/90, Meta varied, LinkedIn 70)

## Return ONLY valid JSON (no markdown fences, no prose):
{"status": "approved" | "revision_needed" | "escalated", "issues": ["..."], "feedback": "...", "severity": "low" | "medium" | "high" | "critical"}`
}

function buildBrandStrategistTaskBrandDeep(params: {
  content: string
  agentSlug: string
  task: string
  context: Record<string, unknown>
  config: EditorRoutingConfig
}): string {
  return `## Content to Review (from ${params.agentSlug}):

${params.content.substring(0, 8000)}

## Original Task Context:
${params.task.substring(0, 500)}

## Your Role: BRAND-DEEP REVIEW (Brand Strategist Reviewer)

You are Reviewer 2 in a dual-reviewer system. The Editor en Jefe does general quality review.
Your role is SPECIALIZED BRAND REVIEW — deeper than the Editor's brand voice lens.

Focus exclusively on:

1. **Brand Voice Cadence**: Sentence rhythm, paragraph length, emotional energy — matches client's specific tone?
2. **Brand Personality Consistency**: Reflects the brand personality (e.g. technical authority vs. conversational warmth)?
3. **Brand Evolution Implications**: Consistent with future positioning direction? Does it lock the client into something unwanted?
4. **Cultural Sensitivity**: Regional implications (Ecuador, vertical norms) requiring adjustment?
5. **Trademark / IP Guardian**: Correct use of own trademarks, respects third-party marks?
6. **Strategic Consistency**: Advances long-term brand strategy, not just immediate campaign objective?
7. **Competitive Positioning**: Differentiates clearly from competitors in its category?

## Return ONLY valid JSON (no markdown fences):
{"status": "approved" | "revision_needed" | "escalated", "issues": ["specific brand-deep issues"], "feedback": "actionable brand-strategic guidance", "severity": "low" | "medium" | "high" | "critical"}`
}

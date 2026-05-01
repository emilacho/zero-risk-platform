/**
 * Schema-coverage tests · Wave 14 · CC#1.
 *
 * One happy + one violation per schema in src/lib/contracts/inputs/. Verifies
 * each schema is well-formed, compiles cleanly under Ajv 2020, accepts a
 * representative payload, and rejects a malformed one. Catches schema typos
 * (bad enum, wrong type, missing $schema) before they reach production.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { validateObject, _resetValidatorCache } from '../src/lib/input-validator'

type Case = {
  schema: string
  happy: unknown
  bad: unknown
}

const CASES: Case[] = [
  {
    schema: 'agents-run-sdk',
    happy: { agent: 'jefe-marketing', task: 'create campaign' },
    bad: { agent: 'jefe-marketing' }, // missing task
  },
  {
    schema: 'agents-run',
    happy: { agent: 'qa-empleado', task: 'review' },
    bad: { task: 'no agent identifier' }, // none of the agent/agent_id/...
  },
  {
    schema: 'agents-pipeline',
    happy: { task: 'launch a campaign' },
    bad: {}, // missing task
  },
  {
    schema: 'agents-pipeline-callback',
    happy: { pipeline_id: 'p-123', status: 'completed' },
    bad: { status: 'completed' }, // missing pipeline_id
  },
  {
    schema: 'agent-outcomes-write',
    happy: { agent_slug: 'content-creator', tokens_used: 100 },
    bad: { tokens_used: 100 }, // missing agent_slug
  },
  {
    schema: 'hitl-approvals-create',
    happy: { approval_type: 'campaign_launch', priority: 'high' },
    bad: { priority: 'extreme' }, // not in enum
  },
  {
    schema: 'clients-create',
    happy: { client_id: 'acme', client_name: 'Acme Corp', status: 'active' },
    bad: { status: 'unknown' }, // not in enum
  },
  {
    schema: 'mc-sync',
    happy: { action: 'sync_pipeline', pipeline_id: 'p-1' },
    bad: { queue_depth: 'not-a-number' },
  },
  {
    schema: 'webhook-generic',
    happy: { type: 'lead', data: { name: 'A' } },
    bad: { type: 12345 }, // wrong type
  },
  {
    schema: 'error-events-create',
    happy: { fingerprint: 'abc', severity: 'P1', title: 'oops' },
    bad: { severity: 'critical' }, // not in enum
  },
  {
    schema: 'evidence-validate',
    happy: { request_id: 'r-1', phase: 'campaign-brief', phase_output: {} },
    bad: { request_id: 999 }, // wrong type
  },
  {
    schema: 'agent-routing-log',
    happy: {
      request_id: 'r-1',
      original_request: 'help me',
      classification_type: 'depth-first',
    },
    bad: {
      request_id: 'r-1',
      original_request: 'help',
      classification_type: 'unknown',
    },
  },
  {
    schema: 'agents-classify-lead',
    happy: { name: 'Juan', source: 'instagram' },
    bad: { name: 'Juan' }, // missing source
  },
  {
    schema: 'agents-generate-content',
    happy: { product: 'EPP', audience: 'PYMES' },
    bad: { product: 'EPP' }, // missing audience
  },
  {
    schema: 'campaigns-block-launch',
    happy: { campaign_id: 'c-1', match_score: 0.4, reason: 'mismatch' },
    bad: { match_score: 1.5 }, // > maximum
  },
  {
    schema: 'competitors-snapshot',
    happy: { client_id: 'acme', competitor: 'rival', ad_count: 12 },
    bad: { ad_count: -5 }, // < minimum
  },
  {
    schema: 'stub-row',
    happy: { client_id: 'acme', task_id: 't-1' },
    bad: { client_id: 12345 }, // wrong type
  },
]

describe('contract schemas · happy + violation per schema', () => {
  beforeEach(() => _resetValidatorCache())

  for (const c of CASES) {
    it(`${c.schema} · accepts valid payload`, () => {
      const v = validateObject(c.happy, c.schema)
      expect(v.ok).toBe(true)
    })

    it(`${c.schema} · rejects invalid payload with 400`, async () => {
      const v = validateObject(c.bad, c.schema)
      expect(v.ok).toBe(false)
      if (!v.ok) {
        expect(v.response.status).toBe(400)
        const body = await v.response.json()
        expect(body.code).toBe('E-INPUT-INVALID')
      }
    })
  }
})

/**
 * onboarding-e2e-v2-no-temp-fallback.test.ts · Sprint 12 · Náufrago MC fix
 *
 * Regression guard · ensures the canonical Onboarding E2E v2 workflow JSON
 * files do NOT contain the legacy `('temp-' + Date.now())` fallback that
 * orphaned downstream entities (Notion workspace + brain ingests) when a
 * webhook arrived without client_id resolved.
 *
 * Validate Deal Data node ALREADY pre-generates a UUID v4 if client_id is
 * missing (line 23 of the canonical JSON · LOTE-C fix). The TEMP fallback
 * in downstream nodes was dead code AND a footgun · removed in this PR.
 *
 * Live n8n PUT is gated by §144 · this regression test prevents the dead
 * code from sneaking back into canonical via future backports.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CANONICAL_FILES = [
  'n8n-workflows/tier-1/onboarding-e2e-v2.json',
  'n8n-workflows/tier-1/onboarding-e2e-v2-sub-workflow-refs.json',
  'n8n-workflows/proposed-sesion27b/06-client-success/004-onboarding-e2e-v2.json',
  'n8n-workflows/proposed-sesion27b/06-client-success/004-onboarding-e2e-v2-sub-workflow-refs.json',
]

describe('Onboarding E2E v2 · NO temp-Date.now fallback', () => {
  for (const relPath of CANONICAL_FILES) {
    it(`${relPath} · drops TEMP id fallback`, () => {
      const abs = resolve(process.cwd(), relPath)
      const content = readFileSync(abs, 'utf-8')
      // The footgun pattern · `('temp-' + Date.now())` MUST be absent
      expect(content).not.toContain("('temp-' + Date.now())")
      expect(content).not.toContain("'temp-' + Date.now()")
      // Validate Deal Data UUID v4 pre-generation MUST remain (canonical safety net)
      expect(content).toContain("'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'")
    })
  }
})

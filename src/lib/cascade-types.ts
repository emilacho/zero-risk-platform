/**
 * Cascade orchestrator types · Gap 3 fix (2026-05-16).
 *
 * The 6-agent onboarding cascade currently runs as a standalone script:
 * each agent receives ONLY the IG scrape, in parallel. This loses
 * coherence (creative-director invents palette · web-designer ignores
 * brand voice · etc.). The Gap 3 refactor chains agent N+1 to receive
 * the PARSED output of agent N as additional context.
 *
 * Sequence (per dispatch):
 *   1. brand-strategist          ← scrape + cliente brief
 *   2. market-research-analyst   ← scrape + brand
 *   3. creative-director         ← scrape + brand + research + cliente.{logo_url,brand_colors,brand_fonts}
 *   4. web-designer              ← scrape + brand + research + creative
 *   5. marketing-content-creator ← scrape + brand + research + creative + web
 *   6. editor-en-jefe            ← scrape + ALL above (final QA · Camino III auto-fires inside /api/agents/run)
 *
 * (onboarding-specialist is handled separately by the Onboarding E2E v2
 * workflow PRE-cascade · the cascade picks up post-persist.)
 */

export interface CascadeBrandAssets {
  logo_url: string | null
  brand_colors: unknown[] | null
  brand_fonts: string[] | null
}

export interface CascadeRunRequest {
  client_id: string
  client_slug: string
  client_name: string
  /** scrape blob to feed every agent · IG raw or onboarding-specialist output */
  scrape_summary: string
  /** cliente-uploaded assets · creative-director MUST respect (Gap 1) */
  brand_assets: CascadeBrandAssets
  caller?: string
  /**
   * Optional deep customer-research branch (2026-05-16 · resolved deferred
   * slug `customer_research_agent` → canonical `customer-research`). When
   * true, `customer-research` runs AFTER `market_research_analyst` and its
   * parsed output is appended to `cascadeContext.deep_research` · downstream
   * agents (creative-director onwards) can see it.
   *
   * Default false · skips the agent invocation entirely (cost-neutral for
   * cascades that don't need ICP/JTBD depth).
   */
  deep_customer_research?: boolean
}

export type CascadeAgentSlug =
  | "brand-strategist"
  // CC#2 Path D fix · DB-canonical underscored (was 'market-research-analyst' ·
  // unresolvable in `agents` table + `managed_agents_registry`)
  | "market_research_analyst"
  | "market-research-analyst" // dashed alias for legacy callers · same agent
  | "customer-research"        // 2026-05-16 deferred-resolve · optional deep ICP branch
  | "creative-director"
  | "web-designer"
  | "content-creator"
  | "spell-check-corrector"
  | "editor-en-jefe"

export interface CascadeAgentRun {
  slug: CascadeAgentSlug
  session_id: string | null
  cost_usd: number
  duration_ms: number
  model: string | null
  /** parsed JSON output if the agent returned valid JSON · null otherwise */
  parsed: Record<string, unknown> | null
  /** raw response text · always captured for audit trail */
  raw_response: string
  status: "completed" | "failed"
  error?: string
}

export interface CascadeRunResult {
  ok: boolean
  client_id: string
  client_slug: string
  agents: CascadeAgentRun[]
  total_cost_usd: number
  storage_paths: {
    cascade_summary: string
    agent_outputs: Record<string, string>
  }
  brand_assets_used: CascadeBrandAssets
  cascade_started_at: string
  cascade_completed_at: string
}

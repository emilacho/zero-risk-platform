/**
 * Sequential cascade orchestrator · Gap 3 (2026-05-16).
 *
 * Calls /api/agents/run for each cascade agent in sequence, feeding the
 * PARSED output of agent N as additional context for agent N+1.
 *
 * Each step's request body shape:
 *   {
 *     agent: <slug>,
 *     task: "<task instruction with embedded JSON context blocks>",
 *     client_id: <uuid>,
 *     caller: "cascade-runner",
 *     context: {
 *       scrape_summary: <string>,
 *       brand_assets: <CascadeBrandAssets>,   // creative-director onwards
 *       cascade_context: { brand: {...}, research: {...}, creative: {...}, ... }
 *     }
 *   }
 *
 * The route's multi-path resolver picks up `client_id` at top level
 * (Fix 8b/8c symmetry). Camino III triple-review fires automatically
 * inside /api/agents/run for whitelisted agents · we do not re-invoke it.
 *
 * Returns a CascadeRunResult that mirrors the cascade-summary.json shape
 * the Náufrago v1 ship was built from, so downstream UI assembly works
 * unchanged.
 */

import type {
  CascadeAgentRun,
  CascadeAgentSlug,
  CascadeBrandAssets,
  CascadeRunRequest,
  CascadeRunResult,
} from "./cascade-types"

/**
 * Sequence order matters · the prompts for agent N reference parsed
 * outputs from agents 1..N-1.
 */
const SEQUENCE: CascadeAgentSlug[] = [
  "brand-strategist",
  "market-research-analyst",
  "creative-director",
  "web-designer",
  "content-creator",
  "editor-en-jefe",
]

/**
 * Per-agent task prompts. Each takes the cascade context built so far
 * (brand, research, creative, web, content) and produces a JSON output.
 */
function buildTask(
  slug: CascadeAgentSlug,
  req: CascadeRunRequest,
  cascadeContext: Record<string, Record<string, unknown> | null>,
): string {
  const cliente = `Cliente: ${req.client_name} (slug=${req.client_slug}, id=${req.client_id})`
  const scrapeLine = `Instagram/web scrape summary:\n${req.scrape_summary}`
  const brandAssetsLine = brandAssetsToText(req.brand_assets)

  switch (slug) {
    case "brand-strategist":
      return [
        cliente,
        scrapeLine,
        `Brand assets uploaded by cliente (respect verbatim · do NOT invent):\n${brandAssetsLine}`,
        "Task: build the brand book. Return strict JSON with keys: positioning_statement, brand_voice, values (array), tagline_options (array), target_audience_summary, do_say (array), dont_say (array). No prose outside the JSON.",
      ].join("\n\n")
    case "market-research-analyst":
      return [
        cliente,
        scrapeLine,
        contextBlock("brand", cascadeContext.brand),
        "Task: surface 2-4 priority personas. Return strict JSON with key `personas` (array of {name, age_range, demographics, pain_points, decision_criteria, preferred_channels, trigger_to_order}). No prose outside the JSON.",
      ].join("\n\n")
    case "creative-director":
      return [
        cliente,
        scrapeLine,
        `Brand assets uploaded by cliente (use these · do NOT generate a different palette):\n${brandAssetsLine}`,
        contextBlock("brand", cascadeContext.brand),
        contextBlock("research", cascadeContext.research),
        "Task: visual direction. Return strict JSON with keys: palette_top5 (array of {hex, name}), imagery_style, mood, hero_image_prompt, visual_direction_summary. If the cliente uploaded brand_colors, palette_top5 MUST start with those exact hex codes. No prose outside the JSON.",
      ].join("\n\n")
    case "web-designer":
      return [
        cliente,
        contextBlock("brand", cascadeContext.brand),
        contextBlock("research", cascadeContext.research),
        contextBlock("creative", cascadeContext.creative),
        "Task: section architecture. Return strict JSON with keys: sections (array of {name, purpose, primary_cta, content_blocks}), navigation (array), primary_cta_global, performance_priorities (array). Reference the client-sites-toolkit skill component catalog when naming components. No prose outside the JSON.",
      ].join("\n\n")
    case "content-creator":
      return [
        cliente,
        contextBlock("brand", cascadeContext.brand),
        contextBlock("research", cascadeContext.research),
        contextBlock("creative", cascadeContext.creative),
        contextBlock("web", cascadeContext.web),
        "Task: write all UI strings. Return strict JSON with keys: hero {headline, subheadline, cta_text}, menu {section_title, items (array)}, about {title, body}, contact {title, whatsapp_cta, hours_label}, footer. No prose outside the JSON.",
      ].join("\n\n")
    case "editor-en-jefe":
      return [
        cliente,
        contextBlock("brand", cascadeContext.brand),
        contextBlock("research", cascadeContext.research),
        contextBlock("creative", cascadeContext.creative),
        contextBlock("web", cascadeContext.web),
        contextBlock("content", cascadeContext.content),
        "Task: final QA across ALL agent outputs. Return strict JSON with keys: verdict (approved|revision_needed|escalated), severity (low|medium|high|critical), strengths (array), concerns (array), recommended_fixes (array). No prose outside the JSON.",
      ].join("\n\n")
  }
}

function contextBlock(
  label: string,
  data: Record<string, unknown> | null,
): string {
  if (!data) return `[no ${label} context yet]`
  return `[${label} agent output]\n${JSON.stringify(data, null, 2)}`
}

function brandAssetsToText(assets: CascadeBrandAssets): string {
  const parts: string[] = []
  parts.push(`logo_url: ${assets.logo_url ?? "(none uploaded)"}`)
  parts.push(
    `brand_colors: ${
      assets.brand_colors && assets.brand_colors.length > 0
        ? JSON.stringify(assets.brand_colors)
        : "(none uploaded · feel free to propose)"
    }`,
  )
  parts.push(
    `brand_fonts: ${
      assets.brand_fonts && assets.brand_fonts.length > 0
        ? assets.brand_fonts.join(", ")
        : "(none uploaded · feel free to propose)"
    }`,
  )
  return parts.join("\n")
}

function parseAgentJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null
  // strip optional ```json fences
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : raw
  // find first '{' and last '}'
  const start = candidate.indexOf("{")
  const end = candidate.lastIndexOf("}")
  if (start < 0 || end < 0 || end < start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

export interface CascadeRunnerDeps {
  baseUrl: string
  internalApiKey: string
  /** override for tests · defaults to global fetch */
  fetchImpl?: typeof fetch
}

/**
 * Drive the 6-agent cascade end-to-end. Failures of an individual agent
 * are captured per-step (status="failed", error set) but the cascade
 * continues so downstream agents can still attempt their step with the
 * available context.
 */
export async function runCascade(
  request: CascadeRunRequest,
  deps: CascadeRunnerDeps,
): Promise<CascadeRunResult> {
  const cascadeStartedAt = new Date().toISOString()
  const cascadeContext: Record<string, Record<string, unknown> | null> = {
    brand: null,
    research: null,
    creative: null,
    web: null,
    content: null,
  }
  const agents: CascadeAgentRun[] = []
  const fetchImpl = deps.fetchImpl ?? fetch

  for (const slug of SEQUENCE) {
    const task = buildTask(slug, request, cascadeContext)
    const body = {
      agent: slug,
      task,
      client_id: request.client_id,
      caller: request.caller ?? "cascade-runner",
      context: {
        scrape_summary: request.scrape_summary,
        brand_assets: request.brand_assets,
        cascade_context: cascadeContext,
      },
    }

    const startedAt = Date.now()
    let run: CascadeAgentRun = {
      slug,
      session_id: null,
      cost_usd: 0,
      duration_ms: 0,
      model: null,
      parsed: null,
      raw_response: "",
      status: "failed",
    }

    try {
      const res = await fetchImpl(`${deps.baseUrl}/api/agents/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": deps.internalApiKey,
        },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as {
        success?: boolean
        response?: string
        cost_usd?: number
        model?: string
        session_id?: string | null
        error?: string
      }
      const duration_ms = Date.now() - startedAt
      if (!res.ok || data.success === false) {
        run = {
          ...run,
          duration_ms,
          status: "failed",
          error: data.error ?? `HTTP ${res.status}`,
        }
      } else {
        const raw = data.response ?? ""
        const parsed = parseAgentJson(raw)
        run = {
          slug,
          session_id: data.session_id ?? null,
          cost_usd: data.cost_usd ?? 0,
          duration_ms,
          model: data.model ?? null,
          parsed,
          raw_response: raw,
          status: "completed",
        }
        // Feed parsed output into the chain for the next agent
        if (parsed) {
          switch (slug) {
            case "brand-strategist":
              cascadeContext.brand = parsed
              break
            case "market-research-analyst":
              cascadeContext.research = parsed
              break
            case "creative-director":
              cascadeContext.creative = parsed
              break
            case "web-designer":
              cascadeContext.web = parsed
              break
            case "content-creator":
              cascadeContext.content = parsed
              break
            case "editor-en-jefe":
              // terminal · review verdict captured in agents[] only
              break
          }
        }
      }
    } catch (err) {
      run = {
        ...run,
        duration_ms: Date.now() - startedAt,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      }
    }

    agents.push(run)
  }

  const total_cost_usd = agents.reduce((sum, a) => sum + (a.cost_usd ?? 0), 0)
  const cascadeCompletedAt = new Date().toISOString()

  return {
    ok: agents.every((a) => a.status === "completed"),
    client_id: request.client_id,
    client_slug: request.client_slug,
    agents,
    total_cost_usd,
    storage_paths: {
      cascade_summary: `client-websites/${request.client_slug}/cascade-summary.json`,
      agent_outputs: Object.fromEntries(
        agents.map((a) => [
          a.slug,
          `client-websites/${request.client_slug}/agents-outputs/${a.slug}.json`,
        ]),
      ),
    },
    brand_assets_used: request.brand_assets,
    cascade_started_at: cascadeStartedAt,
    cascade_completed_at: cascadeCompletedAt,
  }
}

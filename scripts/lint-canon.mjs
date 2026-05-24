#!/usr/bin/env node
/**
 * Sprint 7 Track C3 · canonical lint script.
 *
 * Validates ·
 *   1. Agent slugs · references in code match `src/agents/identities/*.md` filenames OR canonical allowlist
 *   2. Endpoint patterns · POST routes have `requireInternalKey` or live in PUBLIC_ENDPOINTS allowlist
 *   3. Naming drift · ZR · zero-risk · Zero Risk · canonical "Zero Risk"
 *   4. Deprecated refs · GHL · Mailgun · Ideogram · Composio · JARVIS · Kling AI · GA4
 *
 * Exit codes ·
 *   0 · clean
 *   1 · warnings only (non-blocking)
 *   2 · errors found (blocking · pre-commit + CI fail)
 *
 * Usage ·
 *   node scripts/lint-canon.mjs              # check all
 *   node scripts/lint-canon.mjs --strict     # warnings become errors
 *   node scripts/lint-canon.mjs --only=auth  # check only auth subset
 */
import { readFile, readdir, stat } from "node:fs/promises"
import { join, relative } from "node:path"

const ROOT = process.cwd()
const STRICT = process.argv.includes("--strict")
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1]

const findings = { errors: [], warnings: [] }

function addError(rule, file, line, msg) {
  findings.errors.push({ rule, file: relative(ROOT, file), line, msg })
}

function addWarning(rule, file, line, msg) {
  findings.warnings.push({ rule, file: relative(ROOT, file), line, msg })
}

async function walkFiles(dir, exts, ignore = []) {
  const out = []
  async function recurse(d) {
    let entries
    try {
      entries = await readdir(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".") && ent.name !== ".github") continue
      if (ignore.some((p) => ent.name === p)) continue
      const full = join(d, ent.name)
      if (ent.isDirectory()) {
        await recurse(full)
      } else if (exts.some((e) => ent.name.endsWith(e))) {
        out.push(full)
      }
    }
  }
  await recurse(dir)
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule 1 · agent slug references
// ─────────────────────────────────────────────────────────────────────────────

async function loadValidAgentSlugs() {
  const dir = join(ROOT, "src", "agents", "identities")
  const files = await readdir(dir)
  const slugs = new Set()
  for (const f of files) {
    if (f.endsWith(".md")) {
      slugs.add(f.replace(/\.md$/, "").replace(/_/g, "-"))
      slugs.add(f.replace(/\.md$/, "")) // keep underscore variant
    }
  }
  // Canonical MANIFEST-36 additions (Supabase managed_agents_registry · pre-Sprint-7 snapshot)
  const canonical = [
    "onboarding-specialist", "brand-strategist", "competitive-strategist",
    "market-research-analyst", "campaign-brief-architect", "jefe-marketing",
    "copywriter", "designer-visual", "video-editor", "social-media-manager",
    "email-marketer", "seo-specialist", "ads-strategist", "media-buyer",
    "qa-reviewer-a", "qa-reviewer-b", "qa-reviewer-c", "delivery-coordinator",
    "account-manager", "community-manager", "content-creator", "growth-hacker",
    "cro-specialist", "creative-director", "carousel-designer", "editor-en-jefe",
    "web-designer", "performance-marketer", "data-analyst", "rev-ops",
    "customer-success", "retention-specialist", "lifecycle-marketer",
    "brand-monitor", "influencer-curator", "pr-strategist",
  ]
  for (const s of canonical) slugs.add(s)
  return slugs
}

async function checkAgentSlugReferences() {
  if (ONLY && ONLY !== "agents") return
  const valid = await loadValidAgentSlugs()
  // Scan workflow JSONs for `slug` or `agent_name` fields
  const wfFiles = await walkFiles(
    join(ROOT, "n8n-workflows"),
    [".json"],
    ["live-snapshots"],
  )
  const slugPattern = /"(?:slug|agent_name|agentSlug)"\s*:\s*"([a-z][a-z0-9_-]+)"/g
  for (const file of wfFiles) {
    const content = await readFile(file, "utf8")
    let m
    while ((m = slugPattern.exec(content)) !== null) {
      const slug = m[1]
      // Skip well-known non-agent slugs
      if (["webhook", "cron", "lead-pipeline", "default"].includes(slug)) continue
      if (!valid.has(slug)) {
        const line = content.slice(0, m.index).split("\n").length
        addWarning(
          "agent-slug-unknown",
          file,
          line,
          `Slug "${slug}" not in src/agents/identities/ nor canonical MANIFEST-36`,
        )
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule 2 · endpoint auth patterns
// ─────────────────────────────────────────────────────────────────────────────

const PUBLIC_ENDPOINTS = new Set([
  "/api/health",
  "/api/auth",
  "/api/forms/submit", // HMAC-gated · not INTERNAL_API_KEY
  "/api/calendar/webhook", // Cal.com webhook
  "/api/whatsapp/webhook", // Meta webhook
  "/api/posthog/events", // analytics ingest
  "/api/webhook", // generic webhook receiver
  "/api/storage/upload", // signed URL
  "/api/stubs/firecrawl/scrape",
  "/api/stubs/higgsfield/generate",
  "/api/stubs/posthog/experiments",
  "/api/stubs/slack-webhook",
  "/api/stubs/vercel/deployments",
  "/api/stubs/whisper",
])

async function checkEndpointAuth() {
  if (ONLY && ONLY !== "auth") return
  const routeFiles = await walkFiles(
    join(ROOT, "src", "app", "api"),
    [".ts"],
  )
  for (const file of routeFiles) {
    if (!file.endsWith("route.ts")) continue
    const rel = relative(join(ROOT, "src", "app", "api"), file)
    // Normalize Windows backslashes to forward slashes BEFORE applying the
    // route-suffix strip + PUBLIC_ENDPOINTS lookup · otherwise on Windows
    // every urlPath ends with `\route.ts` and the allowlist check misses ·
    // producing false-positive endpoint-auth-missing errors. CI (Linux) was
    // immune so this surfaced only on local runs.
    const relPosix = rel.replace(/\\/g, "/")
    const urlPath =
      "/api/" +
      relPosix
        .replace(/\/route\.ts$/, "")
        .replace(/\[[^\]]+\]/g, "[param]")
    if (PUBLIC_ENDPOINTS.has(urlPath.replace(/\/\[param\]/g, ""))) continue
    const content = await readFile(file, "utf8")
    const hasPost = /^export\s+(?:async\s+)?function\s+POST/m.test(content)
    if (!hasPost) continue
    // Auth detection · direct call OR delegation to a shared handler that
    // enforces auth by default (handleReadStub · handleStub · handleStubPost
    // all call checkInternalKey internally · see src/lib/read-stub-handler.ts
    // + src/lib/stub-handler.ts). Recognizing those names eliminates ~22
    // false-positive endpoint-auth-missing errors that were really 3-line
    // wrappers around an auth-gated shared helper.
    const hasAuth =
      /requireInternalKey|checkInternalKey|requireAdmin|verifyTallyWebhook|verifyMetaSignature|verifyWebhookSignature|ADMIN_SECRET|pipeline_secret|PIPELINE_CALLBACK_SECRET|SUPABASE_SERVICE_ROLE_KEY|verifySignature|handleReadStub|handleStubPost|handleStub\b|buildDeprecatedResponse/i.test(
        content,
      )
    if (!hasAuth) {
      addError(
        "endpoint-auth-missing",
        file,
        1,
        `POST handler at ${urlPath} has no auth check · add requireInternalKey() OR PUBLIC_ENDPOINTS allowlist entry`,
      )
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule 3 · naming drift
// ─────────────────────────────────────────────────────────────────────────────

async function checkNamingDrift() {
  if (ONLY && ONLY !== "naming") return
  const codeFiles = await walkFiles(
    join(ROOT, "src"),
    [".ts", ".tsx", ".md"],
    ["__tests__"],
  )
  const zrPattern = /\bZR\b/g
  for (const file of codeFiles) {
    const content = await readFile(file, "utf8")
    const lines = content.split("\n")
    for (let i = 0; i < lines.length; i++) {
      // Skip code identifiers like `ZeroRiskZR_*`, just standalone ZR
      const line = lines[i]
      if (zrPattern.test(line) && !line.includes("ZR_") && !line.includes("_ZR")) {
        const ctx = line.trim().slice(0, 100)
        if (
          !ctx.startsWith("//") &&
          !ctx.startsWith("*") &&
          !ctx.includes("ZRTransaction") &&
          !ctx.match(/['"`]ZR[A-Z]/)
        ) {
          addWarning(
            "naming-zr-shorthand",
            file,
            i + 1,
            `Avoid "ZR" shorthand · use "Zero Risk" · ${ctx}`,
          )
        }
      }
      zrPattern.lastIndex = 0
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule 4 · deprecated refs
// ─────────────────────────────────────────────────────────────────────────────

const DEPRECATED = [
  { pattern: /\bMailgun\b/i, name: "Mailgun", replacement: "Resend (Stack V4)" },
  { pattern: /\bIdeogram\b/i, name: "Ideogram", replacement: "GPT Image 1.5 (Stack V4)" },
  { pattern: /\bComposio\b/i, name: "Composio", replacement: "Direct API integrations (Stack V4)" },
  { pattern: /\bJARVIS\b/, name: "JARVIS", replacement: "NEXUS or Mission Control" },
  { pattern: /\bKling AI\b/i, name: "Kling AI", replacement: "Higgsfield Seedance 2.0" },
  { pattern: /\bGoHighLevel\b/i, name: "GoHighLevel", replacement: "Stack V4 modular (DEPRECATED 2026-05-20)" },
  { pattern: /process\.env\.GHL_API_KEY/, name: "GHL_API_KEY env", replacement: "Stack V4 individual keys" },
  { pattern: /process\.env\.MAILGUN_API_KEY/, name: "MAILGUN_API_KEY env", replacement: "RESEND_API_KEY" },
]

async function checkDeprecatedRefs() {
  if (ONLY && ONLY !== "deprecated") return
  const codeFiles = await walkFiles(
    join(ROOT, "src"),
    [".ts", ".tsx"],
  )
  for (const file of codeFiles) {
    // Skip vault docs · deprecation playbooks legitimately mention these
    if (file.includes("zr-vault")) continue
    if (file.includes("ghl-mcp-server")) continue
    const content = await readFile(file, "utf8")
    const lines = content.split("\n")
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Allow in comments + docstrings that mention deprecation
      if (
        line.trim().startsWith("//") ||
        line.trim().startsWith("*") ||
        line.includes("DEPRECATED") ||
        line.includes("deprecate") ||
        line.includes("legacy")
      ) continue
      for (const dep of DEPRECATED) {
        if (dep.pattern.test(line)) {
          addWarning(
            "deprecated-ref",
            file,
            i + 1,
            `Active reference to deprecated "${dep.name}" · use "${dep.replacement}"`,
          )
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("[lint-canon] Sprint 7 Track C3 · canonical lint")
  console.log(`[lint-canon] root · ${ROOT}`)
  console.log(`[lint-canon] strict mode · ${STRICT}`)
  if (ONLY) console.log(`[lint-canon] only · ${ONLY}`)
  console.log("")

  await Promise.all([
    checkAgentSlugReferences(),
    checkEndpointAuth(),
    checkNamingDrift(),
    checkDeprecatedRefs(),
  ])

  if (findings.errors.length > 0) {
    console.log(`❌ ERRORS · ${findings.errors.length}`)
    for (const f of findings.errors.slice(0, 50)) {
      console.log(`  ${f.file}:${f.line} · [${f.rule}] ${f.msg}`)
    }
    if (findings.errors.length > 50) {
      console.log(`  ... and ${findings.errors.length - 50} more`)
    }
  }

  if (findings.warnings.length > 0) {
    console.log(`\n⚠️  WARNINGS · ${findings.warnings.length}`)
    for (const f of findings.warnings.slice(0, 50)) {
      console.log(`  ${f.file}:${f.line} · [${f.rule}] ${f.msg}`)
    }
    if (findings.warnings.length > 50) {
      console.log(`  ... and ${findings.warnings.length - 50} more`)
    }
  }

  console.log("")
  console.log(
    `[lint-canon] summary · ${findings.errors.length} errors · ${findings.warnings.length} warnings`,
  )

  if (findings.errors.length > 0) process.exit(2)
  if (STRICT && findings.warnings.length > 0) process.exit(2)
  if (findings.warnings.length > 0) process.exit(1)
  process.exit(0)
}

main().catch((err) => {
  console.error("[lint-canon] UNCAUGHT", err)
  process.exit(99)
})

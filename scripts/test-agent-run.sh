#!/usr/bin/env bash
# =============================================================
# Zero Risk V3 — Test E2E: Agent Run via /api/agents/run
#
# Verifica que un agente se carga correctamente desde
# managed_agents_registry (identity_md) y responde via Claude API.
#
# Prerequisitos:
#   1. npm run dev  (en otra terminal)
#   2. .env.local con CLAUDE_API_KEY + Supabase credentials
#
# Uso:
#   ./scripts/test-agent-run.sh                    # test default (content-creator, Haiku)
#   ./scripts/test-agent-run.sh jefe-marketing     # test específico
#   ./scripts/test-agent-run.sh ALL                # test TODOS los agentes (cuidado: costo)
# =============================================================

set -euo pipefail

BASE_URL="${ZERO_RISK_URL:-http://localhost:3000}"
AGENT="${1:-content-creator}"

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ── Test individual ────────────────────────────────────────────

test_agent() {
  local slug="$1"
  local task="${2:-Responde con una sola frase: ¿Cuál es tu rol principal y tu nombre? Sé breve.}"

  echo -e "${YELLOW}▶ Testing agent: ${slug}${NC}"

  local response
  response=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/api/agents/run" \
    -H "Content-Type: application/json" \
    -d "{
      \"agent\": \"${slug}\",
      \"task\": \"${task}\",
      \"caller\": \"test-script\"
    }")

  local http_code
  http_code=$(echo "$response" | tail -1)
  local body
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" = "200" ]; then
    local success
    success=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null || echo "")

    if [ "$success" = "True" ]; then
      local agent_name model tokens duration resp_preview
      agent_name=$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin).get('agent',''))" 2>/dev/null)
      model=$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin).get('model',''))" 2>/dev/null)
      tokens=$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tokens_used',0))" 2>/dev/null)
      duration=$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin).get('duration_ms',0))" 2>/dev/null)
      resp_preview=$(echo "$body" | python3 -c "import sys,json; r=json.load(sys.stdin).get('response',''); print(r[:150]+'...' if len(r)>150 else r)" 2>/dev/null)

      echo -e "${GREEN}  ✅ SUCCESS${NC} — ${agent_name} (${model})"
      echo -e "     Tokens: ${tokens} | Duration: ${duration}ms"
      echo -e "     Response: ${resp_preview}"
      echo ""
      return 0
    fi
  fi

  echo -e "${RED}  ❌ FAILED${NC} — HTTP ${http_code}"
  echo -e "     Body: $(echo "$body" | head -c 200)"
  echo ""
  return 1
}

# ── Modo ALL: test todos los agentes ──────────────────────────

if [ "$AGENT" = "ALL" ]; then
  echo "═══════════════════════════════════════════════════════"
  echo " Zero Risk V3 — E2E Test Suite (ALL agents)"
  echo " Base URL: ${BASE_URL}"
  echo "═══════════════════════════════════════════════════════"
  echo ""

  # These are the EXACT 33 slugs from managed_agents_registry
  ALL_AGENTS=(
    "account-manager"
    "brand-strategist"
    "campaign-brief-agent"
    "community-manager"
    "competitive-intelligence-agent"
    "content-creator"
    "creative-director"
    "cro-specialist"
    "customer-research"
    "editor-en-jefe"
    "email-marketer"
    "growth-hacker"
    "influencer-manager"
    "jefe-client-success"
    "jefe-marketing"
    "market-research"
    "media-buyer"
    "onboarding-specialist"
    "optimization-agent"
    "reporting-agent"
    "review-responder"
    "ruflo"
    "sales-enablement"
    "seo-backlink-strategist"
    "seo-content-strategist"
    "seo-geo-optimization"
    "seo-orchestrator"
    "seo-specialist"
    "seo-technical"
    "social-media-strategist"
    "tracking-specialist"
    "video-editor"
    "web-designer"
  )

  passed=0
  failed=0
  total=${#ALL_AGENTS[@]}

  for slug in "${ALL_AGENTS[@]}"; do
    if test_agent "$slug"; then
      ((passed++))
    else
      ((failed++))
    fi
  done

  echo "═══════════════════════════════════════════════════════"
  echo -e " Results: ${GREEN}${passed} passed${NC} / ${RED}${failed} failed${NC} / ${total} total"
  echo "═══════════════════════════════════════════════════════"

  exit $failed
fi

# ── Modo individual ───────────────────────────────────────────

echo "═══════════════════════════════════════════════════════"
echo " Zero Risk V3 — E2E Test: ${AGENT}"
echo " Base URL: ${BASE_URL}"
echo "═══════════════════════════════════════════════════════"
echo ""

test_agent "$AGENT"

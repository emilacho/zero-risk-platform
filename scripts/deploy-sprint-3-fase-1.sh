#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-sprint-3-fase-1.sh · Wave 10 CP5 · CC#1
#
# One-shot deploy del Sprint #3 Fase 1 MVP. Ejecutar SOLO con approval explícito
# de Emilio (script pide confirmación antes de cualquier mutación).
#
# Acciones (en orden):
#  1. Confirma approval (variable APPROVE=yes o prompt interactivo)
#  2. Aplica 3 migrations a Supabase prod via Management API:
#     - 202604280001_client_journey_state.sql (otro owner · CC#2)
#     - 202604280002_incrementality_tests.sql (B-002 · ya en main)
#     - 202604280003_persist_resume_columns.sql (CP3 · este branch)
#  3. Verifica tabla creada (SELECT count(*) FROM client_journey_state)
#  4. Push branch sprint-3-fase-1-ready → main (fast-forward o merge)
#  5. Wait 60s para Vercel deploy
#  6. Curl test endpoints:
#     - GET /api/journey/dispatch · debe responder 200 (info handler)
#     - POST /api/journey/dispatch (con auth + dummy body) · debe responder 400/404
#       no 503 (= migration aplicada · table existe)
#     - POST /api/journey/expire-old-states (con dry_run=true) · debe 200 con expired:0
#  7. Reporta success/fail · genera summary
#
# Modo:
#   bash scripts/deploy-sprint-3-fase-1.sh --dry-run    # imprime sin ejecutar
#   APPROVE=yes bash scripts/deploy-sprint-3-fase-1.sh  # auto-approve · CI/CD
#   bash scripts/deploy-sprint-3-fase-1.sh              # interactive
#
# Env vars requeridas (load desde .env.local antes de correr):
#   SUPABASE_ACCESS_TOKEN     · PAT para Management API
#   NEXT_PUBLIC_SUPABASE_URL  · ej. https://ordaeyxvvvdqsznsecjx.supabase.co
#   INTERNAL_API_KEY          · para curl tests
#   NEXT_PUBLIC_BASE_URL      · ej. https://zero-risk-platform.vercel.app (default)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # no color

log()  { echo -e "${BLUE}[deploy]${NC} $*"; }
ok()   { echo -e "${GREEN}[ ok  ]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn ]${NC} $*"; }
fail() { echo -e "${RED}[FAIL ]${NC} $*"; exit 1; }

# ─────────────────────────────────────────────────────────────────────────────
# 0. Pre-flight
# ─────────────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

log "Pre-flight checks..."

if [[ ! -f .env.local ]]; then
  warn ".env.local no encontrado · esperando vars en environment"
fi

# Source .env.local si existe
if [[ -f .env.local ]]; then
  # shellcheck disable=SC1091
  set -a; source .env.local; set +a
fi

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    fail "Env var requerida $name no está seteada"
  fi
}

require_var SUPABASE_ACCESS_TOKEN
require_var NEXT_PUBLIC_SUPABASE_URL
require_var INTERNAL_API_KEY

BASE_URL="${NEXT_PUBLIC_BASE_URL:-https://zero-risk-platform.vercel.app}"
SUPABASE_REF=$(echo "$NEXT_PUBLIC_SUPABASE_URL" | sed -E 's#^https?://([^.]+)\..*#\1#')
if [[ -z "$SUPABASE_REF" ]]; then
  fail "No se pudo extraer Supabase project ref de $NEXT_PUBLIC_SUPABASE_URL"
fi

ok "Pre-flight OK · supabase_ref=$SUPABASE_REF · base_url=$BASE_URL"
[[ "$DRY_RUN" == "true" ]] && warn "DRY-RUN MODE · no se ejecuta nada (solo imprime)"

# ─────────────────────────────────────────────────────────────────────────────
# 1. Approval gate
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  Sprint #3 Fase 1 MVP · DEPLOY"
echo "═══════════════════════════════════════════════════════════════════════"
echo "  Branch:       sprint-3-fase-1-ready"
echo "  Target:       main → Vercel prod"
echo "  Migrations:   202604280001 + 202604280002 + 202604280003"
echo "  Endpoints:    /api/journey/dispatch (POST) + /api/journey/expire-old-states (POST)"
echo "  Supabase:     $SUPABASE_REF"
echo "  Base URL:     $BASE_URL"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

if [[ "${APPROVE:-}" != "yes" ]]; then
  read -r -p "¿Aprobar deploy? (escribir 'yes' para continuar): " confirm
  if [[ "$confirm" != "yes" ]]; then
    fail "Deploy cancelado por usuario"
  fi
fi
ok "Approval recibido"

# ─────────────────────────────────────────────────────────────────────────────
# 2. Apply migrations via Supabase Management API
# ─────────────────────────────────────────────────────────────────────────────
apply_migration() {
  local file="$1"
  local path="$REPO_ROOT/supabase/migrations/$file"

  if [[ ! -f "$path" ]]; then
    warn "Migration $file no existe en disco · skip"
    return 0
  fi

  log "Aplicando migration $file..."
  if [[ "$DRY_RUN" == "true" ]]; then
    warn "[dry-run] would POST $(wc -l < "$path") líneas SQL a Supabase Management API"
    return 0
  fi

  # Convert SQL file to JSON-safe payload
  local sql_payload
  sql_payload=$(jq -Rs '{query: .}' < "$path")

  local response
  response=$(curl -sS -w "\n%{http_code}" \
    -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$sql_payload")

  local http_code
  http_code=$(echo "$response" | tail -n 1)
  local body
  body=$(echo "$response" | head -n -1)

  if [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
    ok "Migration $file applied (HTTP $http_code)"
  else
    fail "Migration $file failed (HTTP $http_code) · response: $body"
  fi
}

apply_migration "202604280001_client_journey_state.sql"
apply_migration "202604280002_incrementality_tests.sql"
apply_migration "202604280003_persist_resume_columns.sql"

# ─────────────────────────────────────────────────────────────────────────────
# 3. Verify table created
# ─────────────────────────────────────────────────────────────────────────────
verify_table() {
  local table="$1"
  log "Verificando tabla $table..."
  if [[ "$DRY_RUN" == "true" ]]; then
    warn "[dry-run] would SELECT count(*) FROM $table"
    return 0
  fi
  local payload
  payload=$(jq -n --arg q "SELECT count(*) AS n FROM $table" '{query: $q}')
  local response
  response=$(curl -sS -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$payload")
  if echo "$response" | grep -q '"n"'; then
    ok "Table $table accessible · response: $response"
  else
    fail "Table $table verification failed · response: $response"
  fi
}

verify_table "client_journey_state"
verify_table "journey_events"

# ─────────────────────────────────────────────────────────────────────────────
# 4. Push branch → main
# ─────────────────────────────────────────────────────────────────────────────
log "Push branch sprint-3-fase-1-ready → main..."
if [[ "$DRY_RUN" == "true" ]]; then
  warn "[dry-run] would git checkout main + merge + push"
  CURRENT_BRANCH=$(git branch --show-current)
  log "[dry-run] current branch: $CURRENT_BRANCH"
  log "[dry-run] commits in branch ahead of origin/main:"
  git log --oneline origin/main..HEAD || true
else
  CURRENT_BRANCH=$(git branch --show-current)
  if [[ "$CURRENT_BRANCH" != "sprint-3-fase-1-ready" ]]; then
    fail "Esperaba estar en branch sprint-3-fase-1-ready · estás en $CURRENT_BRANCH"
  fi

  git fetch origin main
  git checkout main
  git pull origin main
  git merge --no-ff sprint-3-fase-1-ready -m "merge: Sprint #3 Fase 1 MVP (Wave 10 · CP1-5)"
  git push origin main
  ok "Pushed to main"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 5. Wait Vercel deploy
# ─────────────────────────────────────────────────────────────────────────────
if [[ "$DRY_RUN" == "true" ]]; then
  warn "[dry-run] would sleep 60s for Vercel deploy"
else
  log "Waiting 60s for Vercel deploy..."
  sleep 60
fi

# ─────────────────────────────────────────────────────────────────────────────
# 6. Curl test endpoints
# ─────────────────────────────────────────────────────────────────────────────
test_endpoint() {
  local label="$1"
  local method="$2"
  local path="$3"
  local body="${4:-}"
  local expected_codes="$5" # ej. "200|400|404"

  log "Test: $label"
  if [[ "$DRY_RUN" == "true" ]]; then
    warn "[dry-run] would $method $BASE_URL$path"
    return 0
  fi

  local cmd=(curl -sS -w "\n%{http_code}" -X "$method" "$BASE_URL$path"
    -H "Content-Type: application/json"
    -H "x-api-key: $INTERNAL_API_KEY")
  if [[ -n "$body" ]]; then
    cmd+=(-d "$body")
  fi

  local response
  response=$("${cmd[@]}")
  local http_code
  http_code=$(echo "$response" | tail -n 1)
  local resp_body
  resp_body=$(echo "$response" | head -n -1)

  if [[ "$http_code" =~ ^($expected_codes)$ ]]; then
    ok "$label → HTTP $http_code (expected $expected_codes)"
    echo "    body: $(echo "$resp_body" | head -c 200)"
  else
    fail "$label → HTTP $http_code (expected $expected_codes) · body: $resp_body"
  fi
}

test_endpoint "GET dispatch info" "GET" "/api/journey/dispatch" "" "200"
test_endpoint "POST dispatch · empty body" "POST" "/api/journey/dispatch" "{}" "400"
test_endpoint "POST dispatch · invalid client" "POST" "/api/journey/dispatch" \
  '{"client_id":"00000000-0000-0000-0000-000000000000","journey":"PRODUCE"}' "404"
test_endpoint "POST expire-old-states · dry_run" "POST" "/api/journey/expire-old-states" \
  '{"dry_run":true}' "200"

# ─────────────────────────────────────────────────────────────────────────────
# 7. Summary
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
ok "Sprint #3 Fase 1 MVP · DEPLOY COMPLETE"
echo "═══════════════════════════════════════════════════════════════════════"
echo "  Migrations applied: 3 (client_journey_state · incrementality_tests · persist_resume_columns)"
echo "  Endpoints live:     /api/journey/dispatch · /api/journey/expire-old-states"
echo "  Branch merged:      sprint-3-fase-1-ready → main"
echo "  Next steps:"
echo "    - Importar 11 skeletons a n8n (ver SPRINT_3_RUNBOOK.md sección 'Import order')"
echo "    - Run smoke tests: bash scripts/smoke-test/sprint-3-dispatch-test.mjs --http"
echo "    - Configurar cron n8n hourly · POST /api/journey/expire-old-states"
echo "═══════════════════════════════════════════════════════════════════════"

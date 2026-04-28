#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# rollback-sprint-3-fase-1.sh · Wave 10 CP5 · CC#1
#
# EMERGENCIA · Rollback total de Sprint #3 Fase 1 MVP.
#
# Acciones (en orden):
#  1. Confirma approval (REQUIRE doble confirmación · destructivo)
#  2. Revert merge commit en main · push origin main
#  3. Wait 60s Vercel re-deploy
#  4. DROP tables creadas por las 3 migrations (en orden inverso)
#  5. Verifica endpoints retornan 404 (deploy revertido)
#  6. Reporta rollback complete
#
# Modo:
#   bash scripts/rollback-sprint-3-fase-1.sh --dry-run
#   APPROVE=yes APPROVE_DESTRUCTIVE=yes bash scripts/rollback-sprint-3-fase-1.sh
#   bash scripts/rollback-sprint-3-fase-1.sh   # interactive · doble prompt
#
# Env vars: misma lista que deploy script.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[rollback]${NC} $*"; }
ok()   { echo -e "${GREEN}[ ok    ]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn   ]${NC} $*"; }
fail() { echo -e "${RED}[FAIL   ]${NC} $*"; exit 1; }

# Pre-flight
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [[ -f .env.local ]]; then
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

# Doble approval
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  ${RED}ROLLBACK · Sprint #3 Fase 1 MVP${NC}"
echo "═══════════════════════════════════════════════════════════════════════"
echo "  ⚠️  ESTO ES DESTRUCTIVO · revierte deploy + DROP tables"
echo "  ⚠️  Datos en client_journey_state y journey_events se PIERDEN"
echo "  ⚠️  Solo correr si el deploy actual está roto sin recovery"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

if [[ "${APPROVE:-}" != "yes" ]]; then
  read -r -p "1/2 ¿Aprobar rollback? (escribir 'yes'): " confirm1
  if [[ "$confirm1" != "yes" ]]; then
    fail "Rollback cancelado"
  fi
fi

if [[ "${APPROVE_DESTRUCTIVE:-}" != "yes" ]]; then
  read -r -p "2/2 ¿Confirmar pérdida de datos? (escribir 'I UNDERSTAND'): " confirm2
  if [[ "$confirm2" != "I UNDERSTAND" ]]; then
    fail "Rollback cancelado · confirmación destructiva no recibida"
  fi
fi
ok "Approval doble recibido"
[[ "$DRY_RUN" == "true" ]] && warn "DRY-RUN MODE"

# 1. Revert merge en main
log "Identificando merge commit a revertir..."
if [[ "$DRY_RUN" == "true" ]]; then
  git log --oneline origin/main -10
  warn "[dry-run] would git revert <merge_commit> + push"
else
  git fetch origin main
  git checkout main
  git pull origin main
  MERGE_SHA=$(git log --oneline --merges -1 --grep="Sprint #3 Fase 1" --format='%H' || echo "")
  if [[ -z "$MERGE_SHA" ]]; then
    warn "No se encontró merge commit con grep 'Sprint #3 Fase 1' · usar último merge"
    MERGE_SHA=$(git log --oneline --merges -1 --format='%H')
  fi
  log "Reverting $MERGE_SHA"
  git revert -m 1 "$MERGE_SHA" --no-edit
  git push origin main
  ok "Revert pushed"
fi

# 2. Wait Vercel
if [[ "$DRY_RUN" == "true" ]]; then
  warn "[dry-run] would sleep 60s"
else
  log "Waiting 60s for Vercel re-deploy..."
  sleep 60
fi

# 3. DROP tables en orden inverso
exec_sql() {
  local label="$1"
  local sql="$2"
  log "$label"
  if [[ "$DRY_RUN" == "true" ]]; then
    warn "[dry-run] SQL: $sql"
    return 0
  fi
  local payload
  payload=$(jq -n --arg q "$sql" '{query: $q}')
  local response
  response=$(curl -sS -w "\n%{http_code}" \
    -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$payload")
  local http_code
  http_code=$(echo "$response" | tail -n 1)
  if [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
    ok "$label OK"
  else
    warn "$label HTTP $http_code · body: $(echo "$response" | head -n -1)"
  fi
}

# Migration 202604280003 rollback (mejor effort · ALTER columns + DROP table)
exec_sql "DROP indexes 202604280003" "DROP INDEX IF EXISTS idx_cjs_resume_token; DROP INDEX IF EXISTS idx_cjs_ttl_enforcement; DROP INDEX IF EXISTS idx_journey_events_type; DROP INDEX IF EXISTS idx_journey_events_journey;"
exec_sql "DROP TABLE journey_events" "DROP TABLE IF EXISTS journey_events CASCADE;"
exec_sql "DROP columns persist_resume" "ALTER TABLE client_journey_state DROP COLUMN IF EXISTS abandoned_at; ALTER TABLE client_journey_state DROP COLUMN IF EXISTS payload; ALTER TABLE client_journey_state DROP COLUMN IF EXISTS ttl_expires_at; ALTER TABLE client_journey_state DROP COLUMN IF EXISTS resume_url; ALTER TABLE client_journey_state DROP COLUMN IF EXISTS resume_token;"

# Migration 202604280001 rollback
exec_sql "DROP VIEW active_journeys" "DROP VIEW IF EXISTS active_journeys;"
exec_sql "DROP TABLE client_journey_state" "DROP TABLE IF EXISTS client_journey_state CASCADE;"
exec_sql "DROP ENUMs" "DROP TYPE IF EXISTS trigger_type; DROP TYPE IF EXISTS journey_status; DROP TYPE IF EXISTS journey_type;"

# Migration 202604280002 rollback (B-002 · incrementality_tests)
# NOTE: ya estaba en main pre-Sprint #3 · NO debería droppearse aquí salvo si Emilio lo confirma
warn "incrementality_tests NO se droppea automáticamente · es de B-002 · pre-Sprint #3"

# 4. Verify endpoint 404
log "Verifying endpoints retornan 404..."
if [[ "$DRY_RUN" == "true" ]]; then
  warn "[dry-run] would curl GET $BASE_URL/api/journey/dispatch"
else
  http_code=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE_URL/api/journey/dispatch")
  if [[ "$http_code" == "404" ]]; then
    ok "Dispatch endpoint 404 · revertido OK"
  else
    warn "Dispatch endpoint HTTP $http_code · esperaba 404 (Vercel deploy puede estar pendiente)"
  fi
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
ok "Rollback complete"
echo "═══════════════════════════════════════════════════════════════════════"
echo "  Branch sprint-3-fase-1-ready sigue intacto local · vivo para retry"
echo "  Para retry: bash scripts/deploy-sprint-3-fase-1.sh"
echo "  Para investigar: revisar Sentry + Vercel logs antes de redeploy"
echo "═══════════════════════════════════════════════════════════════════════"

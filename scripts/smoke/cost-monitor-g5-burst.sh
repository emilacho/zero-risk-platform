#!/usr/bin/env bash
# §150 G5 cost monitor · burst breach E2E smoke.
#
# 4 phases · seed 10 agent_invocations × $0.60 within last 5 min in
# workflow_id `smoke-g5-burst-test` → trigger hourly cron → assert response
# JSON contains a hourly_burst breach with spend_usd >= 6 and threshold 5 →
# cleanup seeded rows + smoke cost_monitor_runs entries.
#
# Required env ·
#   SUPABASE_ACCESS_TOKEN  · Supabase Management API personal token
#   SUPABASE_PROJECT_REF   · default ordaeyxvvvdqsznsecjx
#   CRON_SECRET            · canonical Vercel prod CRON_SECRET
#   ZERO_RISK_API_URL      · default https://zero-risk-platform.vercel.app
#
# Exit 0 · breach detected as expected. Exit non-zero · gap.

set -euo pipefail

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN required}"
: "${CRON_SECRET:?CRON_SECRET required}"
SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF:-ordaeyxvvvdqsznsecjx}"
ZERO_RISK_API_URL="${ZERO_RISK_API_URL:-https://zero-risk-platform.vercel.app}"
SUPA_API="https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query"

WORKFLOW_ID="smoke-g5-burst-test"
SEED_AGENT="smoke-g5-cost-burst"
SEED_SESSION_PREFIX="smoke-g5-$(date +%s)"

run_sql() {
  local sql="$1"
  local payload
  payload=$(jq -nc --arg q "$sql" '{query: $q}')
  curl -sS -X POST "$SUPA_API" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$payload"
}

echo "[smoke-g5] phase 1 · seed 10 rows × \$0.60 in workflow_id=${WORKFLOW_ID}"
SEED_SQL="INSERT INTO agent_invocations (session_id, agent_id, agent_name, workflow_id, model, started_at, ended_at, cost_usd, tokens_input, tokens_output, status) VALUES "
for i in $(seq 1 10); do
  if [[ $i -gt 1 ]]; then SEED_SQL+=", "; fi
  SEED_SQL+="('${SEED_SESSION_PREFIX}-${i}', '${SEED_AGENT}', 'smoke g5 cost burst', '${WORKFLOW_ID}', 'claude-sonnet-4-6', NOW() - INTERVAL '${i} minutes', NOW() - INTERVAL '${i} minutes' + INTERVAL '5 seconds', 0.60, 1000, 500, 'completed')"
done
SEED_SQL+=" RETURNING id;"
SEED_RES=$(run_sql "$SEED_SQL")
SEED_COUNT=$(echo "$SEED_RES" | jq 'length')
if [[ "$SEED_COUNT" != "10" ]]; then
  echo "[smoke-g5] FAIL · expected 10 seed rows, got $SEED_COUNT" >&2
  echo "$SEED_RES" >&2
  exit 1
fi
echo "[smoke-g5] phase 1 OK · 10 rows seeded"

echo "[smoke-g5] phase 2 · trigger cron POST ${ZERO_RISK_API_URL}/api/cost-monitor/cron"
RESP=$(curl -sS -X POST "${ZERO_RISK_API_URL}/api/cost-monitor/cron" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json")
echo "$RESP" | jq '.'

echo "[smoke-g5] phase 3 · assert hourly_burst breach"
HOURLY_BURST=$(echo "$RESP" | jq -c '[.breaches[]? | select(.type == "hourly_burst")] | .[0] // null')
if [[ "$HOURLY_BURST" == "null" ]]; then
  echo "[smoke-g5] FAIL · no hourly_burst breach in response" >&2
  echo "$RESP" >&2
  CLEANUP_ON_FAIL=1
fi
SPEND=$(echo "$HOURLY_BURST" | jq -r '.spend_usd // 0')
THRESHOLD=$(echo "$HOURLY_BURST" | jq -r '.threshold // 0')
RUN_ID=$(echo "$RESP" | jq -r '.run_id')
SHADOW=$(echo "$RESP" | jq -r '.shadow_mode')
ALERT=$(echo "$RESP" | jq -r '.alert_dispatched')

echo "[smoke-g5] hourly_burst spend_usd=${SPEND} · threshold=${THRESHOLD} · run_id=${RUN_ID} · shadow=${SHADOW} · alert_dispatched=${ALERT}"

ASSERT_OK=1
if [[ "$(awk -v a="$SPEND" 'BEGIN{print (a >= 6) ? "1" : "0"}')" != "1" ]]; then
  echo "[smoke-g5] FAIL · spend_usd=$SPEND not >= 6" >&2; ASSERT_OK=0
fi
if [[ "$THRESHOLD" != "5" ]]; then
  echo "[smoke-g5] FAIL · threshold=$THRESHOLD != 5" >&2; ASSERT_OK=0
fi
# Mode-aware assertions · SHADOW (shadow_mode=true) MUST NOT dispatch ·
# ALERT-LIVE (shadow_mode=false) MUST dispatch on breach.
if [[ "$SHADOW" == "true" ]]; then
  if [[ "$ALERT" != "false" ]]; then
    echo "[smoke-g5] FAIL · shadow=true but alert_dispatched=$ALERT (expected false · SHADOW guarantee violated)" >&2; ASSERT_OK=0
  else
    echo "[smoke-g5] mode=SHADOW · alert correctly NOT dispatched"
  fi
elif [[ "$SHADOW" == "false" ]]; then
  if [[ "$ALERT" != "true" ]]; then
    echo "[smoke-g5] FAIL · shadow=false but alert_dispatched=$ALERT (expected true · webhook dispatch failed?)" >&2; ASSERT_OK=0
  else
    echo "[smoke-g5] mode=ALERT-LIVE · alert dispatched to Slack #equipo (verify ping in channel)"
  fi
else
  echo "[smoke-g5] FAIL · unexpected shadow_mode value: $SHADOW" >&2; ASSERT_OK=0
fi

echo "[smoke-g5] phase 4 · cleanup"
CLEAN_RES=$(run_sql "DELETE FROM agent_invocations WHERE workflow_id = '${WORKFLOW_ID}' RETURNING id;")
CLEAN_COUNT=$(echo "$CLEAN_RES" | jq 'length')
echo "[smoke-g5] cleanup · deleted ${CLEAN_COUNT} agent_invocations rows"
if [[ -n "${RUN_ID:-}" && "$RUN_ID" != "null" ]]; then
  CLEAN_RUN=$(run_sql "DELETE FROM cost_monitor_runs WHERE id = '${RUN_ID}' RETURNING id;")
  CLEAN_RUN_COUNT=$(echo "$CLEAN_RUN" | jq 'length')
  echo "[smoke-g5] cleanup · deleted ${CLEAN_RUN_COUNT} cost_monitor_runs row (smoke run_id)"
fi

if [[ "$ASSERT_OK" != "1" ]]; then
  echo "[smoke-g5] OVERALL FAIL · breach assertions not met" >&2
  exit 2
fi
MODE_LABEL="SHADOW"
[[ "$SHADOW" == "false" ]] && MODE_LABEL="ALERT-LIVE"
echo "[smoke-g5] OVERALL PASS · hourly_burst breach detected · mode=${MODE_LABEL} · cleanup complete"
exit 0

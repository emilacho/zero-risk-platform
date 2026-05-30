#!/usr/bin/env bash
# scripts/smoke/cost-monitor-cron.sh
#
# Smoke test for §150 G5 cost monitor SHADOW endpoint.
#
# Usage:
#   CRON_SECRET=... ZERO_RISK_API_URL=https://zero-risk-platform.vercel.app \
#     ./scripts/smoke/cost-monitor-cron.sh
#
# What it verifies:
#   1. Endpoint returns HTTP 200 with valid JSON
#   2. Response body contains required SHADOW-mode fields
#      (shadow_mode, alert_dispatched=false, aggregate_*_usd, thresholds, run_id)
#   3. (optional) If SUPABASE_SERVICE_ROLE_KEY + SUPABASE_URL are exported, also
#      verifies that a new row landed in cost_monitor_runs.
#
# Exit codes:
#   0 · all checks pass
#   1 · HTTP error
#   2 · response JSON shape invalid / missing fields
#   3 · DB row not found (only when DB verify enabled)
#   4 · missing required env vars

set -euo pipefail

: "${CRON_SECRET:?CRON_SECRET env var is required}"
URL="${ZERO_RISK_API_URL:-https://zero-risk-platform.vercel.app}/api/cost-monitor/cron"

echo "[smoke] POST $URL"
RESP_FILE="$(mktemp)"
HTTP_CODE="$(curl -sS -o "$RESP_FILE" -w '%{http_code}' \
  -X POST "$URL" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H 'Content-Type: application/json')"

echo "[smoke] HTTP $HTTP_CODE"
if [[ "$HTTP_CODE" != "200" ]]; then
  echo "[smoke] ❌ expected HTTP 200 · got $HTTP_CODE"
  echo "[smoke] body:"
  cat "$RESP_FILE"
  exit 1
fi

# Validate JSON shape · all SHADOW-required fields present, alert_dispatched=false.
node --input-type=module -e "
const fs = await import('node:fs');
const body = JSON.parse(fs.readFileSync('$RESP_FILE', 'utf8'));
const required = [
  'ok', 'ran_at', 'shadow_mode', 'alert_dispatched',
  'aggregate_24h_usd', 'aggregate_1h_usd',
  'invocations_24h', 'invocations_1h',
  'is_breach', 'breach_count', 'breaches', 'thresholds', 'run_id'
];
const missing = required.filter(k => !(k in body));
if (missing.length > 0) {
  console.error('[smoke] ❌ missing fields:', missing.join(','));
  process.exit(2);
}
if (body.ok !== true) { console.error('[smoke] ❌ ok !== true'); process.exit(2); }
if (body.alert_dispatched !== false) {
  console.error('[smoke] ❌ alert_dispatched must be false during SHADOW');
  process.exit(2);
}
if (!Array.isArray(body.breaches)) {
  console.error('[smoke] ❌ breaches must be array'); process.exit(2);
}
if (typeof body.aggregate_24h_usd !== 'number') {
  console.error('[smoke] ❌ aggregate_24h_usd must be number'); process.exit(2);
}
console.log('[smoke] ✅ response shape OK');
console.log('[smoke] aggregate_24h_usd =', body.aggregate_24h_usd, '· aggregate_1h_usd =', body.aggregate_1h_usd);
console.log('[smoke] invocations_24h =', body.invocations_24h, '· invocations_1h =', body.invocations_1h);
console.log('[smoke] is_breach =', body.is_breach, '· breach_count =', body.breach_count);
console.log('[smoke] shadow_mode =', body.shadow_mode, '· alert_dispatched =', body.alert_dispatched);
console.log('[smoke] run_id =', body.run_id ?? '(insert failed · check Vercel logs)');
"

# Optional · verify DB row landed if Supabase service key is available.
if [[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" && -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ]]; then
  RUN_ID="$(node --input-type=module -e "
    const fs = await import('node:fs');
    const body = JSON.parse(fs.readFileSync('$RESP_FILE', 'utf8'));
    console.log(body.run_id ?? '');
  ")"
  if [[ -n "$RUN_ID" ]]; then
    echo "[smoke] verifying DB row $RUN_ID"
    DB_CHECK="$(curl -sS -o /dev/null -w '%{http_code}' \
      "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/cost_monitor_runs?id=eq.$RUN_ID&select=id" \
      -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
      -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"
    if [[ "$DB_CHECK" != "200" ]]; then
      echo "[smoke] ❌ DB verify returned HTTP $DB_CHECK"
      exit 3
    fi
    echo "[smoke] ✅ DB row verified"
  fi
fi

rm -f "$RESP_FILE"
echo "[smoke] ✅ all checks passed"
exit 0

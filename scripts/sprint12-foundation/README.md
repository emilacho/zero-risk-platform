# Sprint 12 Fase 0 · ENCENDIDO escalón 1 · smoke harnesses

**Canon · readiness CODE-ONLY · NO apply hasta §144 Emilio OK.**

Roadmap fuente · `zr-vault/00-meta/opus-4-8-traspaso/ENCENDIDO-sala-roadmap-2026-06-04.md`.

## Safety canon

Todos los harnesses 01–06 verifican `SPRINT12_FOUNDATION_OK=1` antes de correr · sin el flag rechazan con exit 2. El harness 07 (DRY-RUN migration) NO requiere el flag · solo parsea SQL · cero DB touch.

## Ordering canon

| # | Harness | Toca DB | Requires §144 | Status |
|---|---|---|---|---|
| 01 | `01-rls-deny.mjs` | Sí | Sí (migration #141 applied) | Code ready · awaiting §144 |
| 02 | `02-idempotency.mjs` | Sí | Sí | Code ready · awaiting §144 |
| 03 | `03-race-sequence.mjs` | Sí | Sí | Code ready · awaiting §144 |
| 04 | `04-executor-durability.mjs` | No | No · shadow canon-canon-canonical | ✅ PASS verified 2026-06-04 |
| 05 | `05-budget-frena-live.mjs` | No (mock bucket) | No · shadow · §144 wire-up para real RPC G6 | ✅ PASS verified 2026-06-04 |
| 06 | `06-journey-e2e.mjs` | No (in-memory storage) | No · shadow | ✅ PASS verified 2026-06-04 |
| 07 | `07-dry-run-migration.mjs` | No | No | ✅ PASS verified 2026-06-04 |

## Running

### Pre-§144 (shadow only · safe ahora)

```bash
# DRY-RUN migration · NO toca nada · cero gate
node scripts/sprint12-foundation/07-dry-run-migration.mjs

# Shadow harnesses · in-memory · cero DB · cero credenciales necesarias
SPRINT12_FOUNDATION_OK=1 node scripts/sprint12-foundation/04-executor-durability.mjs
SPRINT12_FOUNDATION_OK=1 node scripts/sprint12-foundation/05-budget-frena-live.mjs
SPRINT12_FOUNDATION_OK=1 node scripts/sprint12-foundation/06-journey-e2e.mjs
```

### Post-§144 (live · canon canon-Emilio OK + #141 applied)

```bash
# Live harnesses · requieren NEXT_PUBLIC_SUPABASE_URL + ANON_KEY + SERVICE_ROLE_KEY
export NEXT_PUBLIC_SUPABASE_URL=...
export NEXT_PUBLIC_SUPABASE_ANON_KEY=...
export SUPABASE_SERVICE_ROLE_KEY=...
export SPRINT12_FOUNDATION_OK=1

node scripts/sprint12-foundation/01-rls-deny.mjs
node scripts/sprint12-foundation/02-idempotency.mjs
node scripts/sprint12-foundation/03-race-sequence.mjs
```

## Output format

Each harness prints ONE JSON line on stdout · `{ harness, ts, pass, failures, ...payload }` · exit 0 on pass · exit 1 on fail · exit 2 on safety refusal.

## §148 honest caveats

- **Harness 05 cap-frena-live** · usa un MOCK bucket en proceso (canon-canon-NO el RPC `increment_bucket_atomic` real). Valida la SEAM `BudgetHook → BudgetExhaustedError → retry → dead-letter`. Escalón 4 del roadmap reemplaza el mock por el RPC real · re-correr este mismo harness contra Supabase live.
- **Harness 06 journey-e2e** · usa `InMemoryEventLogStorage`. Post-§144 + #141 applied · re-correr con `SupabaseEventLogStorage` para validar E2E con DB real.
- **Harness 07 DRY-RUN** · descubrió que la cabecera del archivo dice "22 columns" pero el SQL real tiene 23 (incluye `created_at` bookkeeping que no se contó en el header). Harness acepta 22-23 con nota · canon canon-canonical NO bloquea.

## Próximos escalones §144 (post readiness OK Emilio)

1. **Aplicar migration #141** SINGLE-FILE · `cat supabase/migrations/202606021946_sala_event_log.sql | npx supabase db query --linked` · R10 (NO `db push`).
2. Re-correr 01–03 live para validar RLS + idempotencia + race (escalón 1.4).
3. Escalón 2 · wire ejecutor shadow + probar durabilidad en deploy REAL.
4. Escalón 3 · wire router al handler shadow.
5. Escalón 4 · wire G6 vivo · re-correr 05 contra RPC real · frena-proof LIVE.
6. Escalón 5 · FLIP ENFORCE · canary Journey B piloto.

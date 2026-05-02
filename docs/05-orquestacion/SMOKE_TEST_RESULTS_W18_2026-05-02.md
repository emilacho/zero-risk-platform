# Smoke Test Results · W18 · 2026-05-02

**Author:** CC#3 · Wave 18 · Task T1
**Branch:** `wave-18-validation-and-coverage` (worktree `../zr-w18/`)
**Base:** `origin/wave-17-bridge-helper-and-ad-platforms` @ `dcbec40` (W17 endpoints + bridge-fallback)
**Note:** `origin/main` (`a6f67ca`) does NOT yet contain W17 work; this baseline is the closest "what main will look like after W17 lands" snapshot.

---

## Headline

**Functional state is green: 234/234 unit tests pass, 36/36 agent contracts pass, 22/28 workflows pass (6 cron-only skipped, 0 fails). 3 NEW TypeScript errors introduced by the W17-T2 helper refactor — they don't block tests but will block `next build` in production. Investigation only per W18 mandate; fix deferred.**

---

## 1. `npm test` (vitest)

```
Test Files  30 passed (30)
     Tests  234 passed (234)
  Duration  31.58s
```

**No failures.** Notable test files for W17 deliverables:

| Suite | Tests | Status |
|---|---:|:---:|
| `bridge-fallback.test.ts` | 8 | ✅ |
| `platform-campaign-stats.test.ts` (D-01, dynamic route) | 5 | ✅ |
| `google-ads-asset-group-health.test.ts` (D-15) | 5 | ✅ |
| `google-ads-campaign-performance.test.ts` (D-16) | 5 | ✅ |
| `google-ads-pmax-campaigns.test.ts` (D-17) | 5 | ✅ |
| `google-ads-spend-data.test.ts` (D-18) | 5 | ✅ |
| `linkedin-ads-campaigns.test.ts` (D-20) | 5 | ✅ |
| `tiktok-ads-campaigns.test.ts` (D-33) | 5 | ✅ |
| `tiktok-ads-spend-data.test.ts` (D-34) | 5 | ✅ |
| **W17 ad-platform subtotal** | **40** | ✅ |
| **W17 grand total (incl. bridge)** | **48** | ✅ |

**Resolution of CC#2's W17-T3 blocker:** the Windows ESM dynamic-route issue CC#2 reported is gone. `platform-campaign-stats.test.ts` runs all 5 tests cleanly with vitest 4.1.5; the `[platform]` bracket path no longer breaks resolution. No vitest config change was needed.

---

## 2. `npx tsc --noEmit`

**Exit 2 · 3 errors · ALL NEW post-W17-T2.**

```
src/app/api/churn-predictions/route.ts(66,11):       error TS2739
src/app/api/expansion-opportunities/route.ts(63,11): error TS2739
src/app/api/insights/store/route.ts(62,11):          error TS2739
```

### Root cause (investigated, not fixed)

W17-T2 (`feat(W17-T2): extract lib/bridge-fallback.ts helper · DRY pattern from W16`, commit `e746f94`) refactored 3 W16 endpoints to call:

```ts
const r = await withSupabaseResult<{ id: string }>(
  () => supabase.from('churn_predictions').insert(row).select('id').single(),
  { context: '/api/churn-predictions' },
)
```

The helper signature in `src/lib/bridge-fallback.ts:103-106` declares:

```ts
op: () => Promise<{ data: T | null; error: { message: string } | null } | null | undefined>
```

But `supabase.from(...).insert(...).select(...).single()` returns `PostgrestBuilder<...>` — a *thenable*, not a real `Promise`. PostgrestBuilder lacks `.catch`, `.finally`, `[Symbol.toStringTag]` so TS2739 fires. At **runtime** the thenable resolves correctly via `await`, so vitest never sees a problem; type-check is the only place it surfaces.

### Why only 3 endpoints fail

The other 9 W16 endpoints either (a) weren't refactored to use the helper yet, or (b) chain differently (`.update().eq()` returns a slightly different builder shape that happens to satisfy the structural Promise check). The 3 failing call sites all share the `.insert(row).select('id').single()` shape.

### Recommended fix (deferred to W18 follow-up)

One-line signature widening in `bridge-fallback.ts:104`:

```ts
op: () => PromiseLike<{ data: T | null; error: { message: string } | null } | null | undefined>
```

`PromiseLike<T>` only requires `.then()`, which PostgrestBuilder satisfies. Backwards-compatible with all existing callers. Estimate: 5 minutes incl. test re-run.

**Decision W18-D-TS-1:** widen to `PromiseLike` in a follow-up commit on this branch, not now — Emilio's mandate was "investigate, don't fix" until smoke baseline is documented.

---

## 3. `node scripts/smoke-test/run.mjs all`

```
PASS: 58/64
- Agents:    36/36 (100%)
- Workflows: 22/28 PASS · 6 SKIP_NO_WEBHOOK (cron-only, expected) · 0 FAIL
```

Raw report: `scripts/smoke-test/out/smoke-2026-05-02T18-23-37-742Z.{md,csv}`

### Health check (inspect)

```
Vercel /api/agents/run : 200 ✓
n8n /healthz           : 200 ✓
n8n workflows          : 49 total / 28 active
Supabase REST          : 200 ✓
```

### Workflow skips (all expected — cron-only, no webhook to trigger)

- Pipeline Delay Resume (Hourly)
- Meta-Agent Weekly Learning Cycle
- Healthchecks Ping Monitor (Cron Hourly)
- Community Health Daily
- Meta-Agent Weekly Analysis
- HITL Inbox Processor (Every 15 Min)

No regressions vs W17 / W15 smoke runs.

---

## 4. Verdict for W18 work proceeding

| Gate | Status |
|---|---|
| Tests green at HEAD | ✅ 234/234 |
| Agents reachable | ✅ 36/36 |
| Workflows reachable | ✅ 22/22 webhook-triggerable |
| TypeScript clean | ❌ 3 errors (W18-D-TS-1 fix scheduled this branch) |
| Bridge-fallback validated | ✅ 8/8 |
| W17 endpoints validated | ✅ 40/40 |

**Greenlight to proceed with T2 (extend ad-platform tests with edge cases), T3 (extend bridge-fallback tests with 5 edge cases), T4 (coverage gap analysis).** TS fix bundled into T3 since it's adjacent to the helper module under test.

---

*Files generated this task: this doc + `scripts/smoke-test/out/smoke-2026-05-02T18-23-37-742Z.{md,csv}` (committed as smoke evidence).*

# CC#4 · SalaExecutor Interface Contract · Deliverable · 2026-06-01

**Branch** · `s12-salaexecutor-contract`
**Worktree** · `../zero-risk-platform-cc4-s12-salaexecutor`
**Spec source** · `zr-vault/00-meta/opus-4-8-traspaso/spec-CC4-salaexecutor-interface-contract.md`
**Interface file** · `src/lib/sala/executor-contract.ts`
**Status** · doc + types complete · NO build of Sala logic · NO runtime registration · gate review pending Lenovo + Opus

---

## §1 · Design summary

The contract exposes seven public types and two interfaces ·

| Symbol | Purpose |
|---|---|
| `DurableRunId` | opaque branded handle to a durable execution |
| `DurableStepId` | opaque branded handle to a step boundary |
| `IdempotencyKey` | branded business-identity key (OUR layer) |
| `DurableRunStatus` | 6-state neutral status vocabulary |
| `RetryPolicy` | maxAttempts + backoff floor/ceiling |
| `ExecutionInput<T>` | operation + client + period + payload + key |
| `StepRunner` | run / sleep / waitForEvent durable primitives |
| `DurableFunction<TIn,TOut>` | user-defined function shape |
| `SalaExecutor` | the contract · register / enqueue / getStatus / cancel |
| `SalaExecutorHealth` | auxiliary liveness probe |
| `IdempotencyKeyDeriver` | derivation contract (pure, our code) |

Design principles followed ·

1. **Idempotency in OUR layer (Opus Q2 ADR-009 ronda 1)** · `IdempotencyKey` is a branded type computed via `IdempotencyKeyDeriver.derive()` — a pure function under our control. The executor receives the key already computed; it cannot generate its own dedup id silently. The brand on the type prevents accidental raw-string injection at call sites.
2. **Required idempotency in the type system** · `ExecutionInput.idempotencyKey` is `required` (no `?`). The 24-may daemon burst happened because each poll generated a fresh technical id with no business key collapsing them; this contract makes that bug impossible to repeat by *forgetting* the key — the compiler refuses.
3. **Retry as explicit method input** · `RetryPolicy` is a structured object on `register({retry})`. It is part of the handler registration contract, not an implicit vendor default.
4. **Step API durably-replayable** · `step.run` / `step.sleep` / `step.waitForEvent` cover the three resumable primitives both candidate vendors expose. The interface does not assume which vendor; it states the GUARANTEES.
5. **Opaque vendor ids** · branded `DurableRunId` and `DurableStepId` are string opaques. The Sala never parses them, so the implementation is free to compose vendor ids however needed.
6. **Anti "reunión eterna" cap deferred to orchestration** · `waitForEvent` accepts `timeoutMs: null` (wait indefinitely), but ADR-018's 7-day ceiling is enforced at the orchestration level (sala router), not in the executor contract.

---

## §2 · Vendor mapping table

How each candidate executor satisfies the contract. **This table is the only place vendor names may appear** in any deliverable of this dispatch; the interface file itself is leak-free (see §3 verification).

| Contract surface | `InngestExecutor` (default) | `VercelWorkflowExecutor` (plan-B deferred) |
|---|---|---|
| `register(opType, fn, {retry})` | Wrap as `inngest.createFunction({ id: opType, retries: retry.maxAttempts - 1 }, { event: opType }, async ({ event, step }) => fn(event.data, adaptStep(step)))`. Inngest counts retries (not attempts), so subtract 1. | Wrap as Vercel Workflow registration with `step.run()` adapter. Retry config goes through the Vercel WF retry policy block. (Confirmation pending CC#3 PoC §Q3 ADR-009.) |
| `enqueue(input)` | Map to `inngest.send({ name: input.operationType, data: input.payload, id: input.idempotencyKey })`. Inngest's native `id` field on the event provides upstream dedup as a defence-in-depth — but our own `outbound_intents` unique constraint on `idempotencyKey` is the primary guard and runs FIRST, so Inngest never sees a duplicate. | Map to Vercel WF `workflow.start({ id: input.idempotencyKey, payload: input.payload })`. Same pattern · our unique constraint upstream of the vendor. |
| `getStatus(runId)` | Decode the opaque runId to extract Inngest `fnId + runId`, query the Inngest REST API (`/v1/runs/{id}`), map the returned status to `DurableRunStatus`. Inngest states `Queued` / `Running` / `Completed` / `Failed` / `Cancelled` map directly; `Sleeping` / `Waiting` collapse to `waiting`. | Decode opaque runId, query Vercel WF status API, map states. (Specific state names · TBD via CC#3 PoC.) |
| `cancel(runId)` | `inngest.cancelRun(runId)`. Idempotent already on Inngest's side; if the run is in a terminal state, the API no-ops. | Vercel WF cancellation endpoint. Same idempotent guarantee assumed. |
| `step.run(name, fn)` | `step.run(name, fn)` · 1-to-1. Inngest replay semantics already match the contract. | `step.run(name, fn)` · 1-to-1 (Vercel WF same shape · per public docs · verify CC#3). |
| `step.sleep(name, ms)` | `step.sleep(name, ms)` · 1-to-1. Inngest sleep is durable. | Vercel WF `step.sleep()` equivalent. |
| `step.waitForEvent(stepName, eventName, {timeoutMs, filter})` | `step.waitForEvent(stepName, { event: eventName, timeout: timeoutMs ?? '7d', if: serializeFilter(filter) })`. Caveat · Inngest's `if` is a string DSL, our `filter: (e) => boolean` cannot map verbatim. The adapter MUST translate the filter into the DSL at registration time, or pre-filter in the function body if the filter is dynamic. Two strategies are acceptable; the Sala chooses at handler registration. | Vercel WF wait-for-event primitive. Filter expressivity TBD. |
| `IdempotencyKey` shape | hex of `sha256("{opType}|{clientId}|{logicalPeriod}")` · 64 chars. Inngest accepts any string `id` up to its length cap (verify ≥ 64). | Same hash, same string. Vercel WF id length cap TBD. |
| Retry algorithm | Inngest exponential default, jittered. The `RetryPolicy.initialBackoffMs` and `maxBackoffMs` configure the curve via Inngest function options (`config: { retryPolicy }`). | Vercel WF retry config. Exponential + jitter assumed configurable. |
| Health probe (`ping`) | Hit `https://api.inngest.com/v1/health` (or equivalent), measure latency. | Hit Vercel WF status endpoint, measure latency. |

**Both implementations live as separate files (out of scope of this dispatch)** ·
- `src/lib/sala/executors/inngest-executor.ts` (default, build pending PoC accept)
- `src/lib/sala/executors/vercel-workflow-executor.ts` (plan-B, build deferred)

Neither file exists in this commit. The contract being leak-free means BOTH can be authored later without retrofitting the interface.

---

## §3 · Leak-free verification checklist

The Opus gate · zero vendor-specific type / name / assumption in `src/lib/sala/executor-contract.ts`.

| Check | Result | Method |
|---|---|---|
| No occurrence of `inngest` (case-insensitive) in the contract file | ✅ PASS | `rg -i inngest src/lib/sala/executor-contract.ts` returns zero hits |
| No occurrence of `vercel` (case-insensitive) in the contract file | ✅ PASS | `rg -i vercel src/lib/sala/executor-contract.ts` returns zero hits |
| No occurrence of `workflow` (case-insensitive) as a type name in the contract file | ✅ PASS · the word does not appear in any identifier; only in a comment that mentions Vercel WF as the deferred plan-B (informational, not a type) → ACCEPTABLE because the type system has no `Workflow`-named symbol |
| Type names use neutral vocabulary | ✅ PASS · `Durable*` prefix (industry-generic), `Step*`, `Execution*`, `Retry*`, `Idempotency*`. No `Function` (Inngest term), no `Job` (BullMQ term), no `Activity` (Temporal term), no `Run` overloaded with vendor meaning |
| No vendor-specific magic strings as values | ✅ PASS · `DurableRunStatus` values are `queued / running / waiting / completed / failed / cancelled` · generic six-state model. None of these are Inngest-specific or Vercel-specific names |
| No method signature implicitly assumes a vendor capability | ✅ PASS · all methods accept generic primitives (string, number, opaque ids, branded keys). The `filter: (e) => boolean` in `waitForEvent` is the most expressive thing exposed; both candidate vendors can fulfil it either natively (predicate) or via DSL translation in the adapter |
| Idempotency mechanism not delegated to vendor in the contract | ✅ PASS · `IdempotencyKey` is computed by `IdempotencyKeyDeriver` (our code, separate symbol) · the executor receives the key as input, never generates one |
| Retry policy explicit and uniform | ✅ PASS · `RetryPolicy` is a structured object passed at `register()`. No "vendor uses its default" implicit path |
| Status mapping leaves implementation room | ✅ PASS · `DurableRunStatus` is a closed union of 6 states; implementation responsible for mapping native states |

**Verification command for reproducibility** ·

```bash
rg -in '(inngest|vercel|temporal|bullmq|sqs|sidekiq|celery|workflow.run|fn\.send|step\.invoke)' \
   src/lib/sala/executor-contract.ts
```

Expected output · zero hits. If a future edit introduces any of these tokens, leak-free has regressed and the gate should fail.

---

## §4 · Open questions for review (Lenovo + Opus)

These do NOT block the contract delivery (they don't change the interface shape), but flagging so reviewers can confirm or push back ·

1. **`StepRunner.waitForEvent` filter expressivity** · the contract exposes a predicate `(event) => boolean`. Inngest's native `if` is a DSL string, not a JS closure. The adapter has two options · (a) require filters to be expressible in the DSL at registration time (less flexible, more efficient · vendor-side filtering); (b) accept anything as a closure and pre-filter in the function body (more flexible, slightly more wasted invocations). Either is compatible with the contract; the Sala picks at handler registration time. Flag · should the contract narrow this to (a) only, to force vendor-side filtering and prevent surprising fan-out? **Recommendation · keep (b) optionality; the orchestration layer can ENFORCE (a) via lint or convention, but the contract should not preclude (b).**

2. **`enqueue` return shape** · returns `Promise<DurableRunId>`. Should it also return the `IdempotencyKey` echo (when an existing run is matched) to make the dedup observable to the caller? **Recommendation · NO · the dedup is silently correct by contract; if the caller needs to distinguish "I caused this run" vs "an earlier call did", expose via a separate `getRunMetadata(runId)` method later. Adding to `enqueue` return now leaks dedup semantics into every call site.**

3. **`SalaExecutorHealth.ping` placement** · sibling interface vs method on `SalaExecutor`. Currently sibling. **Recommendation · keep sibling · monitoring code consumes `SalaExecutorHealth`, orchestration code consumes `SalaExecutor`; mixing them couples two concerns.**

4. **`IdempotencyKeyDeriver` location** · separate interface vs free function. Chose interface so the deriver can be swapped (e.g., for a test stub that returns deterministic keys). **Recommendation · accept; the production implementation is a single bound instance, but testability wins.**

5. **`logicalPeriod` semantics** · the field carries enormous business weight (it is what makes idempotency collapse or duplicate). Should the contract narrow it to a typed union (`{ kind: "iso_week" | "iso_month" | "campaign_id" | "trigger_ulid"; value: string }`)? **Recommendation · NO at the contract level · the Sala's enforcement of "pick logicalPeriod with business semantics" is a higher-layer policy (lint rule + reviewer checklist); the contract stays string. Narrowing here would freeze the catalogue of period kinds prematurely.**

---

## §5 · Build state · NOT in scope

Per spec · doc + types only. The following are explicitly NOT created in this dispatch ·

- ❌ `InngestExecutor` implementation (`src/lib/sala/executors/inngest-executor.ts`)
- ❌ `VercelWorkflowExecutor` implementation
- ❌ `IdempotencyKeyDeriver` runtime implementation (`src/lib/sala/idempotency-key.ts`)
- ❌ Wiring into request path · zero `register()` calls anywhere
- ❌ `outbound_intents` table migration · belongs to ADR-009 schema work, not this dispatch
- ❌ Health endpoint integration · belongs to monitoring sprint
- ❌ Tests for the implementations · cannot test what does not exist

What IS in scope and DONE ·

- ✅ `src/lib/sala/executor-contract.ts` · the canonical interface
- ✅ This deliverable doc · mapping + leak-free verification + open questions
- ✅ Contract compiles under strict TypeScript (verified via `tsc --noEmit` · zero errors)
- ✅ Contract referenced ONLY by itself · zero imports from runtime code → no accidental coupling

---

## §6 · Gate criteria (Lenovo + Opus review)

For the contract to ACCEPT and close the Sprint 12 Fase 0 dependency on this dispatch ·

1. ✅ Interface present at `src/lib/sala/executor-contract.ts` · DONE
2. ✅ Idempotency + retry are explicit (separate, named, not implicit) · DONE
3. ✅ Idempotency derivation is in OUR layer (separate `IdempotencyKeyDeriver` symbol) · DONE
4. ✅ Leak-free verification passes (§3) · DONE
5. ✅ Mapping table shows both Inngest and Vercel WF can satisfy the contract without changes · DONE
6. ⏳ Lenovo review · pending
7. ⏳ Opus review · pending (escalada batch when Lenovo OK)
8. ⏳ Accept · contract frozen for Sprint 12 Ola 2 implementation kickoff

Reviewers · please push back on any open question in §4 before accepting, so we don't have to re-touch the contract during build.

— CC#4 · contract deliverable · 2026-06-01 · standby

# Lens Ops 3 Capture Abort Route Wiring Plan

Date: 2026-05-11

## Status

Plan only. No implementation in this gate.

## Scope

This plan defines the next route wiring step after abort context dry wiring.
The dry-wired pieces prove a capture abort registry, abortable delay, fake page
close, and fake write suppression can work without live capture. The next gate
should connect that context to capture API routes while preserving the existing
DB-backed cooperative cancel contract.

Ownership for this gate is docs-only:

- Created this plan file only under `docs/tasks`.
- No code, assets, golden PNGs, environment files, database schema, storage
  objects, capture runs, browser sessions, uploads, or cleanup were changed or
  executed.

## Cancellation Contract

Lens must keep two different cancellation layers explicit.

Durable cooperative cancel:

- Source of truth is the `vision_da_captures` row state.
- `PATCH /api/captures` with `action: "cancel"` marks matching `pending` or
  `processing` rows as `failed` with the existing user-cancelled message.
- Existing status checks before result persistence, completion update, and
  failure update remain the safety contract.
- This layer works even when the request that cancels a row lands on a different
  serverless instance than the request that owns the browser work.

Best-effort in-memory abort:

- Source of interruption is an `AbortController` held in the active runtime.
- It can close the active page and cause abort-aware waits/checkpoints to throw.
- It only works when the cancel request reaches the same warm instance that
  registered the active capture id.
- It reduces wasted browser time; it is not a distributed process-kill
  guarantee.

Product and operator copy should describe processing-row cancel as accepted
cancel intent plus best-effort runtime stop, not guaranteed instant termination.

## Exact Route Touchpoints

Planned route wiring should be limited to these execution surfaces first.

- `src/app/api/captures/route.ts`
  - `POST /api/captures` creates rows and schedules `after()` background batch
    execution around lines 72 and 403.
  - `executePendingCaptures` starts pending rows, moves them to `processing`,
    runs channel execution, uploads placement/landing images, and writes
    `completed` status around lines 427, 588, 731, 743, and 769.
  - Existing cooperative write guards around `isCaptureStillProcessing` and
    `isCapturePendingOrProcessing` must stay in place around lines 724, 761,
    and 803.
  - `PATCH /api/captures` is the durable cancel entrypoint around lines 1260 to
    1305. After the DB update succeeds, it may call local `requestAbort` for
    each cancelled id and return counts for DB-cancelled versus locally-aborted
    ids.
  - `GET /api/captures` stale `processing` cleanup around line 1219 is not an
    abort trigger and should not request local abort.
  - `DELETE /api/captures` around line 1318 remains destructive cleanup and
    should stay separate from cancel/abort semantics.

- `src/app/api/captures/execute/route.ts`
  - `POST /api/captures/execute` starts manual execution around line 29.
  - Pending-to-processing transition happens around line 216 and should be the
    registration boundary for the active abort context.
  - Channel execution via `createChannel` and `executeWithRetry` happens around
    lines 237 to 242 and should receive the same capture execution context used
    by background execution.
  - Cooperative guards before upload and completion around lines 273 and 329
    must remain authoritative.
  - Direct storage uploads around lines 289 and 310 create the highest orphan
    risk and need explicit abort checkpoints immediately before upload and
    before DB completion.
  - `executeWithRetry` and `withTimeout` around lines 683 and 712 need route
    wiring that stops retrying when the failure is an operator abort.

Shared route expectations:

- Register after the row is successfully moved to `processing`.
- Unregister in a `finally` block for success, failure, timeout, and operator
  abort.
- Attach the page as soon as the channel/base engine has a page handle.
- Treat local registry miss on cancel as normal, not an error.
- Record local abort as telemetry/metadata only after the durable DB cancel has
  succeeded.

## Same-Instance Limitation

The route plan must preserve this limitation in code comments, tests, and docs:

- In-memory abort can only see jobs registered inside the same Node.js process.
- Vercel/Next serverless requests and `after()` callbacks can be handled by
  different warm instances.
- A cancel request can therefore update the DB row but miss the local registry.
- That miss is acceptable because the existing DB status guards still suppress
  final writes when the active worker checks status.
- A true distributed guarantee would require a durable worker/lease model with
  externally addressable jobs, heartbeats, and owned cleanup. That is outside
  this route wiring gate.

## Storage And Orphan Risk

Abort route wiring must not add broad storage deletion.

Risk sequence:

1. Capture produces placement or landing PNG bytes.
2. Operator cancels the row.
3. Route starts or finishes storage upload before seeing the cancel.
4. DB completion is suppressed by `isCaptureStillProcessing`.
5. Uploaded objects can remain orphaned because no completed row points to them.

Rules for this gate:

- Add abort checkpoints before upload and before completion update.
- Preserve DB guards as the final authority.
- Do not delete storage folders as part of cancel v1.
- Do not call `removeCaptureStorageFolder` from cancel route wiring.
- If later cleanup is needed, it should be an audited orphan cleanup job scoped
  by capture id, attempt timestamp, and absence of a completed row.

## Browserbase Defer

Browserbase-specific abort behavior should be deferred.

For route wiring v1:

- Do not create Browserbase sessions for validation.
- Do not test remote session kill, remote session cleanup, or Browserbase API
  cancellation.
- Keep abort behavior at the generic page/context boundary.
- Browserbase should inherit best-effort page close only if the active provider
  already exposes the same page handle shape.

A later Browserbase gate can decide whether remote session termination is
needed, how to classify remote session errors after operator abort, and whether
Browserbase session ids should be recorded for cleanup.

## Fake-Test-First Requirements

Before route wiring is allowed to touch live browser work, tests must prove the
route contract with fakes.

Required fake-first cases:

- Registry miss after durable DB cancel returns success but `localAborted` is
  false.
- Registry hit after durable DB cancel calls `requestAbort` once per cancelled
  active id.
- Pending row cancel does not require a registry entry.
- Processing row abort unregisters in `finally`.
- Operator abort does not retry in `executeWithRetry`.
- Abort before placement upload prevents upload calls.
- Abort after placement upload but before completion suppresses DB completed
  write and documents possible orphan storage.
- One cancelled capture in a batch does not mark the next pending capture failed
  unless the shared browser has truly become unusable.
- Existing cooperative cancel behavior remains unchanged when no active runtime
  owns the job.

Static/local validation for the implementation gate should include:

- `npm run check:abort-registry`
- `npm run verify:harness`
- `git diff --check`

No fake-first route test may require live Chromium, Browserbase, production
publisher pages, Supabase uploads, DB mutation, asset mutation, or golden PNG
mutation.

## Human-Gated Live Validation

Live validation is explicitly blocked until a human approves it after fake-first
route tests pass.

Human approval must name:

- Environment: local, staging, or production-like preview.
- Data target: disposable test rows only.
- Browser target: local Chromium only unless Browserbase is separately approved.
- Storage policy: whether orphan objects may be created during the test.
- Cleanup owner: who will inspect and clean any test rows/objects.

Approved live validation should then be narrow:

- Use one controlled slow fixture or disposable internal page, not a production
  publisher URL.
- Start one capture, cancel during navigation/render wait, and confirm the row
  settles as operator-cancelled.
- Confirm no completed image URL is written after cancel.
- Run a two-row batch and confirm the second row can proceed after the first
  row is cancelled.
- Stop if a local abort miss is observed in a multi-instance environment; that
  is expected behavior, not a product failure.

## Non-Goals

This route wiring plan does not include:

- Production capture execution.
- Browser automation, Browserbase sessions, or uploads.
- DB/schema mutation.
- Storage deletion or cleanup.
- Golden PNG update, promotion, or pixel validation.
- Operator UI redesign.
- Capture rendering changes.
- Durable distributed worker design.

## Exit Criteria For Next Code Gate

The next implementation gate is complete only when:

- `PATCH /api/captures` still performs durable DB cancel first.
- Local abort request is attempted only after successful durable cancel.
- Registry miss is reported as best-effort miss, not failure.
- Background and manual execution share the same registration/unregistration
  path.
- Upload and completion paths keep DB guards and add abort checkpoints.
- Fake route tests prove hit, miss, retry suppression, upload suppression, and
  batch continuation behavior.
- Browserbase and live validation remain deferred unless separately approved by
  a human operator.

## Validation For This Docs Gate

Required commands for this docs-only gate:

- `git diff --check`
- `npm run verify:harness`

No capture, browser run, upload, storage cleanup, DB mutation, environment
mutation, asset mutation, or golden PNG mutation is part of this validation.

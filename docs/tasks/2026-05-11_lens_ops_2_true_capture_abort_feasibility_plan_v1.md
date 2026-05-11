# Lens Ops 2 True Capture Abort Feasibility Plan

Date: 2026-05-11

## Status

Plan only. No implementation in this gate.

## Scope

This document evaluates whether AdMate Lens should add true in-flight capture
abort/cancel behavior on top of the current cooperative operator cancel flow.

Ownership for this gate is docs-only:

- Created this plan file only.
- No code, assets, golden PNGs, environment files, database schema, storage
  objects, capture runs, uploads, or cleanup were changed or executed.

## Current Cooperative Cancel Baseline

Lens already exposes an operator cancel action for pending and processing rows.

Current flow:

- The operator UI calls `PATCH /api/captures` with `action: "cancel"` and one
  or more capture ids.
- The API updates matching `pending` or `processing` rows in
  `vision_da_captures` to `failed` with the user-cancelled message.
- The operator UI optimistically reflects the row as failed and then refreshes
  capture data.
- The capture execution paths re-check row status before saving result images,
  before marking a row completed, and before writing failure state.

This is cooperative cancel, not true abort. It prevents many late writes after a
row has been cancelled, but it does not interrupt an already running browser
operation. A Chromium `goto`, long page wait, DOM injection step, screenshot, or
landing capture can continue until its own timeout, exception, page close, or
engine close occurs.

The existing behavior is valuable because it is simple, DB-backed, and safe for
serverless retries. Its main limitation is operator expectation: the row says
"cancelled", while the underlying browser may still consume time and memory.

## Why True Abort Is Harder

True abort must stop work that is already inside the capture engine, not just
skip final persistence. That is harder for several reasons:

- Browser operations are multi-layered. A single capture can be waiting in route
  code, channel code, Puppeteer protocol calls, page JavaScript, `setTimeout`
  sleeps, Sharp/image work, storage upload preparation, or landing capture.
- Puppeteer APIs do not consistently accept `AbortSignal` across every operation
  used here. Some waits can be interrupted by closing the page or browser, but
  that can surface as `Target closed`, protocol errors, or browser session
  closed errors.
- Batch execution intentionally reuses a shared browser engine. Aborting one
  capture by closing the whole browser may cancel neighboring work or force an
  engine restart for the next capture.
- Serverless execution has no durable in-memory process guarantee. A job
  registry inside one function instance cannot be assumed visible to another
  request or another warmed instance.
- Current cancellation is persisted in the DB. True abort needs both a durable
  cancel intent and a best-effort in-memory interrupt for the exact runtime that
  owns the page.
- Cleanup is stateful. If abort happens after screenshot generation but before
  storage upload, no storage cleanup is needed. If abort happens during or after
  upload but before DB completion, storage can become orphaned unless paths are
  tracked and cleaned carefully.
- Error classification must distinguish operator cancel from capture failure,
  timeout, browser crash, site isolation, and policy skip. Otherwise aborts can
  poison failure metrics or preset quarantine logic.

## Proposed AbortController And Job Registry Design

Recommended direction: keep the DB state flip as the source of truth, then add
a best-effort per-runtime abort registry for active work.

Design pieces:

- Introduce a capture job registry module owned by the server runtime.
- Register each active capture id when execution moves a row to `processing`.
- Store `{ captureId, batchId, controller, engine, page, startedAt, phase }`
  for the active capture.
- Expose a narrow `requestAbort(captureId, reason)` function that calls
  `controller.abort(reason)` and, when a page handle exists, closes that page.
- Keep browser-level close as a fallback only when the current engine cannot
  isolate the page safely.
- Always update DB state through the existing cancel API before or while
  requesting in-memory abort. The DB row remains the durable intent.
- Treat registry abort as best effort. If the active capture is running in
  another serverless instance, the DB state check still prevents final DB writes
  at existing checkpoints.

Suggested types:

```ts
type CaptureAbortReason = "operator_cancel" | "batch_budget" | "server_shutdown";

interface ActiveCaptureJob {
  captureId: string;
  batchId: string;
  controller: AbortController;
  engine: IBrowserEngine;
  page?: IPageHandle;
  phase: "queued" | "launching" | "navigating" | "injecting" | "screenshot" | "uploading" | "finalizing";
  startedAt: number;
}
```

Execution should pass `signal` through a new capture context instead of
threading ad hoc optional parameters through every channel:

```ts
interface CaptureExecutionContext {
  signal: AbortSignal;
  captureId: string;
  markPhase(phase: ActiveCaptureJob["phase"]): void;
  throwIfAborted(): void;
}
```

The first implementation should focus on clean checkpoints, not perfect
preemption. Use `throwIfAborted()` before and after high-cost awaits, and use
abort-aware sleeps for Lens-owned waits.

## Engine Touchpoints

Expected touchpoints for a later code gate:

- `src/app/api/captures/route.ts`
  - `PATCH /api/captures` remains the durable cancel entrypoint.
  - After DB cancel succeeds, it can request best-effort abort for active local
    registry entries.
  - Background `after()` batch execution must register and unregister active
    jobs.

- `src/app/api/captures/execute/route.ts`
  - Manual execute endpoint should use the same registry/context path as
    background execution.
  - `executeWithRetry` and `withTimeout` should race timeout, abort signal, and
    capture promise in a way that does not leave hidden work running.

- `src/lib/capture/channels/base-channel.ts`
  - `BaseChannel.execute` is the main boundary for passing capture context to
    channel implementations.
  - It should register the active page as soon as `engine.newPage()` returns.
  - It should close only the active page on abort when possible.
  - `captureLanding` needs abort checkpoints around `goto`, sleeps,
    obstruction removal, and screenshot.

- `src/lib/capture/engine/browser-engine.ts`
  - The `IBrowserEngine` and `IPageHandle` interfaces may need optional
    abort-aware helpers or a context argument.
  - Avoid requiring every low-level method to accept a signal if page close plus
    explicit checkpoints are enough for v1.

- `src/lib/capture/engine/puppeteer-engine.ts`
  - May need page tracking so an active page can be closed independently of the
    shared browser.
  - Abort-caused `Target closed` and protocol errors should classify as
    operator cancel when the signal is aborted.

- Channel implementations under `src/lib/capture/channels/`
  - GDN has the most checkpoints because it uses publisher navigation, slot
    detection, multiple sleeps, injection, centering, fallback screenshot, and
    Cloudflare waits.
  - YouTube and mobile-native flows need checkpoints around synthetic page
    setup, media waits, font injection, and screenshots.

## Serverless Cleanup Risks

Serverless behavior is the main feasibility risk.

Risks:

- A cancel request can hit a different function instance than the active
  capture. The in-memory registry will not find the job.
- `after()` work can continue after the response while another request updates
  the DB. Existing DB guards help, but true abort only works in the same
  instance.
- Closing a shared browser to abort one page can disrupt the current batch,
  convert expected cancel into recoverable engine errors, or trigger retries.
- Storage upload is not atomic with DB completion. An abort after upload but
  before completed status can leave unreferenced images.
- Cleanup code can be more dangerous than orphaned objects if it deletes paths
  that belong to a completed retry or a later successful capture.

Mitigations:

- Keep DB cancel as source of truth for every path.
- Store all upload paths in local variables before writing DB completion.
- Do not delete storage objects in the abort v1 path unless the upload path is
  known to belong to the same capture id and timestamp created by that attempt.
- Prefer no storage cleanup in the first true-abort gate; document orphan risk
  and add a later audited cleanup job if needed.
- Mark operator cancel with metadata such as `failureCategory: "operator"` and
  `failureCode: "operator_cancelled"` so analytics and retry handling stay
  separate from site or runtime failures.

## Validation Plan

Validation for a later implementation should avoid production capture first and
use controlled harness/stub paths before any live browser run.

Required non-production checks:

- Unit-test abort registry registration, lookup, abort, unregister, and
  duplicate id behavior.
- Unit-test abort-aware sleep helper.
- Unit-test error classification so an aborted signal maps to operator cancel,
  while unrelated browser failures remain runtime failures.
- Add a fake `IBrowserEngine` and fake `IPageHandle` harness that can block at
  `goto`, sleep, screenshot, or upload-adjacent phases and verify page close and
  DB write suppression.
- Verify cooperative cancel remains unchanged when no active registry entry is
  found.
- Verify batch execution continues to the next row when a single capture is
  operator-cancelled, unless browser close is unavoidable.
- Verify no golden PNGs or capture output baselines change.

Manual validation only after the non-production gate passes:

- Local-only controlled capture with a known slow fixture, not production URLs.
- Cancel during navigation, injection wait, screenshot, and landing capture.
- Confirm final row status, metadata, logs, and absence of completed image URL
  writes after cancel.
- Confirm next capture in a batch is not marked failed solely because the prior
  capture was cancelled.

## UX Design Notes For Operator Cancel

The operator UI should be honest about the difference between cancel intent and
runtime interruption.

Recommended copy model:

- Pending row: "Cancel queued capture"
- Processing row, cooperative-only baseline: "Request cancel"
- Processing row, true-abort v1: "Cancel capture" with a transient state like
  "Stopping browser work..."
- Completed/failed rows: no cancel action.

State model:

- `pending`: cancel should be immediate because no browser work has started.
- `processing`: cancel sends a durable DB cancel request and attempts runtime
  abort when local job ownership is found.
- `failed` with operator metadata: display as "Cancelled" or "Stopped by
  operator" instead of generic failure if product wants clearer history.

UX constraints:

- Do not imply instant stop if serverless ownership is best effort.
- Avoid destructive cleanup language. The first gate should not promise storage
  deletion.
- Keep active-row refresh/polling after cancel so operators can see the final
  settled state.
- If true abort is not possible in the active instance, show cancel as accepted
  because DB final-write guards still apply.

## Blocked Production And Capture Steps

The following are explicitly blocked for this docs-only gate:

- Production capture execution.
- Local or remote screenshot capture.
- Upload to Supabase Storage or any other storage backend.
- Storage cleanup or deletion.
- Database schema migration or row mutation.
- Golden PNG update, promotion, or pixel validation.
- Environment variable edits.
- Browser automation against live publisher, YouTube, Naver, Kakao, or GDN
  pages.
- Operator UI code changes.
- Capture engine code changes.

## Feasibility Decision

True abort is feasible as a best-effort runtime improvement, but it cannot be a
hard distributed guarantee while capture execution remains inside serverless
request/after callbacks with in-memory browser ownership.

Recommended interpretation:

- Cooperative cancel remains the product baseline and durable safety contract.
- True abort v1 can reduce wasted time and memory when the cancel request lands
  on the same warm instance.
- The design should be presented as "best-effort runtime abort plus durable
  cooperative cancel", not as guaranteed process kill.
- Full hard-cancel semantics would likely require a durable worker model with
  externally addressable jobs, leases, heartbeats, and owned cleanup.

## Next Gate Proposal

Lens-Ops-3 should be an implementation design spike, not a broad product change.

Proposed Lens-Ops-3 scope:

- Add a non-production abort registry and capture execution context behind a
  narrow internal API.
- Add fake engine/page tests for abort checkpoints.
- Add metadata classification for operator-cancelled rows.
- Add abort-aware sleeps for Lens-owned waits.
- Do not run production captures, do not change golden PNGs, and do not add
  storage cleanup yet.

Exit criteria:

- Cooperative cancel still passes existing checks.
- Fake engine proves page close and write suppression on abort.
- Batch behavior is documented for one cancelled row followed by another row.
- Product owner accepts the wording "best-effort true abort" for serverless v1.

## Validation For This Docs Gate

Required commands for this docs-only gate:

- `git diff --check`
- `npm run check:surface-registry`
- `npm run check:capture-metadata`
- `npm run verify:harness`

No capture, upload, cleanup, DB mutation, environment mutation, asset mutation,
or golden PNG mutation is part of this validation.

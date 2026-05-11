# Lens Ops 6 Capture Abort UX Next-Step Design Plan v1

Date: 2026-05-11

## Status

Plan only. No implementation in this gate.

This gate follows the route-level abort-control work and the production-safe
no-session smoke. The next step is a user-facing cancel/stop UX plan that makes
the existing backend behavior understandable to operators without promising a
distributed hard kill.

## Scope

This document plans the next operator UX gate for capture cancel and batch stop.

Ownership for this gate is docs-only:

- Created this plan file only under `docs/tasks`.
- No product code, capture code, assets, golden PNGs, environment files,
  database schema, storage objects, capture runs, browser sessions, uploads, or
  cleanup jobs were changed or executed.

## Current Backend Status

Route-level cancel and abort controls are already implemented.

Durable cancel:

- `PATCH /api/captures` accepts `action: "cancel"` with capture ids.
- It durably marks matching `pending` or `processing` rows using the existing
  cancel message: `사용자가 캡처를 중단했습니다.`
- The durable row update remains the source of truth because it works even when
  the cancel request lands on a different serverless instance than the one that
  owns active browser work.

Best-effort runtime abort:

- `captureRouteAbortRegistry` is shared by the capture routes in the current
  runtime.
- Active background batch work registers through
  `runWithCaptureAbortRegistration`.
- Manual execute work in `POST /api/captures/execute` also registers through the
  same abort registry path.
- Processing-row cancel calls `requestAbort` after durable cancel succeeds.
- A registry hit aborts the active `AbortController` and requests page close
  when a page handle has been attached.
- A registry miss is expected in serverless and must be treated as accepted
  durable cancel, not a UX failure.

Write guards:

- Capture execution calls `throwIfAborted` at route checkpoints.
- `persistCaptureResultWithAbortGuard` can skip persistence before upload or
  after upload if the abort signal is observed.
- Existing DB status guards still prevent late completion writes after a row is
  no longer active.

Current UI baseline:

- Active rows can be cancelled from the capture list and the detail modal.
- There is not yet a fuller user-facing distinction between "cancel request
  accepted", "runtime stop attempted", and "settled as canceled".
- There is not yet a global "stop this active batch" control.

## UX Principle

The UX should be honest and calm:

- A pending row can be cancelled before browser work starts.
- A processing row can accept a durable cancel request and attempt same-runtime
  browser stop.
- The UI should not claim instant termination because same-runtime abort is
  best effort.
- Cancel should feel reversible only before confirmation is sent. After the
  request is accepted, the operator should see progress toward a settled
  canceled state.
- Delete/cleanup language must stay separate from cancel. Cancel does not mean
  storage cleanup.

## State Model

The user-facing design should support these display states even if the first UX
iteration derives some states from existing fields.

- `pending`
  - Persisted row status today.
  - Meaning: queued and not yet owned by browser execution.
  - Primary action: cancel queued capture.

- `processing`
  - Persisted row status today.
  - Meaning: active or recently active execution.
  - Primary action: request cancel and attempt runtime stop.

- `cancel-requested`
  - Proposed UI display state.
  - May be derived from local button state immediately after the PATCH request,
    and later from metadata if backend adds an explicit marker.
  - Meaning: durable cancel request is being sent or has been accepted, but the
    list has not refreshed to a terminal state yet.
  - Primary action: disabled, with polling still active.

- `canceled`
  - Proposed user-facing display state.
  - Today it should be derived from `status = failed` plus the known
    user-cancelled error message.
  - Later it may become a first-class metadata code or DB status if approved.
  - Meaning: operator stopped the row; do not count as a site/runtime failure.

- `failed`
  - Existing terminal status.
  - Meaning: non-operator failure such as timeout, blocked host, browser
    session close, invalid input, or storage failure.
  - Primary action: inspect, retry when a retry UX exists, or delete only under
    existing delete policy.

- `completed`
  - Existing terminal status.
  - Meaning: output has been written and row completed.
  - Primary action: inspect/download/copy. No cancel action.

## Batch Item Cancel Placement Candidates

Candidate A: row action, current direction

- Keep the active-row cancel button in the capture history row.
- Label pending rows as `대기 취소`.
- Label processing rows as `캡처 중단`.
- Disabled label while sending: `중단 요청 중...`
- Benefit: closest to the affected item.
- Risk: row density and accidental clicks in a busy operator table.

Candidate B: detail modal action, current direction

- Keep the cancel action in the detail modal preview empty/loading state and in
  the side action area.
- Label pending rows as `대기 취소`.
- Label processing rows as `캡처 중단`.
- Add one-line helper copy near the loading state for processing rows:
  `중단 요청 후에도 현재 브라우저 작업이 잠시 이어질 수 있습니다.`
- Benefit: safer for high-intent cancellation.
- Risk: too hidden for a stuck active row if the operator is scanning the list.

Candidate C: split primary and overflow

- Keep row action visible for `pending`.
- Move `processing` cancel to a row overflow or confirmation popover.
- Benefit: reduces accidental processing abort.
- Risk: slower when a host is visibly stuck.

Recommendation:

- Use Candidate A plus Candidate B for v1.
- Add confirmation only for the future global batch stop action, not for single
  row cancel, unless operator feedback shows accidental cancels.
- Make terminal `canceled` rows visually distinct from generic failures.

## Global Batch Stop Placement Candidates

Candidate A: active-count toolbar control

- Place a stop control near the active count in the capture list toolbar.
- Label: `배치 중단`
- Enabled only when there is at least one `pending` or `processing` row in the
  current result set.
- Confirmation title: `진행 중인 배치를 중단할까요?`
- Confirmation body:
  `대기 중인 캡처는 취소되고, 처리 중인 캡처는 중단을 요청합니다. 이미 완료된 캡처는 유지됩니다.`
- Benefit: visible and tied to queue state.
- Risk: current list limit/filter may not include every active row unless the
  API supports a scoped batch id or active ids query.

Candidate B: submit panel follow-up control

- After batch creation, show a transient active-batch strip in the form/result
  area with `배치 중단`.
- Benefit: scopes the action to the just-submitted batch.
- Risk: less useful after navigation, refresh, or multiple batches.

Candidate C: status filter action

- Add a control inside an `active` filter view.
- Benefit: reduces accidental stop across completed history.
- Risk: requires an active filter concept that is not central today.

Recommendation:

- Do not ship a broad global stop until backend scope is explicit.
- First backend-supported UX should stop a known batch id or a returned set of
  active ids from the latest submitted batch.
- If no batch id exists, the safer v1 is `현재 표시된 대기/처리 항목 중단` with
  exact count and explicit confirmation.
- Confirmation must state that completed rows are not affected and that
  processing browser work may stop best-effort.

## Proposed Copy

Status labels:

- `pending`: `대기중`
- `processing`: `처리중`
- `cancel-requested`: `중단 요청됨`
- `canceled`: `중단됨`
- `failed`: `실패`
- `completed`: `완료`

Row/detail actions:

- Pending action: `대기 취소`
- Processing action: `캡처 중단`
- Sending state: `중단 요청 중...`
- Disabled after accepted: `중단 처리 중`
- Settled canceled message: `사용자가 캡처를 중단했습니다.`

Processing helper copy:

- `중단 요청 후에도 현재 브라우저 작업이 잠시 이어질 수 있습니다.`
- `완료 저장 전 상태를 다시 확인합니다.`

Global stop copy:

- Button: `배치 중단`
- Confirmation title: `진행 중인 배치를 중단할까요?`
- Confirmation body:
  `대기 중인 캡처는 취소되고, 처리 중인 캡처는 중단을 요청합니다. 이미 완료된 캡처는 유지됩니다.`
- Confirm button: `배치 중단 요청`
- Cancel button: `계속 진행`
- Success toast: `중단 요청을 보냈습니다. 목록이 갱신되면 최종 상태를 확인할 수 있습니다.`
- Partial success toast:
  `일부 항목만 중단 요청이 접수되었습니다. 최신 상태를 다시 불러옵니다.`

Error copy:

- Auth expired: use the existing Lens auth-expired behavior.
- No active rows: `중단 가능한 대기/처리 중 캡처가 없습니다.`
- Network failure: `중단 요청을 보내지 못했습니다. 연결 상태를 확인한 뒤 다시 시도하세요.`
- Registry miss should not be shown as an error.

## Accessibility Requirements

- Every cancel/stop button needs a specific accessible label:
  - Pending row: `대기 중인 캡처 취소`
  - Processing row: `처리 중인 캡처 중단`
  - Global: `현재 배치 중단`
- Do not rely only on red color. Pair color with label text and status icon.
- Use `aria-busy` or disabled state while the PATCH request is in flight.
- Use a polite live region for state changes such as `중단 요청됨` and
  `중단됨`.
- Keyboard flow:
  - Row button reachable by Tab.
  - Confirmation dialog traps focus while open.
  - Escape closes confirmation without sending stop.
  - Confirm button is not focused by default for global stop; focus the cancel
    button or dialog title first.
- Button dimensions should remain stable while labels change from idle to
  sending.
- Reduced-motion users should not need spinner animation to understand state.
- Detail modal cancel controls should not duplicate announcements in a noisy
  way when the same row state updates from polling.

## Race Conditions To Handle

Cancel after completion:

- The row may complete between list render and PATCH.
- Backend should return zero cancellable rows or leave the completed row
  unchanged.
- UI should refresh and show `completed`, not show an error toast by default.

Cancel after failure:

- The row may fail before the PATCH lands.
- UI should refresh and show the real failure unless it matches the operator
  cancel marker.

Double-click or duplicate cancel:

- UI should disable the row action while a request is in flight.
- Backend id normalization already dedupes ids.
- Repeated accepted cancel should be harmless.

Processing cancel with registry miss:

- Durable cancel can succeed while runtime abort misses.
- UI should show accepted cancel and continue polling.
- Do not expose "runtime miss" to operators as a failure.

Abort after upload but before completion:

- The guard can skip completion after an upload.
- UX must not promise that cancel deletes generated objects.
- A later audited orphan-cleanup policy should own storage cleanup.

Batch stop across filters:

- If the operator is filtering history, the visible active count may not equal
  all active rows.
- Global stop must say whether it affects visible rows, latest batch rows, or a
  backend batch id.

Stale local `cancel-requested` state:

- A local in-flight state can outlive the row if polling replaces it.
- UI should key in-flight cancel by capture id and clear it on any terminal
  state.

Next-row continuation:

- Cancelling one processing row must not visually imply the entire batch is
  stopped unless the operator used the global batch stop action.
- Batch item cancel and global batch stop need separate copy and telemetry.

## Verification Plan

Docs gate validation:

- `git diff --check -- docs/tasks/2026-05-11_lens_ops_6_capture_abort_ux_next_step_design_plan_v1.md`
- `npm run verify:harness`, only because it is static/local harness validation
  and does not run capture, browser, upload, cleanup, assets, or golden
  generation.

Future implementation gate, non-live:

- Unit-test display-state mapping:
  - `pending`
  - `processing`
  - local `cancel-requested`
  - `failed` plus user-cancelled message displays as `canceled`
  - ordinary `failed` remains failed
  - `completed` hides cancel controls
- Component-test row cancel disabled/loading behavior.
- Component-test detail modal cancel behavior.
- Component-test global stop confirmation copy and focus behavior.
- Mock `PATCH /api/captures` success, zero-cancel response, auth-required
  response, and network failure.
- Verify no cancel UI calls `DELETE /api/captures` or cleanup routines.
- Verify active polling refresh clears stale local cancelling state.

Future safe deployment gate:

- Repeat no-session page/API smoke before any authenticated operation.
- Confirm protected cancel endpoints still fail closed without a session.
- Do not run capture in this gate.

## Human-Gated Live Capture Proof

Live proof is explicitly not part of this plan gate.

Before any live authenticated capture proof, a human operator must approve all
of the following:

- Environment: local, staging, preview, or production.
- Account/session to use.
- Exact disposable batch or capture rows, or exact method for creating them.
- Whether live capture execution is allowed.
- Whether uploads may be created.
- Whether global batch stop may target more than one active row.
- Whether storage cleanup may be performed, and who owns it.
- Rollback owner and communication channel.

Approved live proof should be narrow:

- Start with pending-row cancel without browser execution.
- Then test one processing row only in a controlled local or staging fixture.
- Only after that, test a two-row batch where the first row is cancelled and
  the second row continues.
- Treat runtime registry miss as expected unless the test explicitly controls
  same-process ownership.
- Stop before production publisher capture or Browserbase remote-session proof
  unless separately approved by name.

Evidence boundaries:

- Record status, counts, and sanitized public copy only.
- Do not record passwords, cookies, tokens, auth headers, signed URLs, full
  storage paths, raw production rows, customer/account ids, browser traces, HAR
  files, screenshots of authenticated product data, or provider raw responses.

## Related Queue Observation

The user-observed slow media and duplicate-looking entries should be handled in
a separate queue from cancel UX.

- Slow hosts such as Donga / Dong-A belong to host timeout and capture budget
  policy.
- Duplicate YNA-like entries belong to input normalization, request-level
  dedupe, and history interpretation.
- These issues can make the need for cancel more visible, but they should not
  be mixed into the cancel UX gate.
- Cancel UX should not carry host-specific timeout rules, media-source dedupe
  policy, or publisher-specific capture heuristics.

Recommended separate follow-up queue:

- Input dedupe and canonicalization policy for publisher URLs.
- Host timeout policy for slow media.
- Operator-visible history grouping or batch id display so prior rows are not
  mistaken for duplicate rows from the current request.

## No-Touch Boundaries

This plan does not authorize:

- Capture execution.
- Browser automation.
- Browserbase session creation or termination.
- Upload.
- Storage cleanup or deletion.
- DB/Auth mutation.
- Schema changes or new status enum.
- Golden PNG generation, promotion, or pixel validation.
- Asset/golden updates.
- Product code changes.
- Production authenticated workflows.
- Running cleanup scripts.

## Exit Criteria For Next UX Gate

The next implementation gate is ready only when:

- Product accepts the display distinction between `cancel-requested`,
  `canceled`, and generic `failed`.
- Backend scope for global stop is chosen: latest batch id, visible active ids,
  or explicit selected ids.
- Copy is approved in Korean for row cancel, detail cancel, and global stop.
- Accessibility behaviors are covered by component tests or manual checklist.
- No implementation plan requires capture runs, uploads, cleanup, asset
  mutation, or golden generation.

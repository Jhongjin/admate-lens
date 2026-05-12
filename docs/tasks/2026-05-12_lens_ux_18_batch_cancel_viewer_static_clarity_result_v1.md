# Lens UX 18 Batch Cancel Viewer Static Clarity Result v1

Date: 2026-05-12
Repo: admate-lens
Status: implemented locally

## Scope

Implemented a static/UI clarity pass for Lens capture operations without changing capture engine execution, API payload shape, storage, DB, auth, upload/delete behavior, golden PNGs, or evidence artifacts.

Changed files:

- `src/app/components/CaptureForm.tsx`
- `src/app/components/CaptureList.tsx`

## Outcome

- Batch URL dedupe is now summarized through a small local helper that keeps the submitted count, deduped URL list, and duplicate count together.
- The success toast now distinguishes same-batch duplicate removal from older history visibility.
- Custom publisher helper copy now says same-batch identical URLs are requested once.
- Selected publisher chips are constrained with `max-w-full`, `min-w-0`, and `truncate` to prevent long labels from stretching the form.
- Capture history now says it is the latest 30-record history view and warns that same-publisher rows are not automatically current-batch duplicates.
- The active rendering card now clarifies that new batches and older history are displayed together.
- Processing cancel controls now use `중단 요청` wording and helper text states
  that the current browser work can briefly continue after a stop request.
- Viewer metadata labels now separate internal, copy, and review-only fields:
  - `내부 캡처 ID`
  - `내부 surface`
  - `이미지 URL(복사용)`
  - `저장 경로(내부용)`
  - `내부 검수 점수`
- Mobile/list overflow is statically guarded with stacked mobile rows, nowrap cancel button text, break-all copy fields, and a 2-column mobile action bar that expands to 4 columns on wider screens.

## No-Touch Confirmation

No capture execution, production call, SQL, DB/storage/auth mutation, upload/delete action, golden/evidence PNG generation or replacement, env/secret/session/cookie/token readback, staging, commit, or push was performed by this gate.

## Verification

Planned local checks:

- `npm run lint`
- `npm run verify:harness`
- `npm run verify:offline-smoke`
- `npm run check:capture-batch-guards`
- `git diff --check -- src/app/components/CaptureForm.tsx src/app/components/CaptureList.tsx docs/tasks/2026-05-12_lens_ux_18_batch_cancel_viewer_static_clarity_result_v1.md`

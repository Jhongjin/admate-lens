# Lens GDN Batch Cancel / Dedupe Result v1

Date: 2026-05-11

## Scope

This gate responded to a live GDN batch observation:

- One GDN publisher was taking too long in `processing`.
- A publisher appeared twice in the history view.
- Operators need a visible way to stop queued or long-running capture rows.

This gate changed only Lens operator UI and capture API control flow. It did not
modify capture engine rendering, GDN injection logic, composite logic, storage
policy, DB schema, environment variables, or golden/image assets.

## Implemented

- Server-side publisher URL dedupe before capture row creation.
- Client-side publisher URL dedupe before submitting capture requests.
- `PATCH /api/captures` cancel action for `pending` and `processing` rows.
- Capture history row action button for active rows.
- Capture detail modal cancel action for active rows.
- Batch execution status re-check after `channel.execute` returns and before
  storage upload / completed update.
- Failure update guard so user-cancelled rows are not overwritten by later
  runtime errors.
- The explicit `/api/captures/execute` path received the same completion/failure
  overwrite guards.

## Cancellation Semantics

No new DB enum/status was introduced. A cancelled active row is represented as:

- `status = failed`
- `error_message = 사용자가 캡처를 중단했습니다.`

This is intentionally schema-safe.

For `pending` rows, cancellation prevents the row from being picked up by the
batch loop because the loop already skips non-pending rows.

For `processing` rows, this is cooperative cancellation. It does not forcibly
kill an already-running Chromium/page task from a later HTTP request. Instead,
the batch loop re-checks row status after execution returns and before writing
final artifacts or `completed`.

## Duplicate Note

The observed duplicate-looking publisher in the UI may include a previous
history item from an earlier date, not necessarily two rows from the same batch.
This gate still adds server-side normalized URL dedupe so repeated URLs in a
single request cannot create duplicate pending rows.

## No-Touch Confirmation

This gate did not perform:

- Login attempt
- Capture execution
- Upload
- Storage object deletion or cleanup
- DB/schema migration
- Environment variable changes
- Golden PNG / product asset creation or modification
- Production API call

No password, token, cookie, signed URL, raw provider response, or full storage
path was recorded.

## Verification

Passed:

- `npx tsc --noEmit`
- `npm run build`
- `npm run verify:harness`
- `npm run check:surface-registry`
- `npm run check:capture-metadata`
- `git diff --check -- src/app/api/captures/route.ts src/app/api/captures/execute/route.ts src/app/components/CaptureList.tsx src/app/components/CaptureForm.tsx`

## Remaining Risk

Hard cancellation of an already-running browser task still needs a deeper job
registry / abort-signal design. The current change is the safe MVP: stop queued
rows and prevent active rows from being overwritten as completed after the user
requests cancellation.

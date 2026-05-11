# Lens Ops 10 Batch Guard Post-Deploy Static Verification Result v1

Date: 2026-05-12

## Status

PASS for local/static verification.

This result covers the batch guard commit that was pushed to `main`:

- `0584b72 fix: guard Lens batch publisher duplicates`

No production smoke was executed in this gate because authenticated batch proof
would create capture rows and may create storage objects.

## Scope

This was a docs-only post-deploy verification handoff plus local static checks.

No new capture, upload, database/storage cleanup, browser session, golden/product
asset change, fixture promotion, or production mutation was performed.

## Local Verification

Run from `D:\Projects\AdMate\admate-lens` at HEAD `0584b72`.

- `npm run check:capture-batch-guards`
  - PASS
  - observed: `[batch-execution-guards] ok`
  - observed: `[check-capture-batch-guards] ok`
- `npm run check:surface-registry`
  - PASS
  - observed: `[check-surface-registry] ok (16 surface tokens, 2 legacy mappings, 10 youtube types)`
- `npm run check:capture-metadata`
  - PASS
  - observed: `[check-capture-output-metadata] ok (2 records)`
- `npm run verify:harness`
  - PASS
  - observed: surface registry and capture metadata checks both passed
- `git diff --check`
  - PASS before this docs edit

## Duplicate Publisher Expected Behavior

Publisher URL dedupe now uses the shared capture source key helper for both
creation-time and execution-time protection.

Expected behavior:

- Bare publisher hosts are treated as HTTPS canonical keys.
- Scheme and host casing fold together.
- Empty root path and `/` match.
- Non-root trailing slashes are removed.
- Default HTTP(S) ports are not distinct from their default scheme.
- Mobile and desktop hosts remain separate capture sources.
- Creation-time dedupe prevents duplicate publisher URLs from producing multiple
  rows in the same submitted batch.
- Execution-time dedupe remains as a second guard for rows that reach execution
  through older paths, manual paths, or future callers.
- Execution-time duplicate handling is scoped to the current execution list, not
  global history.
- Later duplicate rows should be skipped/failed with the duplicate message:
  `중복 요청으로 이번 배치에서 캡처를 건너뛰었습니다.`

## Donga Slow-Host Expected Behavior

Donga / Dong-A hosts remain allowed, but are treated as known slow GDN batch
hosts when the batch budget is already too low.

Expected behavior:

- Applies only to multi-row GDN batch execution.
- Applies to `donga.com`, `www.donga.com`, and `m.donga.com`.
- Does not apply to non-GDN captures or single-row attempts.
- Checks remaining per-capture budget before browser work starts.
- Requires at least the larger of 45 seconds or the host navigation timeout plus
  a 10 second persistence margin.
- If the remaining budget is below that threshold, the host is skipped before
  starting capture work.
- Slow-host skip should use the operator message:
  `느린 GDN 사이트는 남은 배치 시간이 부족해 캡처를 시작하지 않았습니다. 사이트를 나눠 다시 실행해 주세요.`
- The guard does not introduce hard browser cancellation or in-flight navigation
  termination.

## Safe Production Smoke Requirements

A no-touch production smoke can only confirm deployed route/auth posture. It
cannot prove the duplicate publisher or Donga budget behavior end to end.

Permitted no-touch smoke, with separate operator approval:

- Confirm the deployed commit or deployment label for `0584b72`.
- No-session `GET /` and `GET /login` checks.
- No-session API checks that remain fail-closed with `401 auth_required`.
- No login, no valid capture id, no upload body, no cancel of real rows.

True batch guard proof would require a separate human-approved mutation gate:

- Confirm account/session owner.
- Confirm exact publisher URLs and whether Donga is run alone or in a small
  batch.
- Confirm expected capture row creation, storage object creation, and cleanup
  owner before execution.
- Confirm whether duplicate pre-insert rows are response-only or persisted as
  skipped history.
- Record only sanitized ids/statuses; do not record credentials, cookies, signed
  URLs, raw provider responses, full storage paths, or product secrets.

Until that gate is approved, production batch behavior remains validated only by
local/static checks and code-level guard coverage.

## No-Touch Confirmation

This gate did not perform:

- Capture execution.
- Browser automation or browser session creation.
- Upload.
- Database, auth, or storage mutation.
- Cleanup or delete.
- Golden PNG generation, promotion, or pixel validation.
- Product asset changes.
- Production authenticated workflows.

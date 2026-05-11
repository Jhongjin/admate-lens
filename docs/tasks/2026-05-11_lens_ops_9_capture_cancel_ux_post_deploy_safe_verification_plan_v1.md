# Lens Ops 9 Capture Cancel UX Post-Deploy Safe Verification Plan v1

Date: 2026-05-11

## Status

Plan only. No post-deploy verification was executed in this gate.

This document gates safe verification for:

- `67631f0 fix: improve Lens capture cancel UX`

## Scope

The goal is to verify the deployed capture cancel UX safely after deployment
without starting capture work or mutating production data.

Ownership for this gate is docs-only:

- Created this plan file only under `docs/tasks`.
- No product code, capture code, assets, golden PNGs, environment files,
  database schema, storage objects, capture runs, browser sessions, uploads,
  cleanup jobs, or authenticated workflows were changed or executed.

## Safety Contract

This gate may prove that the deployment is reachable, protected routes fail
closed without a session, and the static UI copy matches the intended cancel UX.

This gate must not prove live cancel behavior by exercising a real capture.
Live authenticated cancel proof is a separate human-gated action because even a
cancel test can touch capture rows and may interact with active browser,
storage, upload, or cleanup behavior.

Explicitly forbidden unless separately approved:

- Live capture creation or execution.
- Browser automation, Browserbase sessions, Chromium sessions, or publisher
  navigation.
- Uploads or screenshot/creative writes.
- DB/Auth mutation, including authenticated cancel against a real row.
- Storage cleanup, deletion, orphan cleanup, or manual bucket inspection.
- Golden generation, golden promotion, golden comparison, or golden cleanup.
- Cleanup scripts, ad hoc cleanup SQL, or retry/repair scripts.

## Safe No-Session Route And API Smoke

Allowed after deploy, using no cookies, no auth headers, and no real ids:

- `GET /`
  - Expected: redirect to `/login` or equivalent unauthenticated guard.
- `GET /login`
  - Expected: public login page renders without operational secrets.
- `GET /api/captures`
  - Expected: `401` or equivalent `auth_required` fail-closed response.
- `PATCH /api/captures` with a dummy UUID and `action: "cancel"`.
  - Expected: `401` or equivalent `auth_required` response.
  - Must not include a real capture id.
- `POST /api/captures/execute` with a dummy UUID.
  - Expected: `401` or equivalent `auth_required` response.
  - Must not include a real capture id.
- `POST /api/upload` with no session and no file payload.
  - Expected: `401` or equivalent `auth_required` response.

Allowed observations:

- HTTP method, route, status code, and sanitized public error code.
- Redirect location only when it has no token or signed URL.
- Public login-page copy.
- Deployment host, branch, and deployed commit SHA.

Do not record cookies, auth headers, tokens, signed URLs, raw production rows,
real capture ids, provider responses, full storage paths, or secret-bearing log
lines.

## UI Static Review Expectations

Static review may inspect the deployed bundle or local source for copy and state
expectations only. It must not log in or use live product data.

Expected visible labels introduced or preserved by `67631f0`:

- `대기 취소`
- `캡처 중단`
- `중단 요청 중...`
- `중단 요청됨`
- `중단됨`

Expected behavior to verify statically:

- Pending active rows use `대기 취소` for the cancel action.
- Processing active rows use `캡처 중단` for the cancel action.
- While the cancel request is in flight, the action is disabled, exposes busy
  state, and uses `중단 요청 중...`.
- The transient status label for an in-flight cancel request is `중단 요청됨`.
- Rows failed with the known user-cancelled message are presented as `중단됨`
  rather than generic capture failure.
- Cancel copy must not imply storage cleanup, upload deletion, or a guaranteed
  distributed hard kill of browser work.

## Human-Gated Authenticated Cancel UX Proof

Authenticated cancel proof is blocked until a human operator explicitly approves
all of the following in writing:

- Environment: local, staging, preview, or production.
- Operator account or service role to use.
- Exact disposable capture row ids, or the approved disposable-row creation
  method.
- Whether capture execution is allowed.
- Whether browser sessions may be started.
- Whether uploads may be created.
- Whether storage cleanup is allowed.
- Cleanup owner and cleanup window.
- Rollback owner and communication channel.
- Evidence boundaries, including whether screenshots are allowed and how
  production identifiers must be redacted.

When approved, the authenticated proof should be limited to the smallest useful
surface:

- Prefer an already disposable `pending` row for `대기 취소` proof.
- Use a `processing` row for `캡처 중단` proof only if browser/capture work is
  explicitly approved.
- Record only sanitized UI labels, high-level state transition shape, and
  approved counts.
- Stop immediately if the flow would require unapproved upload, cleanup,
  storage inspection, browser tracing, HAR capture, or raw row export.

## Rollback Or Hold Criteria

Recommend deploy hold, rollback discussion, or immediate investigation if any
safe no-session check shows:

- A protected API returns `2xx` without a session.
- Dummy no-session cancel reaches mutation logic instead of authentication
  failure.
- No-session execute or upload starts capture work, browser work, or storage
  access.
- Public responses expose stack traces, tokens, signed URLs, storage paths,
  capture ids, account ids, provider details, or environment variable values.
- Static review finds the cancel UX labels missing, swapped between pending and
  processing states, or presenting user-cancelled rows as generic failures.

Do not rollback solely because live runtime abort behavior remains unproved.
That proof requires authenticated capture work and belongs behind the separate
human approval gate.

## Local Validation Required For This Docs Gate

Run before handing off:

- `git diff --check`
- `npm run verify:harness`

Expected result for this docs-only gate:

- Both commands pass.
- The new plan remains unstaged.
- No code, assets, capture artifacts, DB/storage state, uploads, browser runs,
  cleanup, or golden files are touched.

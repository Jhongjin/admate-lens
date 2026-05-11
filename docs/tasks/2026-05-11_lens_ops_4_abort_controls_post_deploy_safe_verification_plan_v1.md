# Lens Ops 4 Abort Controls Post-Deploy Safe Verification Plan

Date: 2026-05-11

## Status

Plan only. No production verification was executed in this gate.

## Scope

This document defines the next safe gate after:

- `9388bd5 feat: wire Lens capture abort controls`

The goal is production-safe and post-deploy verification of the abort-control
surface without exercising live capture side effects.

Ownership for this docs gate:

- Created this plan file only under `docs/tasks`.
- No code, assets, golden PNGs, environment files, database schema, storage
  objects, capture runs, uploads, cleanup jobs, or authenticated production
  workflows were changed or executed.

## Safety Contract

Abort controls now have two layers that must stay separate during verification.

Durable cooperative cancel:

- Existing cancel semantics remain the approved mutation boundary.
- `PATCH /api/captures` with `action: "cancel"` may mark matching
  `pending` or `processing` rows as failed with the existing user-cancelled
  message only when the request is authenticated and authorized.
- This is the only DB mutation that can be considered for later human-approved
  live checks.

Best-effort runtime abort:

- In-memory abort only works for active jobs registered in the same warm
  runtime instance.
- Registry miss is expected in serverless and must not be treated as a product
  failure.
- Runtime abort is a resource-savings improvement, not a distributed hard kill
  guarantee.

Production-safe verification must prove fail-closed behavior and deploy health
first. It must not prove true browser interruption by launching captures.

## Allowed Negative Checks

The next gate may run only checks that are expected to avoid capture execution,
uploads, storage cleanup, and authorized row mutation.

Allowed no-session checks against production or preview:

- `GET /`
  - Expected: redirect to login or equivalent unauthenticated guard.
- `GET /login`
  - Expected: public login page renders without exposing operational secrets.
- `GET /api/captures`
  - Expected: `401` or equivalent `auth_required` fail-closed response.
- `PATCH /api/captures` with a dummy UUID cancel body and no session.
  - Expected: `401` or equivalent `auth_required` response.
  - Must not include a real capture id.
- `POST /api/captures/execute` with a dummy UUID and no session.
  - Expected: `401` or equivalent `auth_required` response.
- `POST /api/upload` with no session and no file payload.
  - Expected: `401` or equivalent `auth_required` response.

Allowed local/static checks:

- `git diff --check`
- `npm run check:abort-registry`
- `npm run verify:harness`
- Read-only inspection of deployed response status, redirect target, and
  sanitized JSON error code/message.

Allowed observations:

- HTTP status code.
- Redirect location when it contains no token or signed URL.
- Sanitized error code such as `auth_required`.
- Sanitized UI copy from public login surfaces.
- Commit SHA, branch name, and deployment URL.

## Blocked Checks Without Human Approval

The following checks are blocked until a human operator explicitly approves the
environment, data target, cleanup owner, and rollback authority.

Blocked capture and browser checks:

- Running a valid authenticated capture flow.
- Creating pending captures through the product UI or API.
- Calling `POST /api/captures` with valid capture input.
- Calling `POST /api/captures/execute` with a real capture id.
- Navigating live publisher, YouTube, Naver, Kakao, Browserbase, or GDN pages
  for a capture.
- Opening local Chromium, Browserbase, or remote browser sessions to prove
  runtime abort.

Blocked mutation checks:

- Authenticated cancel against a real production row unless the row is approved
  as disposable and already in an approved `pending` or `processing` state.
- Any DB mutation outside the existing cancel semantics.
- Manual status updates, retries, row deletion, or schema changes.
- Uploading screenshots or creatives.
- Deleting storage objects, capture folders, or suspected orphan files.
- Running cleanup scripts or ad hoc cleanup queries.

Blocked evidence collection:

- Capturing screenshots of authenticated product data.
- Recording request/response bodies that include row payloads, storage URLs, or
  account data.
- Saving browser traces, HAR files, cookies, session storage, local storage, or
  auth headers.
- Publishing raw logs that include provider responses, full storage paths,
  signed URLs, tokens, cookies, or customer/product identifiers.

## Human Approval Requirements

If a later gate needs live authenticated verification, approval must name all of
the following before any action is taken:

- Environment: local, staging, preview, or production.
- Operator account or service role to use.
- Exact disposable capture row ids or the approved method to create them.
- Whether authenticated capture execution is allowed.
- Whether uploads may be created.
- Whether storage cleanup may be performed.
- Cleanup owner and expected cleanup window.
- Rollback owner and communication channel.

Approval must also state whether the test is validating only durable cancel or
also best-effort runtime abort. Runtime abort validation requires capture work
and therefore is not part of this safe post-deploy gate.

## Sensitive-Output Boundaries

Verification notes may record:

- Sanitized endpoint path, method, status code, and public error code.
- Public login-page copy.
- Deployment URL host only, unless full URL has no secret-bearing query string.
- Commit SHA and package-script validation results.
- Counts from approved cancel responses only when no capture ids are included.

Verification notes must not record:

- Passwords, tokens, cookies, auth headers, session ids, refresh tokens, or
  signed URLs.
- Full storage object paths or bucket paths.
- Raw Supabase rows, account ids, customer ids, creative ids, or capture ids
  from production.
- Raw provider responses, browser traces, HAR files, screenshots of
  authenticated pages, or console output containing secrets.
- Full request bodies for authenticated capture, upload, execute, or cancel
  calls.

When in doubt, record the shape of the result and redact the value.

## Post-Deploy Verification Steps

Recommended safe sequence:

1. Confirm deployed revision.
   - Record the deployed commit SHA if available from deployment metadata.
   - Confirm it is at or after `9388bd5`.

2. Run no-session page guards.
   - Request `/` and `/login`.
   - Confirm unauthenticated users cannot reach the product shell.

3. Run no-session API guards.
   - Request the allowed negative API checks listed above.
   - Confirm each protected route fails closed before route logic can mutate
     captures, launch browsers, upload files, or request abort.

4. Review sanitized server logs only if needed.
   - Look for deploy-time route import errors or repeated 500s.
   - Do not expand or copy secret-bearing log lines.

5. Stop before any valid authenticated flow.
   - Do not log in for this gate.
   - Do not run captures to prove abort behavior.
   - Do not create or clean storage.

## Rollback Criteria

Recommend rollback or immediate deploy hold if any of these occur during
allowed safe checks:

- A no-session protected API returns `2xx` or mutates state.
- A dummy no-session `PATCH /api/captures` reaches cancel logic instead of
  failing authentication.
- A no-session execute or upload request launches browser work, queues capture
  work, or attempts storage access.
- Production route imports fail because abort-control modules are missing,
  server-only incompatible, or throw during initialization.
- Public unauthenticated responses expose stack traces, environment variable
  names with values, storage paths, signed URLs, tokens, cookies, capture ids,
  or provider details.
- Error rates rise after deploy in a way correlated with capture route imports,
  abort registry initialization, or protected API access.

Rollback is not required solely because runtime abort registry hits cannot be
observed from no-session checks. That behavior requires a same-instance active
capture and belongs behind a human-approved live gate.

## Exit Criteria For This Safe Gate

The safe post-deploy gate passes when:

- Deployed revision is confirmed at or after `9388bd5`.
- Public login and unauthenticated page routing behave as expected.
- No-session capture, cancel, execute, and upload APIs fail closed.
- No allowed check creates captures, runs browsers, uploads files, cleans
  storage, or mutates DB state.
- Sanitized logs show no route import crash or secret exposure.
- Local validations pass:
  - `git diff --check`
  - `npm run check:abort-registry`
  - `npm run verify:harness`

## Next Gate Recommendation

Recommended next gate: human-approved authenticated disposable-row cancel
verification in a non-production or preview environment.

That gate should validate durable cancel semantics before runtime abort:

- Use pre-approved disposable rows only.
- First test pending-row cancel without starting capture execution.
- Then, only with explicit approval, test processing-row cancel in a controlled
  local or staging fixture.
- Treat registry miss as expected unless the test explicitly controls same
  process ownership.
- Continue to block production publisher captures, uploads, Browserbase remote
  abort, storage cleanup, and authenticated production flows until each is
  approved by name.

Do not advance to production runtime-abort proof until the disposable-row gate
shows that durable cancel semantics remain unchanged and no unauthorized write
paths were introduced.

## Validation For This Docs Gate

Required commands for this docs-only gate:

- `git diff --check -- docs/tasks/2026-05-11_lens_ops_4_abort_controls_post_deploy_safe_verification_plan_v1.md`
- `npm run check:abort-registry`
- `npm run verify:harness`

No capture, upload, cleanup, DB mutation, environment mutation, asset mutation,
golden PNG mutation, login, or valid authenticated capture flow is part of this
validation.

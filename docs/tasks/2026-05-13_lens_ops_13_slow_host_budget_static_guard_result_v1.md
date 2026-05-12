# Lens Ops 13 Slow Host Budget Static Guard Result v1

Date: 2026-05-13
Repo: admate-lens
Status: implemented locally

## Scope

Added offline/static guard coverage for the long-running GDN host policy that
matters after recent golden, fixture, and offline harness guard work.

Changed files:

- `scripts/check-capture-batch-guards.mjs`
- `tests/capture/batch-execution-guards.test.ts`
- `docs/tasks/2026-05-13_lens_ops_13_slow_host_budget_static_guard_result_v1.md`

## Result

The batch guard now locks the Donga slow-host policy as a skip-before-start
budget guard, not a capture cancellation path:

- Donga host aliases remain classified as slow GDN batch hosts.
- Non-GDN channels and non-slow hosts are not caught by the slow-host guard.
- Mobile Donga budget behavior is covered by local assertions.
- Slow-host operator copy must say that capture was not started and must not
  use cancel/abort wording.
- The capture route must keep the slow-host budget guard before processing,
  browser work, and Browserbase fallback decisions.
- Slow-host skips must remain pending-row guarded failures with the existing
  `slow_gdn_host_batch_time_guard` failure code.

## Recommendation

This is the next safe non-human-gated queue because it improves confidence
around the reported long-running Donga behavior without running capture,
changing runtime payloads, or requiring browser approval. The next human-gated
step is a deliberate live/local capture smoke or authenticated operator review
of the slow-host display, if approved.

## No-Touch Confirmation

No live capture execution, browser automation, upload/delete, DB/storage access
or mutation, asset/golden PNG generation or replacement, golden promotion,
pixel diff, env/secret/cookie/token readback, staging, commit, or push was
performed.

## Verification Results

Local checks run:

- `npm run check:capture-batch-guards`
- `npm run verify:offline-smoke`
- `npm run verify:harness`
- `git diff --check -- scripts/check-capture-batch-guards.mjs tests/capture/batch-execution-guards.test.ts docs/tasks/2026-05-13_lens_ops_13_slow_host_budget_static_guard_result_v1.md`


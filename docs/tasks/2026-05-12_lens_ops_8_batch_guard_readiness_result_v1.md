# Lens Ops 8 Batch Guard Readiness Result v1

Date: 2026-05-12

## Status

Implemented a local/static readiness gate.

## Scope

This gate focused on publisher URL dedupe and slow-host batch timeout behavior.

Changed paths:

- `src/lib/capture/batch-execution-guards.ts`
- `src/app/api/captures/route.ts`
- `tests/capture/batch-execution-guards.test.ts`
- `scripts/check-capture-batch-guards.mjs`
- `package.json`
- `docs/tasks/2026-05-12_lens_ops_8_batch_guard_readiness_result_v1.md`

No capture runs, uploads, DB/storage cleanup, browser sessions, golden PNG
generation, fixture promotion, or product/golden asset edits were performed.

## Behavior Guarded

Publisher URL source keys now share the same canonical helper for creation-time
dedupe and execution-time dedupe.

The local check covers:

- Bare publisher host becomes an HTTPS canonical key.
- Scheme and hostname casing fold together.
- Empty root path and `/` match.
- Non-root trailing slashes are removed.
- Default HTTPS port is not treated as a distinct publisher URL.
- Mobile and desktop publisher hosts stay separate.
- Known Donga slow-host batch skip only triggers for multi-row GDN batches when
  the remaining per-capture budget is below the host threshold.

The slow-host gate remains skip-before-start. It does not introduce true
in-flight browser abort or hard cancellation.

## Verification

Run:

- `npm run check:capture-batch-guards`
- `npm run check:surface-registry`
- `npm run check:capture-metadata`
- `npm run verify:harness`
- `npx tsc --noEmit`
- `git diff --check`

Production capture proof remains deferred until separately approved.

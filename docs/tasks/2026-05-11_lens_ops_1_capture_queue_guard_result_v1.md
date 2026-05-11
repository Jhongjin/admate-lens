# Lens Ops 1 Capture Queue Guard Result

Date: 2026-05-11

## Status

Pass.

## Scope

This gate added a minimal server-side queue guard for Lens capture operations.

Changed code paths:

- `src/lib/capture/batch-execution-guards.ts`
- `src/app/api/captures/route.ts`
- `src/app/api/captures/execute/route.ts`

No operator UI files were changed in this gate.

## Behavior

### Duplicate Source URL Guard

Batch execution now keeps an in-memory set of pending source URL keys for the
current execution pass.

If a later pending row in the same execution pass has the same normalized source
URL key, Lens marks that row as failed with:

`중복 요청으로 이번 배치에서 캡처를 건너뛰었습니다.`

The row is not deleted. The first pending row remains eligible for capture.

The failure metadata records a redacted reason:

- `failureCategory: validation`
- `failureCode: duplicate_source_url_in_batch`
- `duplicateSourceSkipped: true`

It does not store a duplicate raw source URL in metadata.

### Slow GDN Host Batch Guard

Known slow GDN hosts can be skipped before Chromium work starts when the request
is part of a multi-row batch and the remaining per-capture budget is too low for
that host's existing GDN timeout policy.

The first guarded host is:

- `donga.com`
- `www.donga.com`
- `m.donga.com`

The failed row message is:

`느린 GDN 사이트는 남은 배치 시간이 부족해 캡처를 시작하지 않았습니다. 사이트를 나눠 다시 실행해 주세요.`

This is a preflight queue guard only. It does not alter GDN rendering, slot
detection, injection, screenshot composition, or product output fidelity.

## Existing Cancel UX

Lens already has an operator cancel action for pending/processing rows.

This gate did not change that UI. Current cancel behavior remains cooperative:
it updates row state so later result writes are skipped, but it does not yet
propagate a true abort signal into an already running Chromium capture.

A true in-flight abort/cancel design should remain a later gate.

## No-Touch Areas

This gate did not perform:

- production capture execution
- upload
- DB/schema migration
- storage cleanup
- environment changes
- source capture rendering changes
- operator UI redesign
- asset/golden PNG changes

No secret, token, cookie, session, signed URL, raw provider response, or product
credential was read or printed.

## Validation

Passed:

- `npm run check:surface-registry`
- `npm run check:capture-metadata`
- `npx tsc --noEmit`
- `npm run verify:harness`
- `git diff --check`

## Next Recommended Gate

Gate Lens-Ops-2 operator cancel UX and true abort feasibility.

The next gate should decide whether to keep cooperative cancel only, add clearer
UI copy, or introduce AbortController-style cancellation through the capture
engine boundary.

# Lens GDN Donga Slow Host Triage Result v1

Date: 2026-05-11

## Scope

This note records the follow-up from an authenticated GDN batch observation where
`https://www.donga.com/` stayed in processing for longer than the surrounding
publishers.

No new capture, upload, storage cleanup, DB cleanup, asset generation, golden PNG
update, or production API mutation was performed in this gate.

## Observation

- Batch GDN execution used fast mode.
- `https://www.yna.co.kr/`, `https://www.chosun.com/`, and
  `https://www.joongang.co.kr/` produced completed rows.
- `https://www.donga.com/` remained processing while later/pending rows were still
  visible.
- The visible duplicate `yna.co.kr` row was interpreted as current history plus an
  older prior history row, not necessarily a duplicate created by the current
  request.

## Read-Only Findings

- Donga already had host-specific slot priority, slot narrowing, and target-centered
  viewport screenshot policy.
- Batch fast mode already forces lightweight lazy handling, so the observed delay is
  more likely in page navigation / host load timing than in full-page screenshot.
- Non-batch Donga captures could still use full lazy restoration before this patch.
- Batch relaxed navigation used the generic 60 second page-load timeout, while the
  batch wrapper had a lower per-capture budget. This could allow a slow Donga
  navigation to consume most of the current capture budget before the next row can
  proceed.

## Change

Implemented a Donga-only latency guard:

- `getGdnLazyLoadMode()` now returns `light` for Donga hosts.
- Added `getGdnGotoTimeoutMs()` host policy.
- Donga batch relaxed navigation timeout is capped at 35 seconds.
- Donga non-batch relaxed navigation timeout is capped at 35 seconds.
- Donga non-relaxed navigation timeout is capped at 35 seconds for PC and 42 seconds
  for mobile.

The change is host-scoped and does not alter capture engine, upload, storage signing,
DB schema, assets, or golden PNGs.

## Cancel Behavior Context

The prior cancel-control patch remains cooperative:

- pending rows can be skipped before execution,
- processing rows can be marked failed by user cancellation,
- a completed update is skipped if a row was cancelled while the browser task was
  still running.

It does not forcibly terminate an already-running Chromium navigation from a later
HTTP request.

## Verification Plan

Run local static/build checks only:

- `git diff --check`
- `npm run check:surface-registry`
- `npm run check:capture-metadata`
- `npm run verify:harness`
- `npx tsc --noEmit`
- `npm run build`
- `npm run check:secrets --if-present`

Production capture smoke is intentionally deferred because it would create new capture
rows and storage objects.

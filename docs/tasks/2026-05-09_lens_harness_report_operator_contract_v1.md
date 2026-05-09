# Lens Harness Report Operator Contract v1

Date: 2026-05-09

## Status

Gate Lens-Harness-Report-Docs-1 is docs-only and records the operator contract for `npm run harness:report`.

## Scope

`harness:report` is an offline health summary for the Lens QA harness. It is intended as a low-risk pre-queue check before later visual QA, golden sample approval, or capture workflow work.

The command runs:

- `npm run verify:harness`
- `npm run check:golden-manifest`
- `npm run check:golden-metadata`
- `npm run check:golden-dimensions`

It intentionally does not run:

- capture execution
- upload flows
- login or session flows
- DB or storage writes
- cleanup or delete operations
- golden PNG or product asset creation
- pixel diff artifact generation

## Golden Sample Contract

Current golden manifests remain placeholder-driven. The report treats `pending-sample` manifests as expected placeholders and does not require PNG files for them.

At the time of this gate, the report output is expected to show six golden manifests with `pending-sample` state. Golden dimensions should skip pending samples rather than requiring image files.

`npm run verify:golden` remains a separate command. It includes `check:golden-pixels`, which is intentionally outside `harness:report` because approved samples can introduce local diff PNG or JSON artifact expectations.

## Operator Use

Use `harness:report` when the next queue needs a quick Lens health snapshot without touching production data or capture assets.

Recommended before:

- authenticated visual QA planning
- golden sample intake planning
- capture metadata or surface registry changes
- QA closure docs that need an offline evidence summary

Do not use it as approval to:

- execute a capture
- upload a file
- mutate DB or storage
- approve or replace a golden PNG
- generate diff artifacts

## Verification

Run:

```text
npm run harness:report
npm run verify:harness
npm run check:golden-manifest
npm run check:golden-metadata
npm run check:golden-dimensions
```

Expected result: all commands pass, with pending golden samples reported as placeholders.

## Boundary

This gate does not change product behavior. It does not modify capture engine, rendering, composite, injection, upload, storage signing policy, DB/schema/env, golden PNG, or image assets.

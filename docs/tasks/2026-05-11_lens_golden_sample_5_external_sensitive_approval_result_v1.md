# Lens Golden Sample 5 External Sensitive Approval Result v1

Date: 2026-05-11

## Decision

Operator approval was received to promote the observed GDN PC display output as a
golden baseline.

Final classification:

- surface: `gdn-pc-display`
- state: `external-only`
- sensitivity: `external-sensitive`
- local committed PNG: no
- local pixel diff: skipped

## Rationale

The approved output is a real publisher capture and can include real public news
content, a real advertising placement, and production capture context. That makes it
useful as operator-reviewed evidence, but not appropriate as a repo-safe PNG under
`tests/golden/images`.

Per the golden sample policy, repo-safe golden PNGs should use neutral test creative,
generic copy, and non-sensitive public context. Production captures with real creative
or publisher context must remain external-sensitive.

## Manifest Changes

Updated the GDN PC display golden placeholder contract:

- `tests/golden/manifests/gdn-pc-display.json`
  - `sampleState`: `external-only`
  - `sensitivity`: `external-sensitive`
  - notes updated to record external-sensitive approval
- `tests/golden/metadata/gdn-pc-display.json`
  - `sampleState`: `external-only`

No binary PNG was added or modified.

## Not Performed

This gate did not perform:

- new capture execution
- upload
- DB or storage cleanup
- storage object download
- golden PNG commit
- image asset commit
- pixel diff generation
- capture engine, renderer, composite, or injection changes
- DB/schema/env/storage policy changes

## Verification

Required verification:

- `npm run check:golden-manifest`
- `npm run check:golden-metadata`
- `npm run check:golden-dimensions`
- `npm run verify:harness`
- `git diff --check`

Expected result:

- GDN PC display is counted as `external-only`
- local PNG reads remain skipped for that surface
- no product asset or golden PNG enters the repository

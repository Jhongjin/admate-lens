# Lens Golden Fixture 3 Local Fixture Capture Dry Run Result v1

Date: 2026-05-11
Gate: Lens-Golden-Fixture-3
Status: blocked
Repo: admate-lens

## Purpose

Attempt a local-only dry run for the repo-safe Lens golden fixtures added in
Lens-Golden-Fixture-2, without using production publisher pages, product API
capture routes, Supabase DB, Supabase Storage, upload, or committed golden PNG
promotion.

## Scope

Allowed fixture surfaces:

```text
public/lens-fixtures/gdn-pc-display.html
public/lens-fixtures/youtube-pc-instream-skip.html
```

Allowed output boundary:

```text
tests/golden/candidates/
```

That output path is ignored and is not a product asset or committed golden path.

## Result

The dry run did not complete because the available browser automation paths were
not usable in the current Codex desktop session.

Observed blockers:

- Codex Playwright browser MCP calls failed with `Transport closed`.
- `agent-browser` CLI was not available on PATH.
- Direct `puppeteer-core` launch against local Chrome/Edge failed before a page
  could be captured.
- Direct Chrome headless screenshot fallback did not complete safely within the
  local command timeout.

Because the browser execution boundary was unavailable, no candidate PNG was
accepted from this gate.

## Safety Boundary

The following routes were intentionally not used because they can mutate DB,
storage, capture state, or uploaded objects:

```text
src/app/api/captures/route.ts
src/app/api/captures/execute/route.ts
src/app/api/upload/route.ts
```

The attempted flow stayed within local fixture files and local tooling. Any
temporary helper or local server process used during investigation was removed
before this result was recorded.

## Not Performed

This gate did not perform:

- production page capture
- authenticated Lens API capture
- upload
- Supabase DB write
- Supabase Storage write
- storage cleanup or delete
- committed candidate PNG creation
- committed golden PNG creation
- golden manifest promotion to `approved`
- fixture HTML or SVG changes
- capture engine, renderer, composite, injection, API, DB, schema, env, or
  storage policy changes
- secret, token, cookie, session, signed URL, or raw provider response output

## Verification

Confirmed before documenting:

```text
git status --short --branch: clean
public/lens-fixtures files still present
no staged files
```

Required follow-up validation for this document:

```text
git diff --check -- docs/tasks/2026-05-11_lens_golden_fixture_3_local_fixture_capture_dry_run_result_v1.md
npm run check:golden-manifest
npm run check:golden-metadata
npm run check:golden-dimensions
npm run verify:harness
```

## Next Gate

Recommended next gate:

```text
Lens-Golden-Fixture-4 browser automation recovery or local runner plan
```

That gate should choose one of these paths before attempting capture again:

- restore the Codex browser automation transport
- provide a working local browser automation command
- add a reviewed local-only runner that serves `public/lens-fixtures/**` and
  writes only ignored candidate PNGs

Actual golden PNG approval and manifest promotion should remain separate.

# Lens Golden Fixture 4 Browser Automation Recovery Plan v1

Date: 2026-05-11
Gate: Lens-Golden-Fixture-4
Status: plan
Repo: admate-lens

## Purpose

Define the next safe path for generating repo-safe Lens golden candidate PNGs
from local fixtures after Lens-Golden-Fixture-3 was blocked by unavailable
browser automation in the current Codex desktop session.

## Current State

Completed:

- repo-safe static fixture pages exist under `public/lens-fixtures/**`
- fixture assets are local static SVG files
- no production publisher, platform, advertiser, account, storage, or private
  URL content is required
- Lens-Golden-Fixture-3 recorded the blocked capture dry run result

Blocked:

- Codex Playwright browser MCP returned `Transport closed`
- `agent-browser` CLI was not available on PATH
- direct local Chrome/Edge automation did not provide a reliable capture path

## Recommended Path

The recommended next attempt is browser automation recovery first, not product
capture API usage.

Priority order:

1. Restore the Codex browser automation transport.
2. Re-run fixture capture using only local fixture URLs.
3. Write candidate PNGs only under ignored `tests/golden/candidates/**`.
4. Keep manifest approval and committed golden PNG promotion in a later Gate.

This keeps the golden workflow deterministic while avoiding DB/storage mutation.

## Do Not Use

Do not use these product API routes for golden fixture capture dry runs:

```text
src/app/api/captures/route.ts
src/app/api/captures/execute/route.ts
src/app/api/upload/route.ts
```

Reason: these routes can create capture rows, update state, upload storage
objects, clean up objects, or depend on authenticated product/runtime context.

## Acceptable Recovery Options

### Option A: Codex Browser MCP Recovery

Use if the Codex browser MCP can be restored in the current desktop session.

Expected checks:

```text
open local fixture URL
resize viewport to 1920x1080
take PNG screenshot
save to tests/golden/candidates/<surface>/current.png
verify dimensions and file size
```

Allowed URLs:

```text
http://127.0.0.1:<local-port>/lens-fixtures/gdn-pc-display.html
http://127.0.0.1:<local-port>/lens-fixtures/youtube-pc-instream-skip.html
```

### Option B: Reviewed Local-Only Runner

Use if Codex browser MCP stays unavailable but a reviewed local browser runner
can launch reliably.

Runner constraints:

- serve only `public/lens-fixtures/**`
- write only under `tests/golden/candidates/**`
- avoid product API routes
- avoid Supabase client imports
- avoid upload, DB writes, cleanup, signed URLs, cookies, or session access
- output only sanitized metadata: surface, dimensions, repo-relative path, hash

### Option C: Block and Escalate

Use if neither browser automation path is available.

Escalation output should include:

- browser MCP status
- local runner status
- no-mutation confirmation
- next human action required

## Candidate Validation

After a candidate PNG is generated, validate before any approval:

```text
file exists under tests/golden/candidates/<surface>/current.png
dimensions match expected surface viewport
no real publisher/platform/advertiser/account/private URL context visible
no secret/token/cookie/session/signed URL/raw provider data visible
candidate file remains ignored and uncommitted
```

Recommended commands:

```text
git status --short --ignored=matching tests/golden/candidates
npm run check:golden-manifest
npm run check:golden-metadata
npm run check:golden-dimensions
npm run verify:harness
```

## Promotion Boundary

This plan does not approve:

- committed candidate PNGs
- committed golden PNGs
- golden manifest `approved` state
- pixel baseline promotion
- product asset creation

Those require a separate explicit approval Gate after candidate inspection.

## Stop Conditions

Stop immediately if:

- automation tries to open production publisher/platform URLs
- product API capture routes are required
- DB/storage mutation is required
- browser automation needs cookie/token/session extraction
- candidate PNG contains real publisher/platform branding or private product
  data
- generated output lands outside ignored candidate paths

## Verification

Required for this plan document:

```text
git diff --check -- docs/tasks/2026-05-11_lens_golden_fixture_4_browser_automation_recovery_plan_v1.md
npm run check:golden-manifest
npm run check:golden-metadata
npm run check:golden-dimensions
npm run verify:harness
```

## Next Gate

Recommended next gate:

```text
Lens-Golden-Fixture-5 local candidate PNG generation
```

That gate should proceed only after a working browser automation path is
available.

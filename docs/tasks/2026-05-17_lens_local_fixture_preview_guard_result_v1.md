# Lens local fixture preview guard result

Date: 2026-05-17
Repo: admate-lens
Status: completed

## Scope

Added a static local fixture preview guard so the local design QA path stays safe.

The guard verifies:

- local auth bypass requires `NODE_ENV !== "production"`
- local auth bypass requires `IS_LOCAL=true`
- local auth bypass requires `LENS_LOCAL_AUTH_BYPASS=true`
- local fixture mode requires `LENS_LOCAL_FIXTURE_MODE=true`
- fixture data is served only after the Lens session boundary
- capture creation, cancellation, deletion, execute, and upload routes remain read-only in fixture mode
- fixture mode blocks DB/storage/browser execution paths before route mutation work begins
- fixture rows are static and marked with local fixture runtime metadata

## Changed Files

- `scripts/check-local-fixture-preview-contract.mjs`
- `package.json`

## Verification

```powershell
npm run check:local-fixture-preview
npm run lint
npm run verify:offline-smoke
npm run verify:golden
npm run build
```

All checks passed.

Build note:

- Next.js reported the existing edge-runtime static generation warning. No Lens fixture guard failure was observed.

## Operational Boundary

This does not enable production bypass.

This does not call production auth, DB, storage, browser capture, or external endpoints.

Fixture mode remains local-only and read-only for design QA.


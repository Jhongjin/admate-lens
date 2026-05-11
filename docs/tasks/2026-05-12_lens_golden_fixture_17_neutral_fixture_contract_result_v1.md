# Lens Golden Fixture 17 Neutral Fixture Contract Result v1

Date: 2026-05-12
Gate: Lens-Golden-Fixture-17
Status: pass
Repo: admate-lens

## Purpose

Implement the approved next safe queue after
`docs/tasks/2026-05-12_lens_golden_fixture_16_neutral_synthetic_harness_plan_v1.md`.

## Changes

Added one neutral static local fixture page:

```text
public/lens-fixtures/gdn-neutral-slot-lab.html
```

Added one offline fixture contract checker and package script:

```text
scripts/check-fixture-contracts.mjs
npm run check:fixture-contracts
```

The new fixture is static HTML/CSS only. It uses CSS shapes and text-only mock
creative blocks, with no external URLs, scripts, fonts, images, secrets,
tokens, cookies, account identifiers, signed URLs, real publisher names, real
platform names, or real advertiser names.

The checker validates local fixture contracts without screenshots or capture:

- fixture HTML is static and local-only
- no script tags, external URLs, CSS imports, or link tags
- referenced `src`/`href`/form/media attributes are local-only
- no credential-like, token-like, cookie-like, or account-id patterns
- at least one stable `data-ad-slot` marker exists per fixture
- visible real platform or publisher-like names are limited to safety sentences
- approved repo-safe golden manifests keep a static fixture source note or
  reviewed exception

`verify:harness` was not broadened in this gate. The scanner can be wired into
that aggregate later after product accepts the rule set.

## Not Performed

This gate did not perform:

- captures
- browser automation or screenshots
- uploads
- DB, storage, auth, session, or cleanup work
- golden PNG/image generation, promotion, or replacement
- product capture engine changes
- commits or pushes

## Verification

Commands run:

```text
git diff --check
npm run check:fixture-contracts
npm run verify:harness
npm run harness:report
```

Results:

```text
git diff --check: pass
  warning only: package.json LF will be replaced by CRLF the next time Git touches it

npm run check:fixture-contracts: pass
  [check-fixture-contracts] ok (7 fixture pages)

npm run verify:harness: pass
  [check-surface-registry] ok (16 surface tokens, 2 legacy mappings, 10 youtube types)
  [check-capture-output-metadata] ok (2 records)

npm run harness:report: pass
  verify:harness: pass
  check:golden-manifest: pass
  check:golden-metadata: pass
  check:golden-dimensions: pass
  golden manifests: 6 approved, 0 errors
```

The harness report notes that it does not execute capture or upload flows and
keeps pixel diff excluded.

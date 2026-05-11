# Lens Golden Fixture 2 Repo-Safe Mock Fixture Implementation Result v1

Date: 2026-05-11
Gate: Lens-Golden-Fixture-2
Status: pass
Repo: admate-lens

## Purpose

Add deterministic repo-safe mock fixture surfaces that can later be used to
generate committed golden PNGs without relying on real publisher, platform,
advertiser, campaign, account, storage, or private URL context.

## Changed Files

Added static public fixture files:

```text
public/lens-fixtures/gdn-pc-display.html
public/lens-fixtures/youtube-pc-instream-skip.html
public/lens-fixtures/assets/mock-creative-300x250.svg
public/lens-fixtures/assets/mock-creative-728x90.svg
```

## Implementation Summary

The fixture files are served from `public/` so they avoid Lens App Router auth,
session helpers, Supabase access, React hydration drift, API calls, and runtime
environment reads.

The GDN fixture provides:

- `Sample Publisher` page shell
- deterministic article/card layout
- local static 300x250 and 728x90 mock creative assets
- `data-ad-slot` markers for future fixture capture targeting

The video fixture provides:

- `Sample Video` page shell
- generic search/header layout
- synthetic in-stream player composition
- neutral sponsor card and skip control
- deterministic recommendation rail without real thumbnails or channel names

## Safety Boundary

The fixtures intentionally avoid:

- real publisher names
- real YouTube branding
- real advertiser or campaign names
- real account identifiers
- production storage URLs
- landing URLs
- external images, fonts, scripts, analytics, or network dependencies
- secret, token, cookie, credential, signed URL, or provider response text

Only static HTML/CSS/SVG was added.

## Not Performed

This gate did not perform:

- capture execution
- upload
- storage object download
- DB or storage cleanup
- golden PNG creation, modification, or commit
- candidate PNG creation, modification, or commit
- pixel diff generation
- manifest state change to `approved`
- metadata fixture promotion
- product asset change outside `public/lens-fixtures/**`
- capture engine, renderer, composite, injection, API, DB, schema, env, or
  storage policy changes
- production API calls

## Verification

Commands run:

```text
git diff --check -- public/lens-fixtures docs/tasks/2026-05-11_lens_golden_fixture_1_repo_safe_mock_surface_plan_v1.md
npm run check:golden-manifest
npm run check:golden-metadata
npm run check:golden-dimensions
npm run verify:harness
npm run build
```

Results:

```text
check:golden-manifest: pass
check:golden-metadata: pass
check:golden-dimensions: pass, existing pending/external surfaces skipped
verify:harness: pass
build: pass
```

The build kept the existing edge-runtime static-generation warning. No new
fixture-specific build error appeared.

## Next Gate

Recommended next gate:

```text
Lens-Golden-Fixture-3 local fixture capture dry run
```

That gate should require explicit approval before running capture. It should use
the fixture URLs only and keep uploads, production capture evidence, storage
cleanup, and manifest promotion separate.

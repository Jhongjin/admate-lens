# Lens Golden Fixture 11 Controlled Pending Surface Plan v1

Date: 2026-05-11
Gate: Lens-Golden-Fixture-11
Status: implementation review
Repo: admate-lens

## Purpose

Record the first small step after operator approval to use controlled Lens
fixture pages for golden baselines instead of real publisher or real platform
captures.

This gate adds one controlled static pending-surface fixture page only. It does
not create, copy, promote, or validate golden PNGs, and it does not mutate
capture, upload, database, storage, environment, or product capture behavior.

## Existing Pattern

The repo already uses static `public/` fixture pages for approved PC baselines:

```text
public/lens-fixtures/gdn-pc-display.html
public/lens-fixtures/youtube-pc-instream-skip.html
public/lens-fixtures/assets/mock-creative-300x250.svg
public/lens-fixtures/assets/mock-creative-728x90.svg
```

Those pages avoid App Router auth, Supabase/session helpers, React hydration,
API calls, external assets, production capture contexts, and env reads.

The pending manifest queue remains:

```text
demandgen-youtube-feed
kakao-bizboard
naver-smart-channel-mobile
youtube-shorts
```

## Implemented Step

Added:

```text
public/lens-fixtures/demandgen-youtube-feed.html
```

This fixture is a mobile feed-style page for the existing pending
`demandgen-youtube-feed` surface. It uses static HTML and CSS only, with a
controlled sponsored feed card marked by:

```text
data-ad-slot="demandgen-mobile-feed"
```

## Safety Rules

The fixture intentionally avoids:

- real publisher names
- real platform branding
- real article text, thumbnails, or recommendation content
- real advertiser, campaign, account, or creative identifiers
- external images, fonts, scripts, tracking, analytics, or API calls
- landing URLs, storage URLs, signed URLs, tokens, cookies, credentials, or
  private diagnostic data

Visible labels use synthetic terms such as `Sample Feed`, `Sample Desk`,
`Fixture Sponsor`, and `TEST CREATIVE`.

## Not Changed

This gate intentionally does not change:

- `tests/golden/manifests/**`
- `tests/golden/metadata/**`
- `tests/golden/images/**`
- `tests/golden/candidates/**`
- `tests/golden/diffs/**`
- `tests/golden/reports/**`
- `src/**`
- capture engine, renderer, composite, injection, API, DB, schema, env,
  storage, browser session, upload, or cleanup logic

## Validation Plan

Run:

```text
git diff --check -- public/lens-fixtures/demandgen-youtube-feed.html docs/tasks/2026-05-11_lens_golden_fixture_11_controlled_pending_surface_plan_v1.md
npm run check:golden-manifest
npm run check:golden-metadata
npm run check:golden-dimensions
npm run verify:harness
```

Do not run `check:golden-pixels` or `verify:golden` in this gate, because those
commands can write diff PNGs and report JSON for already approved local
goldens. Golden PNG generation belongs to a later explicitly approved gate.

## Next Gate

Recommended next gate:

```text
Lens-Golden-Fixture-12 implementation review and fixture candidate generation approval
```

That gate should decide whether to add the remaining pending controlled fixture
pages first, or approve local candidate generation for
`public/lens-fixtures/demandgen-youtube-feed.html` using only local fixture
capture tooling and no upload, DB, storage, production, cleanup, or manifest
promotion.

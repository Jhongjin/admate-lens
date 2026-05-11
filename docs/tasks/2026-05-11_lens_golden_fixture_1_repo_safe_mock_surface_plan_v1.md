# Lens Golden Fixture 1 Repo-Safe Mock Surface Plan v1

Date: 2026-05-11
Gate: Lens-Golden-Fixture-1
Status: planned
Repo: admate-lens

## Purpose

Define how Lens can create repo-safe golden PNGs without committing captures of
real publishers, real YouTube pages, real advertisers, campaign material,
account identifiers, storage URLs, or production capture evidence.

## Problem

The current Lens capture product is intentionally built around realistic media
and platform environments. That makes operator QA evidence valuable, but it also
means successful captures naturally include:

- real publisher or platform UI
- real article, video, thumbnail, or recommendation content
- visible brand, advertiser, or channel names
- landing or storage URL context in the operator viewer
- public but still non-repo-safe editorial or ad context

Those outputs are appropriate for `external-only` golden evidence, but they are
not ideal for committed `tests/golden/images/**` PNGs.

## Decision

Do not force current production-style captures into repo-safe golden assets.

Instead, add dedicated mock fixture surfaces that are:

- served by the Lens app itself
- public and deterministic
- visually close enough for capture regression checks
- free of real publisher, platform, advertiser, account, campaign, URL, token,
  credential, or personal data
- suitable for committed PNG golden baselines

## Recommended Implementation

Add static fixture files under:

```text
public/lens-fixtures/gdn-pc-display.html
public/lens-fixtures/youtube-pc-instream-skip.html
public/lens-fixtures/assets/mock-creative-300x250.svg
public/lens-fixtures/assets/mock-creative-728x90.svg
```

Static public HTML is preferred over Next app routes because it avoids the Lens
App Router auth boundary, Supabase/session helpers, React hydration drift, and
runtime environment access. The root app is guarded, while `public/` files are
served directly by Next and can be used as deterministic capture targets.

Recommended URL shape:

```text
/lens-fixtures/gdn-pc-display.html
/lens-fixtures/youtube-pc-instream-skip.html
```

These files should:

- use static HTML/CSS only
- avoid external image, font, script, tracking, analytics, or API dependencies
- avoid real logos, real publisher names, real YouTube branding, and real brand
  names
- use generic labels such as `Sample Publisher`, `Sample Video`, `Test
  Sponsor`, and `AdMate Test Creative`
- include deterministic ad slots sized for the relevant surface
- render consistently at the manifest target dimensions
- be excluded from the operator app navigation unless explicitly linked from
  docs or fixture commands

## GDN Fixture Requirements

The GDN PC display fixture should mimic a desktop publisher article page without
using a real publisher identity.

Suggested layout:

- neutral header: `Sample Publisher`
- generic section nav
- deterministic article grid
- one or more clearly marked ad slot containers
- a primary display slot compatible with the existing GDN injection behavior
- neutral test copy and simple CSS blocks instead of real editorial images

Target surface:

```text
surface: gdn-pc-display
expected PNG: 1920x1080
```

## YouTube Fixture Requirements

The YouTube PC in-stream fixture should mimic a generic video watch page without
using the YouTube logo, real channels, real thumbnails, or real video titles.

Suggested layout:

- neutral header: `Sample Video Platform`
- generic search field
- large mock video player
- right rail of neutral recommendation cards
- overlay area where the capture renderer can represent a skippable in-stream
  ad
- generic sponsor card using `Test Sponsor`

Target surface:

```text
surface: youtube-pc-instream-skip
expected PNG: 1920x1080
```

## What This Does Not Change

This plan does not change:

- capture engine
- renderer
- composite behavior
- injection behavior
- storage signing policy
- DB/schema/env
- upload/capture execution
- current external-only golden evidence
- existing production capture flows

## Repo-Safe Golden Intake Flow

After fixture routes exist:

1. Run Lens locally.
2. Capture only the fixture URL using the relevant Lens surface.
3. Download the original PNG, not the operator viewer screenshot.
4. Confirm dimensions match the manifest.
5. Confirm the PNG contains no real publisher/platform/advertiser/account data.
6. Commit the PNG under `tests/golden/images/{surface}/golden.png`.
7. Update manifest state:

```text
sampleState: approved
sensitivity: repo-safe
golden.sha256: <sha256>
```

8. Update metadata fixture from placeholder to approved fixture metadata.
9. Run:

```text
npm run check:golden-manifest
npm run check:golden-metadata
npm run check:golden-dimensions
npm run check:golden-pixels
npm run verify:golden
npm run verify:harness
```

## Stop Conditions

Stop before committing a PNG if:

- any real publisher, platform logo, real advertiser, campaign, account,
  storage URL, landing URL, token, credential, or personal data appears
- dimensions do not match the manifest
- the output is a screenshot of the operator viewer instead of the original PNG
- capture required production credentials or production-only state
- the fixture route requires network resources to render

## Next Gate

Recommended next gate:

```text
Lens-Golden-Fixture-2 repo-safe mock fixture implementation
```

That gate should add the static fixture files only. It should not run capture, upload,
create golden PNGs, or modify manifest state to `approved`.

## Validation Plan

Run:

```text
git diff --check -- docs/tasks/2026-05-11_lens_golden_fixture_1_repo_safe_mock_surface_plan_v1.md
npm run check:golden-manifest
npm run check:golden-metadata
npm run check:golden-dimensions
npm run verify:harness
```

## No-Touch Confirmation

This planning gate must not perform:

- capture execution
- upload
- storage object download
- DB or storage cleanup
- golden PNG creation, modification, or commit
- candidate PNG creation, modification, or commit
- pixel diff generation
- product asset change
- capture engine, renderer, composite, injection, API, DB, schema, env, or
  storage policy changes
- production API calls
- secret, env, token, cookie, credential, signed URL, raw provider response, or
  raw capture payload output

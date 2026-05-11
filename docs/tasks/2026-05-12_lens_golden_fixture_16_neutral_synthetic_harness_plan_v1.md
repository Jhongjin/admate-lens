# Lens Golden Fixture 16 Neutral Synthetic Harness Plan v1

Date: 2026-05-12
Gate: Lens-Golden-Fixture-16
Status: plan only
Repo: admate-lens

## Purpose

Prepare the next safe docs-only plan for reducing future golden/sample QA
reliance on real publisher content.

This gate proposes a neutral synthetic capture fixture page and a companion
offline harness concept. It does not implement either one.

## Scope

This is a planning-only gate.

Changed:

```text
docs/tasks/2026-05-12_lens_golden_fixture_16_neutral_synthetic_harness_plan_v1.md
```

Not changed:

```text
src/**
public/lens-fixtures/**
public/brand/**
public/frames/**
tests/golden/images/**
tests/golden/manifests/**
tests/golden/metadata/**
tests/golden/candidates/**
tests/golden/diffs/**
tests/golden/reports/**
```

Not performed:

- capture execution
- browser automation or screenshots
- asset generation
- golden PNG generation, replacement, or promotion
- product asset edits
- upload
- DB, storage, auth, environment, or cleanup work
- commit or push

## Current Lens Capture Constraints

Lens has two different capture-risk profiles that this plan must respect.

GDN publisher capture is the highest-risk area for real content dependency:

- It navigates to operator-provided publisher URLs.
- It waits for publisher DOM, lazy-loaded content, fonts, ads, and layout.
- It detects ad-like slots from live page structure.
- It injects downloaded creative data into selected slots.
- It can encounter slow hosts, access-denied pages, Cloudflare or bot
  challenges, large DOMs, sticky/footer slots, and page-specific heuristics.
- It must preserve viewport, DPR, screenshot quality, and slot fidelity.

Mobile native and several YouTube surfaces already have a safer synthetic
direction:

- Naver and Kakao mobile native rendering is generated in-page from request
  options and downloaded/fallback creative data.
- YouTube Shorts, Masthead, and infeed variants include synthetic or fallback
  rendering paths when live platform data is unstable.
- The first six local golden samples are now approved repo-safe fixtures.

The harness should therefore start as an offline guard around fixture contracts,
not as a replacement for real publisher capture fidelity proof.

## Proposed Fixture Concept

Create one future neutral synthetic fixture page that exercises GDN-like slot
selection without using any real publisher content.

Working name:

```text
public/lens-fixtures/gdn-neutral-slot-lab.html
```

The page should be static HTML/CSS only, following the existing fixture pattern:

- no scripts
- no external images
- no external fonts
- no trackers or analytics
- no real publisher, platform, advertiser, campaign, account, person, article,
  video, thumbnail, landing URL, signed URL, credential, token, cookie, or
  private diagnostic text
- deterministic layout and copy
- local repo-safe mock creative references only if separately approved

Recommended page sections:

- desktop news-like shell with neutral labels such as `Sample Publisher`,
  `Sample Desk`, and `Fixture Sponsor`
- one primary `300x250` slot above the fold
- one `728x90` leaderboard slot
- one below-fold secondary `300x250` slot
- one intentionally low-priority footer or sticky-like slot for negative
  ordering checks
- explicit attributes such as `data-ad-slot`, dimensions, and stable ids

This page should not use real platform chrome. Its purpose is a GDN slot lab,
not a pixel-matched public publisher mock.

## Proposed Harness Concept

Add a future offline harness check that validates fixture safety and manifest
coverage without taking screenshots.

Working script:

```text
scripts/check-fixture-contracts.mjs
```

Working package script:

```text
npm run check:fixture-contracts
```

Initial checks:

- every committed `public/lens-fixtures/*.html` is static and local-only
- no `<script>` tags
- no `http://` or `https://` external references
- no visible real publisher/platform/advertiser names except safety sentences
  that explicitly deny real content
- no token-like, cookie-like, signed URL, credential, or account-id patterns
- every fixture has at least one stable surface marker such as `data-ad-slot`
- every approved local golden manifest has either a documented fixture source
  note or a reviewed exception
- candidate, diff, and report directories remain ignored/generated-only

This check should be added to `verify:harness` only after it is stable and
after product agrees that the safety scanner rules will not create noisy false
positives.

## Why This Reduces Real Publisher Reliance

The fixture page gives future QA a controlled place to test:

- slot discovery assumptions
- slot ranking and negative-slot avoidance
- viewport and DPR-safe layout bounds
- neutral repo-safe content review
- golden manifest coverage
- metadata expectations

It does not prove that Donga, YNA, YouTube, Naver, or Kakao live surfaces are
currently reachable or visually identical. It reduces how often basic capture
QA needs to start from live publisher pages, while preserving separate
human-gated live proof for fidelity-sensitive changes.

## Human Approval Required

Human approval is required before:

- adding the actual fixture page
- adding or changing harness scripts/package scripts
- adding new local mock creative assets
- generating any candidate PNG
- promoting or replacing any golden PNG
- changing golden manifests, metadata, thresholds, or sample states
- running browser captures, Playwright screenshots, Puppeteer captures, or
  production/staging capture flows
- uploading output or mutating DB/storage/auth/session state
- using real publisher URLs, real platform pages, real advertiser assets, or
  external synthetic data sources
- broadening `verify:harness` to include the fixture scanner

Product/fidelity approval is also required before treating a neutral fixture as
evidence for a platform-specific output surface. Neutral fixtures can protect
contracts and regressions, but platform-matched screenshots still need a
reference basis.

## Future Implementation Gate

Recommended next implementation gate, after approval:

```text
Lens-Golden-Fixture-17 neutral fixture contract implementation
```

Allowed implementation scope for that gate should be:

- add exactly one static fixture HTML page
- optionally add one offline scanner script
- optionally add one package script
- update docs only with validation results

Still out of scope for that gate unless separately approved:

- capture runs
- screenshot generation
- golden PNG changes
- product capture engine changes
- DB/storage/upload/cleanup work

## Verification Plan

Docs-only validation for this gate:

```text
git diff --check
npm run verify:harness
npm run harness:report
```

Do not run `npm run verify:golden` for this plan-only gate because pixel
checks can generate ignored diff PNG and report JSON artifacts when approved
local samples are present.

Future implementation validation, still without capture:

```text
git diff --check -- <changed files>
npm run check:fixture-contracts
npm run verify:harness
npm run harness:report
```

Future human-gated validation, only after explicit approval:

- visually inspect the static fixture in a local browser
- generate one ignored candidate PNG from the local fixture
- compare dimensions against the intended manifest viewport
- promote a golden only after repo-safe content review and operator approval

## Exit Criteria

This plan is ready to hand off when:

- the doc lands without whitespace errors
- the existing offline harness still passes
- the harness report still avoids capture, upload, DB/storage mutation, cleanup,
  golden PNG generation, and pixel diff artifact generation
- no files outside this docs plan are changed

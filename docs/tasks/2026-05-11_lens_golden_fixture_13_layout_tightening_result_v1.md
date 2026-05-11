# Lens Golden Fixture 13 Layout Tightening Result v1

Date: 2026-05-11
Gate: Lens-Golden-Fixture-13
Status: pass
Repo: admate-lens

## Purpose

Tighten the controlled `demandgen-youtube-feed` fixture layout after visual
inspection of the Gate 12 candidate found right-edge clipping for long title,
action, and ad text.

This gate edits only the static fixture page, regenerates the ignored local
candidate PNG, and records the result. It does not promote a golden image or
change golden manifests, metadata, product code, capture APIs, DB, storage,
upload, cleanup, environment, or secrets.

## Fixture Change

Changed:

```text
public/lens-fixtures/demandgen-youtube-feed.html
```

Layout tightening:

- added horizontal overflow guards on `html`, `body`, and the phone shell
- constrained the phone shell with `width: min(390px, 100vw)`
- added `min-width: 0` to grid and flex text regions
- enabled safe wrapping for headings, labels, copy, and buttons
- allowed action rows to wrap with gaps
- narrowed the CTA column and button text size
- reduced the compact list thumbnail column to give copy more inline space
- reduced the largest creative headline size slightly

The fixture remains static HTML/CSS only and continues to avoid external URLs,
external assets, real publisher names, real platform branding, real articles,
real thumbnails, tokens, cookies, credentials, sessions, signed URLs, and raw
provider output.

## Regenerated Candidate

Regenerated ignored candidate:

```text
tests/golden/candidates/demandgen-youtube-feed/current.png
```

Candidate metadata:

```text
dimensions: 1170x2532
bytes: 179908
sha256: 9cea2367d4f5b2400d0cafb702a8cc071d35ec0c94e2f4604a5baeeb2c5940d2
```

The candidate remains ignored by git under `tests/golden/candidates/`.

## Visual Result

Visual inspection of the regenerated candidate found the previously noted
right-edge clipping resolved. The long story title, ad headline, ad body copy,
CTA button, action labels, and compact-card text all render inside their card
boundaries.

## Commands Run

```text
git status --short --ignored=matching tests/golden/candidates/demandgen-youtube-feed
Get-Content public/lens-fixtures/demandgen-youtube-feed.html
Get-FileHash -Algorithm SHA256 tests/golden/candidates/demandgen-youtube-feed/current.png
Set-Content <temporary local fixture server script under $env:TEMP>
Start-Process node <temporary local fixture server script> public 51214
Invoke-WebRequest http://127.0.0.1:51214/lens-fixtures/demandgen-youtube-feed.html
Playwright: browser_tabs new http://127.0.0.1:51214/lens-fixtures/demandgen-youtube-feed.html
Playwright: browser_resize width=1170 height=2532
Playwright: browser_take_screenshot demandgen-youtube-feed-fixture13.png
Copy-Item C:\Users\Administrator\projects\admate-docs\demandgen-youtube-feed-fixture13.png tests/golden/candidates/demandgen-youtube-feed/current.png
System.Drawing image dimension read for tests/golden/candidates/demandgen-youtube-feed/current.png
Get-FileHash -Algorithm SHA256 tests/golden/candidates/demandgen-youtube-feed/current.png
Stop-Process for the process owning local port 51214
Playwright: browser_tabs close
```

The only browser console error observed was the browser's automatic favicon
request returning 404 for `/favicon.ico`; the controlled fixture itself loaded
successfully.

## Not Changed

This gate intentionally does not change:

- `tests/golden/images/**`
- `tests/golden/manifests/**`
- `tests/golden/metadata/**`
- `src/**`
- capture engine, renderer, composite, injection, API, DB, schema, env,
  storage, browser session, upload, or cleanup logic

## Validation Plan

Run:

```text
npm run check:golden-manifest
npm run check:golden-metadata
npm run check:golden-dimensions
npm run verify:harness
git diff --check -- public/lens-fixtures/demandgen-youtube-feed.html docs/tasks/2026-05-11_lens_golden_fixture_13_layout_tightening_result_v1.md
git status --short --ignored=matching tests/golden/candidates/demandgen-youtube-feed
```

Do not run `check:golden-pixels` or `verify:golden` in this gate because they
can write diff PNGs and reports for approved local goldens. Golden promotion
and pixel baseline approval remain a later explicit gate.

## Next Gate

Recommended next gate:

```text
Lens-Golden-Fixture-14 candidate approval or further fixture review
```

If approved, the later promotion gate should update the manifest and metadata,
copy an approved PNG under `tests/golden/images/**`, and run the full golden
validation suite.

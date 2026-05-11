# Lens Golden Fixture 15 Remaining Surface Promotion Result v1

Date: 2026-05-11
Gate: Lens-Golden-Fixture-15
Status: pass
Repo: admate-lens

## Purpose

Process the remaining pending golden surfaces using the same controlled fixture
method used for `demandgen-youtube-feed`.

Processed surfaces:

```text
kakao-bizboard
naver-smart-channel-mobile
youtube-shorts
```

No surface was blocked.

## Controlled Fixture Pages

Added static fixture pages:

```text
public/lens-fixtures/kakao-bizboard.html
public/lens-fixtures/naver-smart-channel-mobile.html
public/lens-fixtures/youtube-shorts.html
```

The pages use static HTML/CSS only. They intentionally avoid external assets,
external URLs, scripts, real publisher content, real platform UI, real
advertiser assets, account identifiers, private URLs, credentials, tokens,
cookies, sessions, signed URLs, and raw provider output.

Visual inspection found all three candidates safe for promotion:

- no right-edge clipping
- no text overflow outside card boundaries
- no real publisher/platform/advertiser branding visible
- no external images or live content

## Candidate Generation

The fixture pages were served through a temporary local server restricted to:

```text
http://127.0.0.1:51215/lens-fixtures/**
```

Playwright screenshots were captured at each manifest viewport and copied to
ignored candidate paths:

```text
tests/golden/candidates/kakao-bizboard/current.png
tests/golden/candidates/naver-smart-channel-mobile/current.png
tests/golden/candidates/youtube-shorts/current.png
```

The only browser console issue observed was the browser's automatic favicon
request returning 404 for `/favicon.ico`.

## Promotion

Approved golden images added:

```text
tests/golden/images/kakao-bizboard/golden.png
tests/golden/images/naver-smart-channel-mobile/golden.png
tests/golden/images/youtube-shorts/golden.png
```

Manifest files updated to `sampleState: "approved"`, `sensitivity:
"repo-safe"`, and their matching SHA-256 values:

```text
tests/golden/manifests/kakao-bizboard.json
tests/golden/manifests/naver-smart-channel-mobile.json
tests/golden/manifests/youtube-shorts.json
```

Metadata files updated to `sampleState: "approved"` and `fixtureKind:
"approved"`:

```text
tests/golden/metadata/kakao-bizboard.json
tests/golden/metadata/naver-smart-channel-mobile.json
tests/golden/metadata/youtube-shorts.json
```

## Approved PNG Metadata

```text
kakao-bizboard:
  dimensions: 1179x2556
  bytes: 94422
  sha256: fb0baac036575b8d9a6f7fb04f32766cb0b8a8ebc2bb9005bba0e1697338a532

naver-smart-channel-mobile:
  dimensions: 1179x2556
  bytes: 77483
  sha256: 42260169928072efe9da003d3eafe2d5641a527a171cec7cb51fe3cd61488f9f

youtube-shorts:
  dimensions: 1170x2532
  bytes: 243704
  sha256: bec9b7c9c12a9853a2e666e561e410ea6908e60ddb1e6a91c66ccec9b4d98e94
```

## Pixel Diff Results

`npm run verify:golden` compared each approved golden against its ignored
candidate.

Generated ignored artifacts:

```text
tests/golden/diffs/kakao-bizboard/diff.png
tests/golden/diffs/naver-smart-channel-mobile/diff.png
tests/golden/diffs/youtube-shorts/diff.png
tests/golden/reports/kakao-bizboard/report.json
tests/golden/reports/naver-smart-channel-mobile/report.json
tests/golden/reports/youtube-shorts/report.json
```

Results:

```text
kakao-bizboard:
  changedPixelRatio: 0
  meanDelta: 0
  passed: true
  diff bytes: 64251
  diff sha256: e1efe20b3ab7eed0e22e988312b54b3e8b06efe4b4d170ba18ac5b344505bb9f

naver-smart-channel-mobile:
  changedPixelRatio: 0
  meanDelta: 0
  passed: true
  diff bytes: 64251
  diff sha256: e1efe20b3ab7eed0e22e988312b54b3e8b06efe4b4d170ba18ac5b344505bb9f

youtube-shorts:
  changedPixelRatio: 0
  meanDelta: 0
  passed: true
  diff bytes: 63614
  diff sha256: 0593806056df4f6ebd84e57834b8b081bbbae4a4d33d5a0189769e6a236366c4
```

## Validation

Commands run:

```text
npm run verify:golden
npm run verify:harness
Select-String public/lens-fixtures/*.html for external URL, script, image tag, real-brand, and sensitive-token patterns
System.Drawing dimension reads for candidates, approved goldens, and generated diffs
Get-FileHash -Algorithm SHA256 for candidates, approved goldens, and generated diffs
git status --short --ignored=matching tests/golden/candidates tests/golden/diffs tests/golden/reports
```

Results:

```text
npm run verify:golden: pass
  check:golden-manifest: ok (6 manifests, 0 pending-sample)
  check:golden-metadata: ok (6 metadata fixtures)
  check:golden-dimensions: ok (6 checked, 0 skipped)
  check:golden-pixels: ok (6 checked, 0 skipped)

npm run verify:harness: pass
  check:surface-registry: ok
  check:capture-metadata: ok
```

Fixture scan result:

```text
No external URLs, scripts, image tags, visible real platform names, visible real
advertiser assets, tokens, cookies, sessions, credentials, secrets, signed URLs,
or raw provider output were found. Matches were limited to surface ids or safety
sentences that explicitly state the fixtures avoid real platform, advertiser,
campaign, and private data.
```

## Not Performed

This gate intentionally did not perform:

- production capture
- upload
- DB or storage mutation
- storage cleanup/delete
- environment or secret reads
- source capture engine/API changes
- external URL or asset usage
- real publisher/platform/advertiser asset usage
- commit or push

## Final State

All six golden manifests are now approved local repo-safe fixtures. No pending
golden sample surfaces remain in the first-run set.

# Lens Golden Fixture 14 Demand Gen Promotion Result v1

Date: 2026-05-11
Gate: Lens-Golden-Fixture-14
Status: pass
Repo: admate-lens

## Purpose

Promote the controlled `demandgen-youtube-feed` candidate PNG to an approved
repo-safe golden baseline.

This gate uses only the ignored local candidate generated from the controlled
static fixture. It does not run production capture, upload, DB/storage/env
changes, source capture/API changes, external URLs/assets, real publisher or
platform assets, cleanup/delete, or secret/session/token/signed URL/provider
output handling.

## Promoted Files

Candidate source:

```text
tests/golden/candidates/demandgen-youtube-feed/current.png
```

Approved golden destination:

```text
tests/golden/images/demandgen-youtube-feed/golden.png
```

Manifest and metadata updated:

```text
tests/golden/manifests/demandgen-youtube-feed.json
tests/golden/metadata/demandgen-youtube-feed.json
```

## Approved Golden Metadata

```text
dimensions: 1170x2532
bytes: 179908
sha256: 9cea2367d4f5b2400d0cafb702a8cc071d35ec0c94e2f4604a5baeeb2c5940d2
```

Manifest state:

```text
sampleState: approved
sensitivity: repo-safe
```

Metadata state:

```text
sampleState: approved
fixtureKind: approved
```

## Pixel Diff Result

`npm run verify:golden` compared the approved golden against the ignored
candidate.

Generated ignored artifacts:

```text
tests/golden/diffs/demandgen-youtube-feed/diff.png
tests/golden/reports/demandgen-youtube-feed/report.json
```

Diff metadata:

```text
diff dimensions: 1170x2532
diff bytes: 63614
diff sha256: 0593806056df4f6ebd84e57834b8b081bbbae4a4d33d5a0189769e6a236366c4
changedPixelRatio: 0
meanDelta: 0
passed: true
```

## Commands Run

```text
git status --short --ignored=matching tests/golden/candidates tests/golden/diffs tests/golden/reports
Get-Content tests/golden/manifests/demandgen-youtube-feed.json
Get-Content tests/golden/metadata/demandgen-youtube-feed.json
Get-Content tests/golden/metadata/gdn-pc-display.json
Get-Content tests/golden/metadata/youtube-pc-instream-skip.json
System.Drawing dimension read for tests/golden/candidates/demandgen-youtube-feed/current.png
Get-FileHash -Algorithm SHA256 tests/golden/candidates/demandgen-youtube-feed/current.png
Copy-Item tests/golden/candidates/demandgen-youtube-feed/current.png tests/golden/images/demandgen-youtube-feed/golden.png
npm run verify:golden
npm run verify:harness
Select-String public/lens-fixtures/demandgen-youtube-feed.html -Pattern real-brand/url/sensitive-token scan
Get-ChildItem tests/golden/diffs/demandgen-youtube-feed tests/golden/reports/demandgen-youtube-feed
Get-Content tests/golden/reports/demandgen-youtube-feed/report.json
System.Drawing dimension read for approved golden, ignored candidate, and generated diff
Get-FileHash -Algorithm SHA256 for approved golden, ignored candidate, and generated diff
```

## Validation Results

```text
npm run verify:golden: pass
  check:golden-manifest: ok (6 manifests, 3 pending-sample)
  check:golden-metadata: ok (6 metadata fixtures)
  check:golden-dimensions: ok (3 checked, 3 skipped)
  check:golden-pixels: ok (3 checked, 3 skipped)

npm run verify:harness: pass
  check:surface-registry: ok
  check:capture-metadata: ok
```

Fixture scan result:

```text
No external URLs, scripts, image tags, real platform/brand names, tokens,
cookies, sessions, credentials, secrets, signed URLs, or raw provider output
were found. The only matches were the fixture's own safety sentence stating
that it avoids real publishers, campaign data, and private URLs.
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

## Next Gate

Recommended next gate:

```text
Lens-Golden-Fixture-15 remaining controlled mobile fixture plan
```

Remaining pending sample surfaces after this promotion:

```text
kakao-bizboard
naver-smart-channel-mobile
youtube-shorts
```

# Lens Golden Fixture 7 Post-Promotion Validation Recap v1

Date: 2026-05-11
Gate: Lens-Golden-Fixture-7
Status: pass
Repo: admate-lens

## Purpose

Recap the local post-promotion validation state after the operator-approved
repo-safe golden candidates were promoted.

This recap is docs-only. It did not run capture, upload, API, database,
storage, cleanup, production, or external browser workflows.

## Latest Commit

Latest local commit at validation time:

```text
0ce915bc8a1eb0651c6b14aa41ddd3b23a09598b
test: promote Lens repo-safe golden fixtures
Author: Jhongjin
Date: 2026-05-11T08:40:01+01:00
```

## Approved Surfaces

Operator-approved repo-safe golden baselines:

```text
gdn-pc-display
youtube-pc-instream-skip
```

Promoted golden image paths:

```text
tests/golden/images/gdn-pc-display/golden.png
tests/golden/images/youtube-pc-instream-skip/golden.png
```

Promoted manifest and metadata paths:

```text
tests/golden/manifests/gdn-pc-display.json
tests/golden/manifests/youtube-pc-instream-skip.json
tests/golden/metadata/gdn-pc-display.json
tests/golden/metadata/youtube-pc-instream-skip.json
```

Approved baseline metadata:

```text
gdn-pc-display:
  dimensions: 1920x1080
  sha256: e5f249d48790467b58957a59ba0ddb3226fcd13d219da128d556cb94693efb6e
  sampleState: approved
  sensitivity: repo-safe

youtube-pc-instream-skip:
  dimensions: 1920x1080
  sha256: 7d7028eeb3d87acf920fa58addc71ada5a1ca4b28c726d6e477222914e72dd48
  sampleState: approved
  sensitivity: repo-safe
```

Pixel reports confirmed zero-delta comparisons against the ignored candidate
sources:

```text
gdn-pc-display:
  changedPixelRatio: 0
  meanDelta: 0
  passed: true

youtube-pc-instream-skip:
  changedPixelRatio: 0
  meanDelta: 0
  passed: true
```

## Local Validation Results

Commands run:

```text
npm run verify:golden
npm run verify:harness
```

Results:

```text
npm run verify:golden: pass
  check:golden-manifest: ok (6 manifests, 4 pending-sample)
  check:golden-metadata: ok (6 metadata fixtures)
  check:golden-dimensions: ok (2 checked, 4 skipped)
  check:golden-pixels: ok (2 checked, 4 skipped)

npm run verify:harness: pass
  check:surface-registry: ok (16 surface tokens, 2 legacy mappings, 10 youtube types)
  check:capture-metadata: ok (2 records)
```

Skipped golden dimension and pixel checks are expected for pending samples:

```text
demandgen-youtube-feed
kakao-bizboard
naver-smart-channel-mobile
youtube-shorts
```

## Ignored Generated Artifacts

Ignored generated artifacts were observed and left in place:

```text
tests/golden/candidates/gdn-pc-display/current.png
tests/golden/candidates/youtube-pc-instream-skip/current.png
tests/golden/diffs/gdn-pc-display/diff.png
tests/golden/diffs/youtube-pc-instream-skip/diff.png
tests/golden/reports/gdn-pc-display/report.json
tests/golden/reports/youtube-pc-instream-skip/report.json
```

Other ignored local workspace paths present:

```text
.next/
.vercel/
next-env.d.ts
node_modules/
tsconfig.tsbuildinfo
```

No ignored candidates, diffs, reports, or other generated outputs were deleted.

## Remaining Backlog

Golden sample backlog remains for pending-sample surfaces:

```text
demandgen-youtube-feed
kakao-bizboard
naver-smart-channel-mobile
youtube-shorts
```

These surfaces still need approved golden sample intake before dimension and
pixel checks can validate them as promoted baselines.

## Safety Boundary

This recap only used local read/validation commands:

```text
git status
git log
npm run verify:golden
npm run verify:harness
local file reads
```

Not performed:

- capture execution
- upload
- API calls
- database calls or writes
- storage calls, writes, cleanup, or deletes
- production publisher URL access
- new PNG creation
- ignored artifact deletion
- commit
- push

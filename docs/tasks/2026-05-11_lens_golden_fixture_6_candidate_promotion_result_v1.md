# Lens Golden Fixture 6 Candidate Promotion Result v1

Date: 2026-05-11
Gate: Lens-Golden-Fixture-6
Status: pass
Repo: admate-lens

## Purpose

Promote the two operator-approved repo-safe fixture candidate PNGs to committed
golden baselines.

Operator approval:

```text
Lens fixture candidate PNG 2개를 golden으로 승격 승인한다.
```

## Promoted Surfaces

Promoted:

```text
gdn-pc-display
youtube-pc-instream-skip
```

Golden images added:

```text
tests/golden/images/gdn-pc-display/golden.png
tests/golden/images/youtube-pc-instream-skip/golden.png
```

Manifest and metadata files updated:

```text
tests/golden/manifests/gdn-pc-display.json
tests/golden/manifests/youtube-pc-instream-skip.json
tests/golden/metadata/gdn-pc-display.json
tests/golden/metadata/youtube-pc-instream-skip.json
```

## Golden Metadata

Promoted golden image metadata:

```text
gdn-pc-display:
  dimensions: 1920x1080
  bytes: 232085
  sha256: e5f249d48790467b58957a59ba0ddb3226fcd13d219da128d556cb94693efb6e

youtube-pc-instream-skip:
  dimensions: 1920x1080
  bytes: 473850
  sha256: 7d7028eeb3d87acf920fa58addc71ada5a1ca4b28c726d6e477222914e72dd48
```

Manifest state changes:

```text
sampleState: approved
sensitivity: repo-safe
```

Metadata state changes:

```text
sampleState: approved
fixtureKind: approved
```

## Pixel Diff Result

`npm run check:golden-pixels` compared each promoted golden image against its
ignored candidate source.

Results:

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

Generated diff and report files stayed under ignored paths:

```text
tests/golden/diffs/
tests/golden/reports/
```

## Safety Boundary

The promoted images come from repo-safe static fixtures only.

This gate did not use:

- production publisher URLs
- real YouTube pages
- authenticated Lens capture APIs
- upload
- Supabase DB writes
- Supabase Storage writes
- storage cleanup/delete
- signed URLs

## Not Performed

This gate did not perform:

- production capture
- product API capture execution
- DB/storage mutation
- fixture HTML/SVG modification
- capture engine, renderer, composite, injection, API, DB, schema, env, or
  storage policy changes
- secret, token, cookie, session, signed URL, raw code, or raw provider response
  output

Ignored candidate/diff/report outputs were not staged.

## Verification

Commands run:

```text
npm run check:golden-manifest
npm run check:golden-metadata
npm run check:golden-dimensions
npm run check:golden-pixels
```

Results:

```text
check:golden-manifest: pass
check:golden-metadata: pass
check:golden-dimensions: pass
check:golden-pixels: pass
```

Required final validation:

```text
npm run verify:golden
npm run verify:harness
git diff --check -- <changed files>
git diff --cached --check
```

## Rollback

If rollback is required:

```text
git revert <promotion-commit>
```

Do not delete production DB/storage/capture rows because this gate did not
create any.

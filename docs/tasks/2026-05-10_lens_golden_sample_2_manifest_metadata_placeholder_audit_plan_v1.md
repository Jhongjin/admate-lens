# Lens Golden Sample 2 Manifest Metadata Placeholder Audit Plan v1

Date: 2026-05-10

## Status

Gate Lens-Golden-Sample-2 is docs-only. It plans an offline audit of existing
pending golden manifests and metadata placeholders before any PNG, product
asset, candidate, diff, report, capture, upload, DB, storage, or env work is
allowed.

## Goal

Confirm that current pending golden sample contracts remain safe as placeholder
fixtures:

- manifests exist for intended surfaces
- manifests remain `pending-sample` or another non-approved state unless a
  separate asset gate has approved the binary baseline
- metadata placeholders contain only sanitized operational fields
- dimension expectations are declared without requiring PNG reads
- validators skip pixel requirements for pending samples
- no URL-like, provider, account, campaign, token, cookie, signed URL, or raw
  provider data is present

## Candidate Surfaces

Current manifest and metadata placeholders to audit:

- `demandgen-youtube-feed`
- `gdn-pc-display`
- `kakao-bizboard`
- `naver-smart-channel-mobile`
- `youtube-pc-instream-skip`
- `youtube-shorts`

This gate does not add or edit those JSON files. It only defines the audit.

## Allowed Checks

Allowed offline commands:

```text
npm run verify:harness
npm run check:golden-manifest
npm run check:golden-metadata
npm run check:golden-dimensions
npm run harness:report
```

Allowed file inspection:

- `tests/golden/manifests/*.json`
- `tests/golden/metadata/*.json`
- scripts that validate manifests, metadata, dimensions, and harness reports
- docs describing golden sample policy

## Forbidden Checks

Do not run:

```text
npm run check:golden-pixels
npm run verify:golden
```

Reason:

- pixel validation belongs to approved golden asset review
- pending placeholder samples should not require PNG reads
- this gate must not create or modify binary evidence

## Forbidden Changes

This gate must not:

- add golden PNGs
- add product assets
- add generated candidates
- add generated diffs
- add generated reports
- execute capture or upload
- start browser capture sessions
- write DB rows
- write storage objects
- change DB/schema/env/storage policy
- modify capture engine, renderer, composite, injection, or login code
- cleanup/delete artifacts

## Audit Matrix

For each candidate surface, record:

| Field | Expected |
| --- | --- |
| manifest present | yes |
| metadata present | yes |
| sample state | non-approved placeholder unless separately approved |
| sensitivity | explicit and repo-safe only if future PNG commit is possible |
| expected dimensions | declared in manifest |
| metadata runtime provider | placeholder or sanitized value only |
| URL-like fields | absent |
| token/cookie/secret fields | absent |
| provider raw payload | absent |
| account/campaign/customer IDs | absent |
| pixel validation requirement | skipped while pending |

## Evidence To Record

Record only sanitized audit evidence:

- command names
- pass/fail summary
- surface ids
- manifest/metadata file paths
- sample states
- dimension declarations
- validator skip reasons for pending samples

Do not record:

- image pixels
- screenshots
- signed URLs
- storage paths from live captures
- raw provider data
- account or campaign identifiers
- browser storage dumps

## Stop Conditions

Stop immediately if:

- a pending sample requires a local PNG read
- a validator attempts pixel comparison for a pending sample
- a manifest or metadata file contains URL-like or sensitive fields
- a check requires capture/upload/login/DB/storage access
- any product asset or golden PNG change becomes necessary

## Verification Plan

When executing the audit result gate, run:

```text
npm run verify:harness
npm run check:golden-manifest
npm run check:golden-metadata
npm run check:golden-dimensions
npm run harness:report
git diff --check
```

Do not run pixel validation in this gate.

## Next Gate

Recommended next gate:

`Lens-Golden-Sample-3 Manifest Metadata Placeholder Audit Result`

That gate should run the allowed offline commands and record a docs-only result.

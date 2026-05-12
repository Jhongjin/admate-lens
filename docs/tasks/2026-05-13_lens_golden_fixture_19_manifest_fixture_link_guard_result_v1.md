# Lens Golden Fixture 19 Manifest Fixture Link Guard Result v1

Date: 2026-05-13
Repo: admate-lens
Status: implemented locally

## Scope

Added an offline fixture contract guard for approved repo-safe golden manifests.

Changed files:

- `scripts/check-fixture-contracts.mjs`
- `docs/tasks/2026-05-13_lens_golden_fixture_19_manifest_fixture_link_guard_result_v1.md`

## Result

`npm run check:fixture-contracts` now also verifies that each approved
repo-safe golden manifest has a matching local fixture page at:

```text
public/lens-fixtures/<surface>.html
```

For those manifest-backed fixtures, the checker also locks:

- a `Lens Golden Fixture` document title
- at least one stable `data-ad-slot` marker
- the existing manifest note requirement that identifies static local fixture
  provenance or a reviewed exception

This keeps the golden manifest/report path tied to sanitized local fixture
content without running captures, browser screenshots, pixel diffs, or asset
generation.

## Recommendation

This is a safe non-human-gated queue because it strengthens fixture-only golden
provenance using static file checks. Any new golden surface should first land a
sanitized local fixture and manifest pairing before requesting capture or PNG
approval.

## No-Touch Confirmation

No live capture execution, browser automation, upload/delete, DB/storage access
or mutation, asset/golden PNG generation or replacement, golden promotion,
pixel diff, env/secret/cookie/token readback, staging, commit, or push was
performed.

## Verification Results

Local checks run:

- `npm run check:fixture-contracts`
- `npm run verify:harness`
- `npm run harness:report`
- `npm run verify:offline-smoke`
- `git diff --check -- scripts/check-fixture-contracts.mjs docs/tasks/2026-05-13_lens_golden_fixture_19_manifest_fixture_link_guard_result_v1.md`

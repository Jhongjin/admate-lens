# Lens Golden Sample 1 Intake Manifest Policy v1

Date: 2026-05-10

## Status

Gate Lens-Golden-Sample-1 is docs-only. It records the intake and approval policy that must be satisfied before any Lens golden PNG, product asset, or approved golden metadata fixture is added to the repository.

This gate does not perform capture execution, uploads, asset generation, DB or storage writes, env changes, cleanup, or golden PNG updates.

## Why Manifest Before Intake

Golden samples become long-lived quality baselines. Once approved, they can influence pixel diff expectations, review decisions, and future capture regressions. Intake must start with a manifest so each sample has a reviewable contract before any binary asset enters the repo.

The manifest-first rule ensures:

- the surface id, channel, product family, and product surface are known before review
- the expected dimensions and diff thresholds are explicit
- metadata requirements are declared before a sample is approved
- pending samples can be tracked without requiring local PNG files
- repo-safe samples are separated from external-sensitive samples before storage decisions
- validators can reject URL-like or sensitive text before it spreads into fixtures

Pending manifests are acceptable intake placeholders. A `sampleState: "pending-sample"` manifest reserves the contract and allows metadata/dimension policy review while local PNG reads and pixel diff checks remain skipped.

## Evidence And Asset Distinction

Allowed evidence is review material used to decide whether a sample can become golden. Evidence may include sanitized operator notes, offline harness output, validation command output, surface ids, dimensions, and redacted capture metadata.

Allowed evidence must not be treated as a product asset. It does not authorize adding, replacing, or editing:

- golden PNGs under `tests/golden/images`
- product creative or UI assets under `public`
- generated candidates under `tests/golden/candidates`
- generated diffs under `tests/golden/diffs`
- generated reports under `tests/golden/reports`
- capture uploads, storage objects, or signed URLs

Product assets and approved golden PNGs require a separate approval gate. Evidence can support that gate, but it is not itself approval to commit binary artifacts.

## Sanitized Metadata Fields

Approved or placeholder metadata fixtures may include only sanitized fields needed by the current golden validators and surface contract:

- `schemaVersion`
- `surface`
- `sampleState`
- `fixtureKind`
- `metadata.capturedAt`
- `metadata.durationMs`
- `metadata.resultCategory`
- `metadata.diagnostics`
- `metadata.diagnostics.captureQuality`
- `metadata.diagnostics.captureQuality.needsReview`
- `metadata.diagnostics.captureQuality.flags`
- `metadata.runtime.provider`
- `metadata.runtime.capturedAt`
- `metadata.runtime.durationMs`
- surface-specific neutral fields such as `youtubeAdType`, `instreamOpts.skipSeconds`, `gdnViewportMode`, `productFamily`, and `productSurface`

Placeholder metadata may use synthetic timestamps and `runtime.provider: "placeholder"`. Approved metadata must stay limited to operational quality signals and neutral surface classification.

## Forbidden Fields

Golden manifests, metadata fixtures, task docs, and evidence files must not include:

- tokens, cookies, secrets, API keys, credentials, passwords, or session ids
- signed URLs, presigned storage URLs, raw upload URLs, redirect URLs, or landing URLs
- raw provider payloads, request bodies, response bodies, or browser storage dumps
- advertiser names, campaign names, account ids, customer ids, billing ids, or internal workspace ids
- personal data, private landing information, or production-only creative identifiers
- unredacted headers, query strings, trace ids tied to production systems, or auth diagnostics
- raw capture artifacts that reveal a provider, account, campaign, or user context

The current validators reject URL-like and sensitive text in manifests and metadata. Human review remains required because sensitive information can appear in screenshots, filenames, comments, notes, or binary assets outside validator coverage.

## Approval Gates Before Golden Assets

Before any golden PNG, product asset, or approved golden metadata fixture is added, the following gates must pass:

1. Manifest gate: a manifest exists under `tests/golden/manifests` with `schemaVersion: 1`, the correct surface id, allowed `sampleState`, allowed `sensitivity`, expected dimensions, required metadata, expected metadata, and diff thresholds.
2. Sensitivity gate: the proposed sample is classified as `repo-safe` or `external-sensitive`; only `repo-safe` samples may produce committed PNGs.
3. Evidence gate: review evidence is sanitized and contains no forbidden fields, provider payloads, signed URLs, credentials, or production identifiers.
4. Metadata gate: the metadata fixture contains only approved sanitized fields and passes `npm run check:golden-metadata`.
5. Dimension gate: dimensions match the manifest and pass `npm run check:golden-dimensions`.
6. Operator gate: a reviewer explicitly approves the exact surface, PNG source, metadata fixture, and reason for using it as a baseline.
7. Asset gate: binary additions are reviewed separately from docs-only gates and must not be bundled with unrelated product code, capture execution, uploads, DB changes, storage changes, or env changes.
8. Verification gate: golden checks run after the asset is staged, including pixel validation when `sampleState` becomes `approved`.

Until all gates pass, the manifest must remain `pending-sample` or `external-only`, and local PNG/pixel expectations must remain skipped.

## Rollback And No-Cleanup Policy

Docs-only intake policy gates do not delete, clean up, or mutate generated artifacts. If a proposed golden sample is rejected, rollback is handled by reverting only the proposed manifest, metadata, or asset changes from that sample review.

No cleanup command should be run as part of this gate. Do not delete candidates, diffs, reports, uploaded files, storage objects, DB rows, browser sessions, or environment values while recording intake policy.

If an approved golden later needs removal, use a dedicated rollback task that names the exact manifest, metadata fixture, image path, reason, validation commands, and any external-sensitive storage owner. A rollback must preserve evidence needed to explain why the baseline changed.

## Verification Checklist

Before closing this docs-only gate, verify:

- only this task markdown file was added or changed
- no files under `src`, `scripts`, `tests/golden`, `public`, `pdf`, `cloudflare-worker`, `vps-proxy`, DB, storage, or env paths were modified
- no capture, upload, login, browser session, DB write, storage write, cleanup, or asset generation command was run
- no golden PNG, product asset, candidate, diff, report, manifest JSON, or metadata JSON was added or changed
- `git diff --check -- docs/tasks/2026-05-10_lens_golden_sample_1_intake_manifest_policy_v1.md` passes
- lightweight offline checks pass when available:

```text
npm run verify:harness
npm run check:golden-manifest
npm run check:golden-metadata
npm run check:golden-dimensions
```

Do not run capture or upload commands for this gate. `npm run verify:golden` is intentionally not required here because it includes pixel validation, which belongs to approved golden asset review rather than docs-only intake policy.

## Boundary

This gate changes documentation only. It does not change product behavior, capture engine, rendering, creative injection, login, browser automation, upload flow, DB/schema/env, storage policy, manifests, metadata fixtures, image assets, golden PNGs, candidates, diffs, or reports.

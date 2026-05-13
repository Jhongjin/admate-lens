# Lens Golden Fixture 20 Promotion Approval Prep v1

Date: 2026-05-13
Repo: admate-lens
Status: docs/static prep complete

## Scope

Prepared the next Lens golden-fixture promotion boundary without running capture,
browser automation, pixel diffs, asset generation, storage access, or production
API calls.

This prep gate covers the already tracked golden fixture set:

- `demandgen-youtube-feed`
- `gdn-pc-display`
- `kakao-bizboard`
- `naver-smart-channel-mobile`
- `youtube-pc-instream-skip`
- `youtube-shorts`

## Current Fixture State

The repo already contains tracked golden assets and supporting metadata under:

- `tests/golden/images/<surface>/golden.png`
- `tests/golden/manifests/<surface>.json`
- `tests/golden/metadata/<surface>.json`
- `tests/golden/reports/<surface>/report.json`

The latest static fixture-link guard also requires approved repo-safe manifests
to point back to sanitized local fixture pages at:

```text
public/lens-fixtures/<surface>.html
```

## Commander Decision

The safest next Lens queue is not a live slow-host capture, authenticated
operator UI review, or new PNG replacement. The next safe step is a bounded
promotion approval packet that keeps all work local and static until a separate
human approval explicitly authorizes any artifact-changing or live-capture
operation.

This preserves the current golden baseline while making the next approval
surface explicit.

## Approval Boundary For A Future Artifact Gate

Use a separate approval before any of the following:

- replacing any `tests/golden/images/**/golden.png`
- promoting any `tests/golden/candidates/**/current.png`
- running pixel-diff approval as a blocking acceptance step
- generating or editing PNG assets
- running browser capture against live media surfaces
- touching storage, uploads, deletes, DB rows, or production APIs
- using authenticated browser sessions

Recommended approval phrase:

```text
Lens golden fixture artifact promotion for <surface-list> is approved.
Promote only the named local candidate PNGs, run golden verification, and do
not run live capture, production API calls, DB/storage mutation, authenticated
browser sessions, or unrelated asset changes.
```

## Static Checks For This Prep Gate

Allowed checks:

- `npm run check:fixture-contracts`
- `npm run check:golden-manifest`
- `npm run check:golden-metadata`
- `npm run check:golden-dimensions`
- `npm run verify:harness`
- `npm run harness:report`
- `npm run verify:offline-smoke`
- `git diff --check`

Deferred checks:

- `npm run check:golden-pixels`
- `npm run verify:golden`

Those remain behind artifact approval because they validate visual artifact
equivalence and may produce review expectations around candidate/diff/report
state.

## Stop Conditions

Stop before continuing if any future promotion request includes:

- real publisher screenshots that are not sanitized into local fixtures
- screenshots containing account, user, session, token, or internal IDs
- live capture instructions without a separate live-capture approval
- storage mutation, upload/delete, or production API mutation
- a request to overwrite multiple surfaces without naming the exact surfaces

## No-Touch Confirmation

This gate did not perform live capture execution, browser automation, pixel
diffs, PNG generation or replacement, asset mutation, upload/delete, DB/storage
access or mutation, production API calls, authenticated browser review, secret
or credential readback, staging, commit, or push.

## Next Gate Options

Recommended next Lens choices:

1. `Lens-Golden-Fixture-21-Artifact-Promotion-1` if exact local candidate PNGs
   are approved for promotion.
2. `Lens-Ops-Slow-Host-14-Controlled-Local-Capture-Smoke-1` if a bounded
   slow-host capture smoke is approved.
3. `Lens-Ops-Capture-Cancel-1-Operator-Review-Plan` if cancel/abort behavior
   should be reviewed with an authenticated operator session.

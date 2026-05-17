# Lens Local Fixture Preview Operator Review Template v1

Date: 2026-05-18
Repo: admate-lens
Status: operator handoff template

## Scope

This template is for docs-only operator review of the AdMate Lens local fixture
preview and golden approval boundary.

It is limited to static, sanitized local fixture preview QA. It does not approve
live capture, browser execution against live publishers, upload/delete flows,
database or storage mutation, PNG generation, PNG replacement, or pixel-diff
approval.

## Mode Boundary

### Local Fixture Preview Mode

Use this mode only when reviewing repo-safe local fixture pages and already
available repo-local preview surfaces.

Allowed intent:

- inspect sanitized local fixture preview behavior
- confirm fixture labels, dimensions, and expected metadata are understandable
- verify the operator can distinguish pending, approved, and external-only
  golden states
- decide whether a repo-safe fixture is ready for later golden approval work
- record sanitized review evidence in this document or a follow-up task note

This mode must remain read-only. It must not create, upload, delete, execute,
promote, replace, or regenerate capture artifacts.

### Live Capture, Upload, And Delete Flows

These flows are out of scope for this handoff.

Do not use this template to approve:

- authenticated browser capture
- unauthenticated live publisher capture
- storage upload, replacement, or deletion
- database row creation, cancellation, update, or deletion
- execution of capture jobs
- promotion of candidate PNGs to golden PNGs
- pixel-diff based golden acceptance
- production, staging, or external API calls

Any future work in these areas needs a separate Commander approval with exact
surface names, commands, mutation boundaries, and stop conditions.

## Operator Checklist

### Fixture Preview QA

- [ ] Confirm the review is running in local fixture preview mode only.
- [ ] Confirm no live publisher URL, customer account, authenticated session, or
  production API is required for the review.
- [ ] Confirm the reviewed surface name is explicit.
- [ ] Confirm the preview identifies the fixture as local, static, and
  sanitized.
- [ ] Confirm fixture content uses neutral creative, generic copy, and
  non-sensitive media context.
- [ ] Confirm no customer, advertiser, campaign, account, user, session, token,
  credential, or private landing-page data appears in the preview.
- [ ] Confirm the preview dimensions and orientation match the expected surface.
- [ ] Confirm surface-specific metadata expectations are visible or traceable to
  the manifest/policy.
- [ ] Confirm pending samples do not require a local PNG file.
- [ ] Confirm external-only samples are not copied into the repo.
- [ ] Confirm any observed defect is documented with sanitized notes only.

### Golden Approval Readiness

- [ ] Confirm the candidate surface is named exactly.
- [ ] Confirm the sample state being requested is one of `pending-sample`,
  `approved`, or `external-only`.
- [ ] Confirm repo-safe approval is based only on sanitized fixture evidence.
- [ ] Confirm sensitive production captures remain external-only.
- [ ] Confirm approval does not imply permission to generate or replace PNGs.
- [ ] Confirm approval does not imply permission to run pixel diffs.
- [ ] Confirm approval does not imply permission to run live capture.
- [ ] Confirm approval does not imply permission to upload, delete, or mutate
  DB/storage state.
- [ ] Confirm any future artifact promotion request names the exact PNG paths and
  surfaces before work starts.

## Sanitized Evidence Fields

Use only sanitized values in the review record.

```text
Review date:
Operator:
Reviewer role:
Surface:
Product family:
Product surface:
Fixture page/path:
Fixture mode confirmation:
Sample state under review:
Expected dimensions:
Observed dimensions:
Metadata checked:
Fixture content summary:
Visual QA notes:
Golden readiness decision:
Decision reason:
Follow-up owner:
Follow-up task/doc:
Safe static checks reviewed:
```

Allowed evidence examples:

- surface id, product family, product surface, and sample state
- local fixture path such as `public/lens-fixtures/<surface>.html`
- manifest path such as `tests/golden/manifests/<surface>.json`
- metadata path such as `tests/golden/metadata/<surface>.json`
- expected width and height
- sanitized notes about layout, cropping, labels, and metadata clarity
- safe static command names and pass/fail status

## Forbidden Evidence

Do not paste, attach, summarize, or encode any of the following in the handoff:

- tokens
- cookies
- sessions
- auth headers
- authorization bearer values
- API keys
- `.env` values
- environment variable secret values
- Supabase keys or service role values
- raw customer payloads
- raw advertiser payloads
- account identifiers
- user identifiers
- campaign identifiers from real customer accounts
- private landing URLs
- authenticated browser state
- production request or response bodies
- storage object signed URLs
- non-fixture media
- real publisher screenshots that have not been sanitized into approved local
  fixtures

If forbidden evidence appears during review, stop and record only:

```text
Review stopped because forbidden evidence was visible. No sensitive values were
copied into this handoff.
```

## Operator Decision Block

```text
Decision: approved / blocked / needs follow-up
Surface list:
Sample state:
Approval boundary:
Evidence reviewed:
Static checks reviewed:
Blocked reason:
Next approved action:
Next forbidden action:
Operator initials:
Date:
```

Recommended approval wording for docs-only local fixture readiness:

```text
Lens local fixture preview QA is approved for <surface-list>.
This approval covers sanitized local fixture review only. It does not authorize
live capture, upload/delete, DB/storage mutation, PNG generation, PNG
replacement, pixel diffs, production API calls, or authenticated browser flows.
```

## Safe Static Checks

Allowed for this docs-only handoff:

- `git diff --check -- docs/tasks/2026-05-18_lens_local_fixture_preview_operator_review_template_v1.md`

Do not run capture, browser automation, PNG generation, upload/delete, live
network capture, or pixel-diff commands for this handoff unless a separate
approval explicitly changes the boundary.

## Stop Conditions

Stop the review before approval if:

- the requested evidence contains forbidden evidence
- the operator is asked to use a live publisher page
- the operator is asked to authenticate into a browser session
- the operator is asked to generate, replace, upload, delete, or promote PNGs
- the operator is asked to run pixel diffs
- the operator is asked to mutate DB or storage state
- the requested surface is unnamed or ambiguous
- the fixture is not clearly marked as local, static, and sanitized

## No-Touch Confirmation

This template is docs-only. It does not change runtime code, package files,
environment files, lockfiles, database schema, Vercel configuration, capture
logic, fixture assets, manifests, metadata, candidates, diffs, reports, or
golden PNGs.

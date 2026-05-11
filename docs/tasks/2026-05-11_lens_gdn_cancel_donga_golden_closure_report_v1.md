# Lens GDN Cancel, Donga Timeout, and Golden Approval Closure Report v1

Date: 2026-05-11

## Scope

Closure report for the Lens GDN queue covering:

- Batch URL dedupe
- Capture cancel control
- Donga slow-host triage and load-timeout cap
- External-sensitive GDN PC display golden approval
- Production-safe no-session smoke

Included main commits:

- `66cbd9d docs: verify Lens GDN post-merge safe smoke`
- `3646f8b docs: approve external Lens GDN golden sample`
- `d5cd2c0 fix: cap Lens Donga GDN load latency`
- `19d01f4 docs: verify Lens cancel auth guard smoke`
- `03377f4 feat: add Lens capture cancel control`

## Completed

Implementation completed:

- Client-side URL dedupe before batch submission.
- Server-side URL dedupe in the capture creation API.
- Capture cancel API path through `PATCH /api/captures`.
- Capture list cancel controls for pending/processing items.
- Cooperative worker behavior that avoids overwriting cancelled rows on
  completion.
- Donga-specific GDN page-load timeout cap to reduce long-running host stalls.
- Donga lazy-load mode tightened from default to light.

Documentation and registry completed:

- GDN PC display golden candidate marked as `external-only`.
- GDN PC display sensitivity marked as `external-sensitive`.
- No real publisher/news/creative PNG was committed as a repo golden image.
- Production-safe no-session smoke recorded after merge.

## Production-Safe Smoke Summary

No-session page behavior:

- `GET /` returned `307` to `/login?next=%2F`.
- `GET /login` returned `200` and showed the expected Lens login copy.

No-session API behavior:

- `GET /api/captures` returned `401` with `auth_required`.
- `PATCH /api/captures` with a dummy cancel body returned `401` with
  `auth_required`.
- `POST /api/captures/execute` with a dummy id returned `401` with
  `auth_required`.
- `POST /api/upload` returned `401` with `auth_required`.

## Deferred / Explicit Gate Required

Not executed in this closure:

- Authenticated Donga retry capture.
- New GDN batch run.
- Valid cancel against a real in-flight capture.
- Golden PNG generation or replacement.
- Storage cleanup/delete.
- DB row cleanup/delete.

Reason:

Authenticated Donga/cancel validation would create or mutate capture/storage
artifacts. It should stay behind a separate explicit execution gate with a
known fixture and retention policy.

## Current Risk Notes

- Donga is capped for page-load latency, but the production behavior should be
  confirmed with one controlled authenticated retry before calling it visually
  stable.
- Existing external publisher content and real creative screenshots remain
  unsuitable for repo golden PNG storage.
- Cancel is cooperative: it prevents completion state overwrite after a row is
  marked cancelled, but it does not forcibly terminate an active Chromium page
  mid-navigation.

## No-Touch Confirmation

This closure report did not perform:

- Login
- Valid cancel
- Capture execution
- Upload
- DB/Auth mutation
- Storage mutation
- Cleanup/delete
- Golden PNG / product asset creation or change

No password, token, cookie, signed URL, raw provider response, full storage path,
raw code, code hash, or product credential was recorded.

# Lens GDN Batch Cancel Post-Deploy Smoke v1

Date: 2026-05-11

## Scope

Production-safe smoke for the Lens capture cancel control added in:

- `03377f4 feat: add Lens capture cancel control`

This smoke did not log in, did not create a capture, did not upload, and did not
mutate DB/storage state.

## Result

Current local and remote main:

- `03377f4230092a094c42b4cb242a6fc32d202b59`

Allowed no-session request:

- `PATCH /api/captures`
- body shape: cancel action with a dummy UUID

Observed response:

- status: `401`
- response code: `auth_required`
- message: login required

## Decision

PASS.

The production route is deployed and remains fail-closed for no-session cancel
requests. This confirms the new cancel surface does not expose unauthenticated
state mutation.

## No-Touch Confirmation

This smoke did not perform:

- Login
- Valid cancel
- Capture execution
- Upload
- DB/Auth mutation
- Storage mutation
- Cleanup/delete
- Golden PNG / product asset change

No password, token, cookie, signed URL, raw provider response, full storage path,
or product credential was recorded.

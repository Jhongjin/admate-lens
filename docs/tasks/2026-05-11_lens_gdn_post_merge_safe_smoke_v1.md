# Lens GDN Post-Merge Safe Smoke v1

Date: 2026-05-11

## Scope

Production-safe smoke after the recent Lens GDN/cancel/golden documentation
updates on `origin/main`.

Included commits:

- `3646f8b docs: approve external Lens GDN golden sample`
- `d5cd2c0 fix: cap Lens Donga GDN load latency`
- `19d01f4 docs: verify Lens cancel auth guard smoke`
- `03377f4 feat: add Lens capture cancel control`

This smoke only checked no-session production behavior. It did not log in, did
not create a capture, did not upload a creative, and did not mutate DB/storage
state.

## Target

- production URL: `https://lens.admate.ai.kr`
- local HEAD: `3646f8b7c4cf28ecff78fbcc3910bd2a84755e56`
- `origin/main`: `3646f8b7c4cf28ecff78fbcc3910bd2a84755e56`

## Observed Results

No-session page checks:

- `GET /`
  - status: `307`
  - redirect: `/login?next=%2F`
- `GET /login`
  - status: `200`
  - login copy observed:
    - `AdMate Lens 로그인`
    - `광고 캡처 기능을 이용하려면 AdMate 계정으로 로그인하세요`
    - `이용 신청`

No-session API guard checks:

- `GET /api/captures`
  - status: `401`
  - code: `auth_required`
- `PATCH /api/captures`
  - dummy cancel body
  - status: `401`
  - code: `auth_required`
- `POST /api/captures/execute`
  - dummy capture id body
  - status: `401`
  - code: `auth_required`
- `POST /api/upload`
  - status: `401`
  - code: `auth_required`

## Decision

PASS.

The production Lens surface remains fail-closed for no-session page and API
access after the GDN Donga timeout cap, capture cancel control, and
external-sensitive golden approval documentation changes.

The Donga latency patch was not validated through a new authenticated capture in
this smoke. A real retry would create capture/storage artifacts and should stay
behind a separate explicit execution gate.

## No-Touch Confirmation

This smoke did not perform:

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

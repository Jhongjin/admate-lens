# Lens local preview unblock audit

Date: 2026-05-15

## Decision

Use the local-only fixture mode for authenticated shell visual QA.

The app already has a local-only auth bypass path in `src/lib/auth/lens-session.ts`:

- `NODE_ENV !== "production"`
- `IS_LOCAL === "true"`
- `LENS_LOCAL_AUTH_BYPASS === "true"`

When those guards are active, the existing `/api/auth/login` route can issue a local dev session cookie without calling production auth. Pair it with `LENS_LOCAL_FIXTURE_MODE=true` to make capture APIs return static fixture data and block write/execute paths before Supabase clients, storage uploads, cleanup updates, or browser capture execution.

## Safe local preview plan

1. Use only a local development server.
2. Enable the existing local bypass flags and `LENS_LOCAL_FIXTURE_MODE=true` in a local-only shell session.
3. Sign in through the normal login form with a non-secret local email and any non-empty password.
4. Review the capture workspace UI using the local session.
5. Do not execute real captures or call production endpoints during visual review.

## Guardrails

- No production bypass should exist.
- No route should expose fixture data without the existing session boundary.
- In fixture mode, capture list reads return static rows, while capture creation, cancellation, deletion, upload, and execute routes return read-only fixture errors.
- No DB, storage, auth-provider, capture execution, or secret-reading behavior is required for design review.

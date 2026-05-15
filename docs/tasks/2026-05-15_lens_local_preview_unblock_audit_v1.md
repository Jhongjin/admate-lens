# Lens local preview unblock audit

Date: 2026-05-15

## Decision

Do not add a new preview bypass route in this pass.

The app already has a local-only auth bypass path in `src/lib/auth/lens-session.ts`:

- `NODE_ENV !== "production"`
- `IS_LOCAL === "true"`
- `LENS_LOCAL_AUTH_BYPASS === "true"`

When those guards are active, the existing `/api/auth/login` route can issue a local dev session cookie without calling production auth. That is safer than adding a second unauthenticated fixture route because it keeps preview review on the same authenticated shell and API auth boundary used by the app.

## Safe local preview plan

1. Use only a local development server.
2. Enable the existing local bypass flags in a local-only environment file or shell session.
3. Sign in through the normal login form with a non-secret local email and any non-empty password.
4. Review the capture workspace UI using the local session.
5. Do not execute real captures or call production endpoints during visual review.

## Guardrails

- No production bypass should exist.
- No route should expose fixture data without the existing session boundary.
- No DB, storage, auth-provider, capture execution, or secret-reading behavior is required for design review.
- If a future fixture route is needed, it should be gated by the same local-only conditions and return static UI data only.

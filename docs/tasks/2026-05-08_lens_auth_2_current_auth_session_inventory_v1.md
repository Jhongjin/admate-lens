# Gate Lens-Auth-2 Current Auth Session Inventory v1

Date: 2026-05-08
Repo: `admate-lens`
Product: AdMate Lens
Scope: read-only inventory only

## 1. Goal

Record the current Lens auth, session, route-guard, and API-guard state before implementing a Lens-local login shell.

This gate does not implement auth or modify routes, APIs, capture behavior, storage behavior, or output handling.

## 2. Current App Structure Relevant To Auth

Current App Router structure is minimal:

- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/api/captures/route.ts`
- `src/app/api/captures/execute/route.ts`
- `src/app/api/upload/route.ts`
- `src/app/api/yt-storyboard/route.ts`

Current notable absences:

- no `/login` route under `src/app`
- no `middleware.ts`
- no dedicated review route
- no dedicated preview route
- no dedicated history route

Operational implication:

- Lens currently behaves as a single product shell rooted at `/`
- capture workspace, result review, and preview modal are UI states inside the root page, not separate protected routes

## 3. Current No-Session User Behavior

### 3.1 Root Route `/`

Current observed behavior from `src/app/page.tsx`:

- the Lens product shell renders directly
- navigation, capture home, capture workspace, result review, campaign review, asset review, and coverage sections are all visible from the root page
- no visible session lookup, auth check, or redirect is present in the root page component

Current no-session effect:

- a user without a session can reach `/`
- the user sees Lens product context immediately
- the user can attempt to use the capture UI and review UI until an API or backend layer blocks them, if any such block exists elsewhere

### 3.2 Capture Workspace State

Current observed behavior:

- capture form is rendered inside the root page
- there is no route split between public Lens shell and protected capture workspace
- there is no login shell before the capture form is displayed

Current no-session effect:

- a no-session user can reach the capture workspace section from `/`
- there is no built-in redirect to `/login?next=...`

### 3.3 Preview / History State

Current observed behavior:

- `CaptureList` is rendered inside the root page
- preview workspace is a modal launched from the result list inside `CaptureList.tsx`
- there is no dedicated preview route or history route

Current no-session effect:

- a no-session user can reach the result review section on the root page
- if capture rows are returned, the preview modal can be opened from the same page
- there is no route-level login boundary around history or preview

## 4. Current Session / Auth Helper Inventory

### 4.1 Supabase Helper Inventory

Current helper file:

- `src/lib/supabase/client.ts`

Current exports:

- `createBrowserClient()`
- `createServerClient()`

Observed behavior:

- `createBrowserClient()` uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `createServerClient()` uses `SUPABASE_SERVICE_ROLE_KEY`
- `createServerClient()` sets `auth: { persistSession: false }`

Important implication:

- the server helper is currently a service-role client, not a request-bound user session helper
- there is no visible helper in this repo for:
  - resolving the current signed-in user from cookies
  - resolving a session from request headers
  - redirecting unauthenticated users to a local login page

### 4.2 Missing Auth Helpers

Not found in current repo inventory:

- Lens-local login shell helper
- route auth guard helper
- API auth guard helper
- `next` sanitizer helper
- middleware-based auth entrypoint
- request-scoped user session resolver

## 5. Protected UI Surface Inventory

The following Lens UI surfaces should be treated as protected candidates.

### 5.1 Root Product Shell

Candidate protection level:

- partially protected or split-shell candidate

Reason:

- the root page currently contains both product framing and operational capture tools
- the future implementation may need to decide whether `/` becomes:
  - fully protected
  - a branded login-first shell
  - or a lightweight public product shell that defers operational sections until session exists

### 5.2 Capture Form

Current file:

- `src/app/components/CaptureForm.tsx`

Protection need:

- protected

Reason:

- allows creation of capture requests
- directly participates in capture workflow

### 5.3 Capture List / Result Review

Current file:

- `src/app/components/CaptureList.tsx`

Protection need:

- protected

Reason:

- exposes recent capture history
- exposes status and diagnostics
- may expose result URLs and storage paths

### 5.4 Preview Workspace

Current location:

- modal inside `CaptureList.tsx`

Protection need:

- protected

Reason:

- exposes output URLs
- exposes storage-path-related review state
- allows open-original and download actions

## 6. Protected API Inventory

### 6.1 `/api/captures`

Current file:

- `src/app/api/captures/route.ts`

Current observed behavior:

- GET returns capture list
- POST creates capture requests
- DELETE deletes capture rows and storage folders
- no visible auth guard or session check is present

Protection need:

- protected

### 6.2 `/api/captures/execute`

Current file:

- `src/app/api/captures/execute/route.ts`

Current observed behavior:

- POST executes capture jobs
- no visible auth guard or session check is present

Protection need:

- protected

### 6.3 `/api/upload`

Current file:

- `src/app/api/upload/route.ts`

Current observed behavior:

- POST uploads creative assets and returns public URL/path metadata
- no visible auth guard or session check is present

Protection need:

- protected

### 6.4 `/api/yt-storyboard`

Current file:

- `src/app/api/yt-storyboard/route.ts`

Current observed behavior:

- not deeply audited in this gate
- route exists and should be included in the auth review list

Protection candidate:

- review required before implementation gate

### 6.5 Download / Storage Exposure

Current observed pattern:

- preview actions use direct output URLs from capture records
- there is no separate authenticated download route in `src/app/api`
- there is no dedicated storage proxy route in `src/app/api`

Implication:

- output URL exposure control currently depends on what the record already contains
- a future auth gate must review whether unauthenticated UI or API paths can surface storage-linked values too early

## 7. Current Route Guard Inventory

Current result:

- no route guard found in `src/app/page.tsx`
- no `middleware.ts` found
- no dedicated login route found
- no redirect-to-login flow found

Current route boundary status:

- route guard is effectively absent for Lens product UI

## 8. Current API Guard Inventory

Current result:

- no visible session or auth guard in:
  - `src/app/api/captures/route.ts`
  - `src/app/api/captures/execute/route.ts`
  - `src/app/api/upload/route.ts`

Current API boundary status:

- API guard is effectively absent in the currently reviewed Lens routes

## 9. Candidate Files For Product Login Shell Integration

This gate does not implement changes. It only records likely candidates.

### 9.1 Product Shell Candidates

- `src/app/page.tsx`
- `src/app/components/CaptureForm.tsx`
- `src/app/components/CaptureList.tsx`

Potential role:

- split product shell from protected workspace
- defer protected sections until session exists
- preserve Lens product identity on no-session access

### 9.2 Login Route Candidate

Likely new route:

- `src/app/login/page.tsx`

Potential role:

- Lens-local login shell
- accept sanitized `next`
- preserve AdMate Lens branding and copy

### 9.3 Auth Utility Candidates

- `src/lib/supabase/client.ts`
- future Lens-local auth helper file for:
  - request session resolution
  - route redirect decision
  - `next` sanitization

### 9.4 API Protection Candidates

- `src/app/api/captures/route.ts`
- `src/app/api/captures/execute/route.ts`
- `src/app/api/upload/route.ts`
- review `src/app/api/yt-storyboard/route.ts`

## 10. `/login?next=...` Allowlist Candidate Inventory

Because Lens currently lives on a single root route with section-based navigation, immediate `next` candidates are narrow.

### 10.1 Safe Current Candidates

Current same-origin candidates:

- `/`
- `/#lens-home`
- `/#capture-studio`
- `/#result-review`
- `/#campaign-review`
- `/#asset-library`
- `/#coverage-matrix`

### 10.2 Future Candidate Shapes

If Lens later introduces explicit review or preview routes, future allowlist review may include:

- `/?view=review`
- `/?view=studio`
- `/?captureId=<id>`
- a future dedicated same-origin review route

These are not current routes today. They should not be pre-approved blindly without implementation review.

### 10.3 Rejected Candidate Classes

Should be rejected in the future sanitizer:

- external absolute URL
- protocol-relative URL
- `/api` target
- `javascript:` target

## 11. Sentinel Access Request Link Candidate

Current candidate already present in product shell copy:

- `https://sentinel.admate.ai.kr/access-request`

Observed source:

- external links block in `src/app/page.tsx`

Current product copy intent:

- Sentinel is already used as the access request destination candidate
- this aligns with the Lens-local login shell plan and does not require inventing a new access-request location

## 12. Key Inventory Findings

1. Lens currently has no visible local login shell.
2. Lens currently has no visible route guard.
3. Lens currently has no visible API auth guard in reviewed routes.
4. Lens operational UI is concentrated inside `/`, not split into multiple protected routes.
5. Preview and history are currently UI state within the root page, not standalone routes.
6. A Lens-local `/login?next=...` approach is structurally compatible with the current product shell.
7. `next` allowlist should start narrow because Lens currently has only one real page route.
8. Sentinel access request already has a plausible external destination in current product copy.

## 13. Recommended Next Gate

Recommended next gate:

```text
Gate Lens-Auth-3 local login shell implementation plan
```

Suggested scope:

- convert this inventory into an implementation plan
- decide whether `/` becomes fully protected or split-shell
- define request-scoped session helper approach
- define route guard and API guard alignment
- define exact `next` sanitizer contract

Follow-up implementation gate after that:

```text
Gate Lens-Auth-4 local login shell skeleton
```

Implementation must still keep capture engine, rendering, composite, injection, API contract expansion, DB schema, env, and storage changes out of scope unless explicitly approved.

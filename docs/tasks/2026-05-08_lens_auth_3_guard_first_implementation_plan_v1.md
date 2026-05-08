# Gate Lens-Auth-3 Guard-First Implementation Plan v1

Date: 2026-05-08
Repo: `admate-lens`
Product: AdMate Lens
Scope: implementation planning only

## 1. Goal

Define the safest implementation order for protecting AdMate Lens with a Lens-local login shell and minimal auth guards, without touching capture engine or output logic.

This gate does not implement auth, execute captures, change APIs, or alter storage behavior.

## 2. Why Guard-First

Lens currently exposes:

- root product shell at `/`
- capture form on the root page
- capture list and preview workspace on the root page
- capture creation, execution, and upload APIs without visible auth guards in the currently reviewed code

That means the first auth implementation priority should be:

- stop unauthenticated capture creation and execution paths
- preserve Lens product context for users who reach the UI without a session

## 3. Recommended Implementation Order

Recommended order:

1. introduce Lens-local `/login?next=...` shell
2. add minimal route handling for no-session Lens entry
3. add API guards for capture creation, execution, and upload
4. align route guard and API guard behavior
5. validate deep-link and storage exposure behavior

Reason:

- UI-only login shell without API guard still leaves direct API access open
- API guard without UI login shell creates a broken product experience
- capture execution and upload should be blocked before broader UI polish

## 4. `/login?next=...` Introduction Scope

### 4.1 Initial Scope

Initial scope should be narrow and same-origin only.

Recommended first supported targets:

- `/`
- `/#lens-home`
- `/#capture-studio`
- `/#result-review`
- `/#campaign-review`
- `/#asset-library`
- `/#coverage-matrix`

### 4.2 Login Route Shape

Recommended route:

```text
/login?next=<same-origin-path-or-hash>
```

Recommended shell behavior:

- keep AdMate Lens branding visible
- explain that login is required to access capture and evidence workflows
- expose access request as a secondary path
- return the user to the sanitized Lens destination after successful login

## 5. No-Session Handling For `/`

### 5.1 Decision Point

`/` is currently both:

- a Lens-branded product shell
- the operational capture workspace

That means the team must choose between two patterns.

### 5.2 Preferred Pattern

Preferred near-term pattern:

- no-session request to `/`
- render Lens-local login shell instead of the full operational workspace

Reason:

- simplest mental model
- strongest default protection
- avoids partially interactive no-session capture UI

### 5.3 Alternative Pattern

Alternative pattern:

- keep a public branded shell on `/`
- hide or replace capture form, result review, and preview entry with login CTA

This can work later, but it adds more UI branching and is not the simplest first implementation.

Recommendation:

- for Auth-4 implementation, treat `/` as login-gated for operational use first

## 6. API Guard Priority

### 6.1 Highest Priority

Protect these first:

1. `POST /api/captures/execute`
2. `POST /api/upload`
3. `POST /api/captures`

Reason:

- capture execution and upload are the most direct state-changing surfaces
- capture creation should not be allowed if the user is not authenticated

### 6.2 Second Priority

Protect:

4. `GET /api/captures`
5. `DELETE /api/captures`

Reason:

- capture list and deletion expose operational history and evidence metadata

### 6.3 Review Priority

Review:

6. `POST /api/yt-storyboard` or any related helper path

Reason:

- not the primary focus of this gate
- still part of the broader auth surface review

## 7. Minimal Guard Candidates

### 7.1 Minimum API Guard Set

Before any broader auth refactor, the minimum viable protection candidate is:

- reject unauthenticated requests to:
  - `POST /api/captures`
  - `POST /api/captures/execute`
  - `POST /api/upload`

Expected outcome:

- no one can submit capture jobs or uploads without a valid session

### 7.2 Minimum UI Guard Set

Minimum UI candidate:

- no-session request to `/`
- redirect or render login shell flow via Lens-local `/login`

Expected outcome:

- the user lands in a Lens-branded auth entry instead of directly using the workspace

### 7.3 Why This Is The Minimum

This minimum set blocks the highest-risk unauthenticated actions without yet requiring:

- new capture routes
- capture engine changes
- storage redesign
- cross-domain auth sharing

## 8. Next Allowlist Candidates

Recommended initial allowlist:

- `/`
- `/#lens-home`
- `/#capture-studio`
- `/#result-review`
- `/#campaign-review`
- `/#asset-library`
- `/#coverage-matrix`

Recommended optional future candidates after explicit route design:

- `/?view=studio`
- `/?view=review`
- future same-origin preview route

Always reject:

- external absolute URLs
- protocol-relative URLs
- `/api` paths
- `javascript:` payloads

## 9. Sentinel Access Request Link Candidate

Recommended external access request target:

```text
https://sentinel.admate.ai.kr/access-request
```

Recommended usage:

- keep sign-in primary
- show `이용 신청` as secondary action
- do not send the user to Sentinel before they understand they are entering AdMate Lens

## 10. Same Gate Or Split Gate?

### 10.1 Recommendation

Do not put the full UI login shell and all API guards into one first implementation gate.

Recommended split:

- Gate Lens-Auth-4: Lens-local login shell skeleton + `next` sanitization
- Gate Lens-Auth-5: capture API guard minimum set
- Gate Lens-Auth-6: route/API alignment and deep-link QA

### 10.2 Why Split

Reasons to split:

- lower blast radius
- easier validation
- easier rollback
- clearer separation between product entry UX and operational protection logic

### 10.3 Exception

If the team wants one combined implementation gate, the allowed combined scope should still stay narrow:

- Lens-local `/login`
- root no-session handling
- minimal guards only for `POST /api/captures`, `POST /api/captures/execute`, `POST /api/upload`

Anything beyond that should stay out of the first implementation pass.

## 11. Capture Boundary

Auth implementation must not touch:

- `src/lib/capture/**`
- rendering
- composite
- injection
- capture output pixels
- upload storage object format
- screenshot composition

The auth work should stay in:

- page entry flow
- login shell
- route guard
- API guard
- request/session helper
- `next` sanitization

## 12. Candidate Implementation Files

Likely implementation candidates:

- `src/app/page.tsx`
- future `src/app/login/page.tsx`
- `src/app/api/captures/route.ts`
- `src/app/api/captures/execute/route.ts`
- `src/app/api/upload/route.ts`
- review `src/app/api/yt-storyboard/route.ts`
- `src/lib/supabase/client.ts`
- future Lens-local auth helper for request session resolution and `next` sanitization

No file changes are part of this gate.

## 13. Validation Plan

### 13.1 Login Shell Validation

Validate:

- no-session user reaching `/`
- redirect or login-shell render behavior
- Lens branding remains visible
- access request link opens expected Sentinel flow
- valid `next` returns to same-origin Lens destination
- invalid `next` falls back safely

### 13.2 API Guard Validation

Validate:

- unauthenticated `POST /api/captures` denied
- unauthenticated `POST /api/captures/execute` denied
- unauthenticated `POST /api/upload` denied
- authenticated requests still work through normal flow

### 13.3 Alignment Validation

Validate:

- UI no-session experience and API denial tell the same story
- preview/history entry does not reveal storage-linked values before auth
- no unauthenticated path can trigger capture execution or upload

## 14. Recommended Next Gates

### Gate Lens-Auth-4

```text
Gate Lens-Auth-4 local login shell skeleton
```

Scope:

- add `/login`
- add Lens branding and user-facing copy
- add `next` sanitizer helper
- define no-session behavior for `/`

### Gate Lens-Auth-5

```text
Gate Lens-Auth-5 minimal capture API guards
```

Scope:

- protect `POST /api/captures`
- protect `POST /api/captures/execute`
- protect `POST /api/upload`

### Gate Lens-Auth-6

```text
Gate Lens-Auth-6 route and API alignment QA
```

Scope:

- confirm login return flow
- confirm API denial behavior
- confirm no storage/output exposure before auth

## 15. Approval Prompt

Use this prompt for the next implementation gate:

```text
Gate Lens-Auth-4 local login shell skeleton을 승인한다.

범위:
- Lens-local /login route 추가
- no-session / 접근 시 Lens login shell 진입
- /login?next=... same-origin sanitizer 적용
- Sentinel access-request 링크 유지

금지:
- capture engine/rendering/composite/injection 변경 금지
- capture output image나 preview output mutation 금지
- golden PNG 추가 금지
- API/DB/schema/env/storage 변경은 최소화하고, capture API guard는 다음 Gate로 분리

검증:
- no-session / 처리
- valid next return
- invalid next fallback
- Lens branding/copy 확인
```

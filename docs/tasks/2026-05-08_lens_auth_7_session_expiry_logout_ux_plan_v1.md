# Gate Lens-Auth-7 Session Expiry And Logout UX Plan v1

Date: 2026-05-08
Repo: `admate-lens`
Product: AdMate Lens
Scope: implementation planning only

## 1. Goal

Define the next UX layer after the Lens login guard rollout so operators can clearly understand:

- when their session has expired
- why a capture action stopped
- what happens after logout
- how they return to the correct Lens context

This gate does not implement code, log in, upload files, execute captures, or modify storage/schema/env/assets.

## 2. Current Post-Auth-4 State

Current state after Auth-4 and Auth-5:

- no-session `/` redirects to `/login?next=%2F`
- no-session `GET /api/captures` returns `401`
- no-session `POST /api/captures/execute` returns `401`
- no-session `POST /api/upload` returns `401`
- Lens-local login shell exists
- production smoke passed

Current UX gap:

- the API boundary now fails closed
- the operator UI still needs a consistent session-expired experience once a previously authenticated session becomes invalid during use

## 3. Session Expiry UX Principle

Recommended product principle:

```text
세션 만료는 조용한 실패가 아니라, 이유와 다음 행동이 분명한 재로그인 안내로 처리한다.
```

Required operator outcome:

- the user understands the request failed because authentication expired
- the UI avoids pretending the action is still processing
- the user gets a direct path back to Lens login
- the intended Lens destination is preserved when safe

## 4. 401 Handling Scope

The following routes need explicit client-facing 401 handling UX:

- `GET /api/captures`
- `POST /api/captures`
- `POST /api/captures/execute`
- `POST /api/upload`

Recommended product grouping:

- capture creation / upload flow
- history / preview fetch flow
- explicit logout flow

## 5. Capture Form 401 UX

### 5.1 Trigger Cases

Handle session-expired or unauthenticated responses during:

- capture request creation
- creative upload
- any later authenticated capture submit action

### 5.2 Recommended User Copy

Primary user-facing message:

- `로그인 세션이 만료되었습니다`
- `광고 캡처를 계속하려면 다시 로그인하세요`

Optional supporting copy:

- `작성 중인 입력값은 유지하고, 로그인 후 다시 요청할 수 있습니다`

### 5.3 Recommended UX Behavior

Recommended sequence:

1. stop loading state immediately
2. show inline or toast-style auth-expired message
3. preserve current form values in memory
4. show a primary `다시 로그인` action
5. route to `/login?next=/#capture-studio` or equivalent safe Lens destination

### 5.4 Avoid

Avoid these failure patterns:

- generic `서버 오류`
- infinite spinner
- silent no-op
- clearing operator inputs before re-login

## 6. Preview / History 401 UX

### 6.1 Trigger Cases

Handle session-expired responses during:

- capture list fetch
- history refresh
- preview/detail fetch if later split into dedicated route/API state

### 6.2 Recommended User Copy

Primary user-facing message:

- `로그인 세션이 만료되어 결과 목록을 불러올 수 없습니다`
- `다시 로그인 후 Lens 결과 검수를 이어가세요`

Optional supporting copy:

- `보호된 캡처 결과와 메타데이터는 로그인 후에만 확인할 수 있습니다`

### 6.3 Recommended UX Behavior

Recommended sequence:

1. stop polling / repeated retries
2. replace list body with auth-expired empty state
3. show primary `다시 로그인` action
4. route to `/login?next=/#result-review`

For preview modal specifically:

- if a modal is open and a protected refresh fails with `401`, close or freeze further protected actions
- show a clear message that re-login is required before opening protected result details again

## 7. Logout Button And Placement Candidates

### 7.1 Primary Candidate

Recommended first placement:

- top-right area of the Lens operator topbar

Reason:

- easiest for operators to discover
- consistent with product-shell identity
- no need to expose auth controls inside capture-output surfaces

### 7.2 Secondary Candidate

Optional later placement:

- sidebar footer action

Reason:

- useful if topbar becomes crowded
- works for persistent operator navigation shells

### 7.3 Recommendation

For MVP follow-up:

- place logout in the topbar first
- keep it outside capture output and preview image actions

## 8. Logout Redirect Candidate

Recommended logout result:

- clear Lens auth cookies
- send user to `/login`

Optional future variant:

- `/login?next=%2F`

Recommended MVP choice:

- plain `/login`

Reason:

- logout is intentional
- the user should land on a clean Lens entry shell
- preserving the previous protected destination is less important for explicit logout than for expiry recovery

## 9. `/login?next=...` Retention Rules

Recommended rule:

- keep `next` for session-expiry recovery
- do not overuse `next` for explicit logout

### 9.1 Keep `next`

Keep safe same-origin `next` when:

- a protected route redirected the user after session expiry
- a capture form action returned `401`
- a history / preview fetch returned `401`

Recommended destinations:

- `/`
- `/#capture-studio`
- `/#result-review`
- future safe same-origin review routes

### 9.2 Drop `next`

Drop or simplify `next` when:

- the user explicitly clicked logout
- the `next` target is invalid
- the `next` target is stale or no longer supported

## 10. Token Refresh Decision

### 10.1 Recommendation

Do not add automatic token refresh in this MVP guard follow-up.

### 10.2 Reason

Reasons:

- current priority is understandable failure UX
- automatic refresh expands auth/session complexity
- refresh handling should be designed together with broader request-scoped auth behavior, not bolted onto the minimal guard pass

### 10.3 Near-Term Strategy

Near-term strategy:

- detect `401`
- show session-expired UX
- return the user to Lens login with safe `next`

### 10.4 Later Follow-Up

Later candidate:

- evaluate a controlled refresh path only after authenticated flow QA is stable

## 11. Blockers Before Authenticated Flow QA And Visual QA

The following should be addressed before deeper authenticated QA and visual QA:

1. explicit client-side 401 handling in `CaptureForm`
2. explicit client-side 401 handling in `CaptureList`
3. logout entry placement chosen
4. logout redirect behavior chosen
5. no repeated polling loop on expired session

These are not blockers for the guard rollout itself, but they are blockers for a polished authenticated operator QA pass.

## 12. Candidate Implementation Files

Likely implementation candidates:

- `src/app/components/CaptureForm.tsx`
- `src/app/components/CaptureList.tsx`
- `src/app/LensHomePageClient.tsx`
- `src/app/login/LoginShell.tsx`
- `src/app/api/auth/logout/route.ts`
- `src/lib/auth/lens-session.ts`

Possible helper additions:

- small client auth-error helper for `401` detection
- shared redirect helper for safe `/login?next=...` navigation

Out of scope:

- `src/lib/capture/**`
- rendering
- composite
- injection
- storage signing changes
- DB/schema/env changes

## 13. Recommended Implementation Split

Recommended follow-up order:

### Gate Lens-Auth-8

```text
session expiry UX in CaptureForm and CaptureList
```

Scope:

- detect `401`
- show user-facing auth-expired messages
- route to safe Lens login with preserved `next`

### Gate Lens-Auth-9

```text
logout button and redirect polish
```

Scope:

- add logout button in operator shell
- confirm post-logout route
- verify no sensitive state remains visible

### Gate Lens-Auth-10

```text
authenticated operator flow QA
```

Scope:

- approved authenticated capture request path
- approved history / preview path
- expired-session retry behavior

## 14. Verification Plan

### 14.1 Session Expiry UX Verification

Check:

1. authenticated operator reaches capture form
2. session becomes invalid
3. capture submit returns `401`
4. capture form shows session-expired message
5. `다시 로그인` returns user to `/login?next=...`

### 14.2 Preview / History Verification

Check:

1. authenticated operator opens result review
2. session becomes invalid
3. list refresh returns `401`
4. UI stops polling and shows re-login state
5. `다시 로그인` returns user to `/login?next=/#result-review`

### 14.3 Logout Verification

Check:

1. operator clicks logout
2. cookies are cleared
3. user lands on intended logout destination
4. protected routes and APIs return to no-session behavior

### 14.4 Regression Boundary

Confirm:

- no capture engine execution change
- no output fidelity change
- no storage signing policy change
- no schema/env change

## 15. Approval Prompt

Use this prompt for the next implementation gate:

```text
Gate Lens-Auth-8 session expiry UX를 승인한다.

범위:
- CaptureForm의 401 처리 UX 추가
- CaptureList의 401 처리 UX 추가
- 다시 로그인 버튼에서 안전한 /login?next=... 이동 적용
- 세션 만료 시 polling/submit loading 정리

금지:
- capture engine/rendering/composite/injection 변경 금지
- capture 실행 금지
- upload 흐름 구조 변경 최소화
- storage signing, DB/schema/env, golden PNG/asset 변경 금지

검증:
- capture form 401 문구 확인
- history/preview 401 문구 확인
- no-session 복귀 동작 확인
- staged 파일 범위 확인
```

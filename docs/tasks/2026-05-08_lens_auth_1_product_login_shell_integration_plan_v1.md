# Gate Lens-Auth-1 Product Login Shell Integration Plan v1

Date: 2026-05-08
Repo: `admate-lens`
Product: AdMate Lens
Scope: implementation planning only

## 1. Goal

Design a Lens-local login shell flow that preserves AdMate Lens product context when a user without a valid session attempts to access protected Lens pages or APIs.

This gate does not implement auth, change routes, modify APIs, or alter capture behavior.

## 2. Planning Assumptions

- Agent Core Auth / Product Login 1st phase is already available as a reference pattern.
- AdMate Compass already uses a local login shell approach.
- AdMate Lens should prefer a Lens-local login shell before any cross-domain session sharing attempt.
- Cross-domain product session coupling is considered higher risk and out of scope for this gate.
- Capture output, renderer, composite, injection, and storage behavior must remain unchanged.

## 3. Current Lens No-Session Behavior

Based on the current repo code:

- `src/app/page.tsx` renders the Lens product shell directly with no visible session gate or login redirect.
- `CaptureList` is mounted inside the root Lens page and fetches `/api/captures` directly from the client.
- `src/app/api/captures/route.ts` currently accepts GET, POST, and DELETE request handling without a visible auth/session guard.
- `src/app/api/captures/execute/route.ts` currently accepts POST execution requests without a visible auth/session guard.
- `src/app/api/upload/route.ts` currently accepts POST upload requests without a visible auth/session guard.

Operational consequence:

- A no-session user can currently reach the Lens product shell and attempt to interact with capture-oriented UI until API behavior or upstream infrastructure blocks it elsewhere.
- The product does not currently preserve Lens context through an explicit login handoff flow.

## 4. Protected Lens Surfaces

The following surfaces should be treated as protected in the Lens product login design.

### 4.1 Protected UI Screens

- capture form
- capture list
- preview workspace

### 4.2 Protected API Endpoints

- `POST /api/captures`
- `GET /api/captures`
- `DELETE /api/captures`
- `POST /api/captures/execute`
- `POST /api/upload`

Additional note:

- `yt-storyboard` should be reviewed during implementation even though it is not the core user-facing access path called out in this gate. If it can reveal operational data or assist capture creation, it should follow the same auth review.

## 5. Recommended Product Flow

### 5.1 Primary Flow

Recommended Lens-local product flow:

```text
protected Lens route with no session
-> redirect to /login?next=<same-origin-path>
-> Lens-local login shell
-> successful sign-in
-> redirect back to sanitized next path
```

### 5.2 Access Request Flow

If the user does not have access:

- keep the login shell inside Lens
- expose an external access request link
- send that link to Agent Core / Sentinel access request

Recommended external destination:

```text
https://sentinel.admate.ai.kr/access-request
```

### 5.3 Product Context Rule

The user should feel that they are still entering AdMate Lens, not getting dropped into a generic shared auth wall with lost context.

That means:

- Lens branding remains present on the login shell
- the page copy names AdMate Lens directly
- the return path stays inside Lens after success
- access request is a secondary path, not the primary route

## 6. User-Facing Copy

Recommended product copy:

- `AdMate Lens 로그인`
- `광고 캡처와 증빙 확인을 이용하려면 AdMate 계정으로 로그인하세요`
- `접근 권한이 없다면 이용 신청`

Optional supporting copy:

- `로그인 후 현재 보려던 Lens 화면으로 돌아갑니다`
- `권한 신청은 AdMate Sentinel 접근 요청 흐름에서 처리합니다`

## 7. Next Sanitizer Rules

The `next` parameter must be treated as untrusted input.

### 7.1 Allowed Form

Allow only:

- same-origin relative path

Examples of acceptable shape:

- `/`
- `/captures`
- `/captures/review`
- `/?view=review`

### 7.2 Rejected Forms

Block:

- external absolute URLs
- protocol-relative URLs such as `//example.com`
- `/api` targets
- `javascript:` targets

### 7.3 Recommended Sanitizer Outcome

Sanitizer behavior:

1. If `next` is empty, return `/`.
2. If `next` is not a relative path beginning with `/`, return `/`.
3. If `next` begins with `//`, return `/`.
4. If `next` begins with `/api`, return `/`.
5. If `next` contains `javascript:`, return `/`.
6. Keep querystring and hash only when the base path itself is valid and same-origin relative.

## 8. Recommended Lens Login Shell Shape

### 8.1 Lens-Local Shell

Preferred pattern:

- Lens has its own `/login` route
- the page is visually a Lens product entry shell
- actual auth submit action can delegate to the shared auth backend pattern already proven in Agent Core Auth

### 8.2 Shell Content

Recommended content blocks:

1. Lens product identity
2. short explanation of why login is required
3. primary sign-in action
4. secondary access request link
5. optional note that successful login returns the user to the same Lens path

### 8.3 Product Boundary

The login shell is an operator/product access shell only.

It must not:

- expose capture output
- expose storage URLs
- preload protected result metadata
- execute capture flows

## 9. Route Guard And API Guard Alignment

Implementation should treat route guard and API guard as one product boundary, not two unrelated features.

### 9.1 Route Guard

Protected UI states should not render the active Lens workspace for no-session users.

Preferred user experience:

- unauthenticated request
- Lens-local login shell
- safe return to a sanitized Lens route

### 9.2 API Guard

Protected APIs should reject unauthenticated use even if the UI shell is bypassed.

Required principle:

- UI route guard alone is insufficient
- API guard alone is insufficient for product experience
- both must agree on the protected product boundary

## 10. Implementation Candidate Files

This gate does not implement changes, but the most likely implementation files are:

### 10.1 Lens Product Shell

- `src/app/page.tsx`
- `src/app/components/CaptureForm.tsx`
- `src/app/components/CaptureList.tsx`

Possible roles:

- defer protected workspace rendering when no session is present
- present a Lens-local login shell entry state
- preserve same-origin `next` behavior for deep links

### 10.2 Login Route

Potential new route candidates:

- `src/app/login/page.tsx`
- optional shared local helper near the login route for `next` sanitization

### 10.3 Route-Level Protection

Potential protection candidates:

- route-level server guard in the App Router page layer
- a Lens-local middleware review, only if consistent with existing product auth patterns

This should be decided carefully during implementation because middleware can broaden blast radius.

### 10.4 Protected APIs

- `src/app/api/captures/route.ts`
- `src/app/api/captures/execute/route.ts`
- `src/app/api/upload/route.ts`
- review `src/app/api/yt-storyboard/route.ts`

### 10.5 Shared Product/Auth Utilities

Potential future helper areas:

- `src/lib/supabase/client.ts`
- a future Lens-local auth helper for session resolution and `next` sanitization

No file should be changed in this gate.

## 11. Test Plan

### 11.1 Route Guard Tests

Minimum route scenarios:

1. No session hits protected Lens route.
2. User is redirected to `/login?next=<same-origin-path>`.
3. Successful login returns the user to the sanitized original Lens route.
4. Invalid `next` falls back to `/`.
5. Preview deep link preserves the intended Lens destination when valid.

### 11.2 API Guard Tests

Minimum API scenarios:

1. No session requests `/api/captures`.
2. No session requests `/api/captures/execute`.
3. No session requests `/api/upload`.
4. Authenticated request succeeds through the normal path.
5. API responses do not expose protected storage URLs when auth is missing.

### 11.3 Product Copy Tests

Check:

- Lens branding appears on login shell
- login reason copy is visible
- access request link is present
- the user is not shown unrelated product branding first

### 11.4 Deep Link Tests

Check:

- review-focused Lens route
- preview workspace link with querystring
- fallback to `/` when `next` is invalid

## 12. Risks

### 12.1 Route Guard vs API Guard Mismatch

Risk:

- UI blocks entry but API still works directly
- API blocks but UI flow feels broken or loops

Impact:

- inconsistent operator experience
- partial protection

### 12.2 Preview Deep Link Next Handling

Risk:

- deep-linked preview or review route is lost after login
- unsafe `next` handling opens redirect issues

Impact:

- broken operator workflow
- auth redirect vulnerability

### 12.3 Storage URL Exposure

Risk:

- login shell or unauthenticated API path reveals output or storage information

Impact:

- evidence asset exposure
- operator-only data leak

### 12.4 Cross-Domain Session Coupling

Risk:

- trying to share session state across product domains too early increases complexity and failure modes

Impact:

- fragile auth behavior
- debugging cost across products

Mitigation:

- Lens-local login shell first
- shared auth backend pattern later only if clearly necessary

## 13. Recommended Rollout Strategy

### Gate Lens-Auth-2

Recommended next gate:

```text
Gate Lens-Auth-2 local login shell skeleton
```

Scope:

- add Lens-local `/login` shell
- add `next` sanitizer helper
- preserve Lens product branding and access request link
- no capture engine changes

### Gate Lens-Auth-3

Recommended follow-up:

```text
Gate Lens-Auth-3 route guard and API guard alignment
```

Scope:

- protect Lens product routes
- protect capture/upload APIs
- ensure same session model is used on both sides

### Gate Lens-Auth-4

Recommended final verification gate:

```text
Gate Lens-Auth-4 deep link and storage exposure QA
```

Scope:

- preview deep-link return checks
- API unauthenticated denial checks
- no storage URL exposure checks

## 14. Approval Prompt

Use this prompt for the next implementation gate:

```text
Gate Lens-Auth-2 local login shell skeleton을 승인한다.

범위:
- Lens-local /login shell 추가
- protected Lens route no-session -> /login?next=<same-origin-path> 흐름 적용
- AdMate Lens 제품 맥락 유지
- 접근 권한이 없다면 이용 신청 링크를 Sentinel access-request로 연결
- next sanitizer는 same-origin relative path만 허용

금지:
- capture engine/rendering/composite/injection 변경 금지
- API/DB/schema/env/storage 변경 최소화, 필요 시 별도 gate로 분리
- capture output image나 preview output mutation 금지
- golden PNG 추가 금지

검증:
- no-session route redirect
- valid next return
- invalid next fallback
- protected API auth review 계획 정리
- storage URL 노출 없음 확인
```

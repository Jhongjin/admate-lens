# Gate Lens-Auth-11 Authenticated Execution QA Result v1

Date: 2026-05-09
Repo: `admate-lens`
Product: AdMate Lens
Scope: one-time authenticated execution QA
Outcome: `pass`

## 0. Attempt Lineage

This document records the successful authenticated QA run performed through an isolated remote-debug browser session.

It supersedes the earlier blocked attempt that could not safely attach to the user's existing authenticated browser context.

## 1. Goal

Verify one authenticated AdMate Lens capture flow using the confirmed Auth-11A target values, while keeping password, token, cookie, signed URL, and raw provider response data out of the QA record.

## 2. Auth-11A Confirmed Inputs

### 2.1 Account Scope

- account email used by the human operator: `woolela@nasmedia.co.kr`
- account class: approved `super_admin`
- purpose: authenticated Lens flow verification only

Important note:

- this gate validates authenticated execution with a `super_admin` session
- it does **not** validate general-user permission UX

### 2.2 Safe Fixture

- publisher URL: `https://www.yna.co.kr/`
- creative input method: URL input only
- creative URL class: internal/public validation asset
- upload path was intentionally avoided

## 3. Execution Boundary

The run followed the approved minimal scope:

- authenticated Lens home access confirmed
- one capture request submitted
- one capture execution path observed
- no repeated capture execution
- no upload performed
- no cleanup/delete performed

## 4. Authentication Confirmation

Authenticated Lens workspace access was confirmed through the isolated QA browser session.

Observed signs of active authenticated state:

- Lens home opened directly instead of the login shell
- top-bar `로그아웃` entry point was visible
- capture workspace and result-review surfaces were accessible
- no auth-expired banner appeared during the active session

## 5. Fixture And Submission Summary

Submission profile:

- channel family: GDN / Google Ads
- publisher preset target: `연합뉴스`
- publisher URL host: `www.yna.co.kr`
- creative input mode: URL input
- creative value class: non-sensitive public/internal validation asset

No advertiser-sensitive, campaign-sensitive, or client-confidential input was used in the recorded QA result.

## 6. One-Time Execution Result

Observed submission feedback:

```text
완료: 1개 사이트 캡처 요청이 생성되었습니다!
```

Observed authenticated execution result:

- capture row created: yes
- final status observed: `completed`
- placement result visible in preview/history flow: yes
- error state observed: no

## 7. Sanitized Artifact Record

The following identifiers are intentionally sanitized.

- capture id: `10a66262...fed7`
- capture source host: `www.yna.co.kr`
- storage path: `captures/.../placement_1778253810071.png`

No signed storage URL is recorded in this document.

No token, cookie, or raw session value is recorded in this document.

## 8. Preview / History Confirmation

Authenticated preview/history behavior was confirmed at a basic operator level.

Observed:

- new capture row appeared in authenticated history
- result state advanced to `completed`
- preview/detail surface was openable from the result-review area
- detail/preview text markers were present for the capture detail flow

This gate confirms the protected history/preview workflow is usable after authentication for the approved one-time QA case.

## 9. Logout / Session UX Basic Check

This gate performed only the approved basic-path check.

Confirmed:

- `로그아웃` entry point visible in the authenticated shell
- no session-expired banner shown during the active authenticated run

Not exercised in this gate:

- actual logout click
- forced session expiry
- re-login recovery flow

Those remain separate UX follow-up scope if needed.

## 10. API / Side-Effect Notes

Observed effect classes:

- authenticated capture listing reflected the new row
- capture execution completed through the normal Lens flow
- storage-backed capture output exists for the completed run
- runtime/server-side effects are implied by the successful completed capture path

Not exercised in this gate:

- direct standalone `/api/upload` call
- repeated `/api/captures` submission
- any cleanup or deletion path

## 11. Security / Compliance Notes

The QA run respected the following restrictions:

- no password was read, printed, or stored
- no cookie or token was read, printed, or stored
- no signed URL was recorded
- no raw provider response was recorded
- no browser-profile copying was used
- no existing personal/default Chrome profile was reused for automation

## 12. Visual QA Handoff Scope

This gate produced one authenticated safe capture result that can support the next visual QA discussion.

Allowed handoff scope from this run:

- sanitized capture id reference
- sanitized storage path reference
- result status (`completed`)
- statement that preview/history surfaced the result

This gate does not convert the produced output into a golden PNG or permanent baseline asset.

## 13. Remaining Scope

Still out of scope after this gate:

- general-user permission UX validation
- forced session-expiry recovery validation
- logout completion UX validation
- golden PNG creation
- visual baseline creation

## 14. Recommended Next Gate

Recommended next gate:

```text
Gate Lens-Visual-QA-2 authenticated result visual QA
```

Recommended focus:

- inspect the completed authenticated safe capture result visually
- verify GDN output placement against the approved visual QA criteria
- keep using sanitized references only

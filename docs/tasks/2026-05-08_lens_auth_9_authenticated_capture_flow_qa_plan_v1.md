# Gate Lens-Auth-9 Authenticated Capture Flow QA Plan v1

Date: 2026-05-08
Repo: `admate-lens`
Product: AdMate Lens
Scope: QA planning only

## 1. Goal

Design a safe QA plan for authenticated AdMate Lens capture flow verification after login guard, session-expiry UX, and logout UX have been merged.

This gate does not log in, upload files, execute capture, create storage objects, or change code.

## 2. Planning Assumptions

- Lens login shell, API guard, session-expiry UX, and logout UX are already merged to `main`.
- Capture output, renderer, composite, injection, and storage behavior remain sensitive areas and must not be changed during QA planning.
- Golden PNG and new asset generation remain prohibited in this phase.
- Authenticated QA must be separated from unauthenticated smoke checks because it can create real operational side effects.

## 3. Account Conditions

Authenticated QA should use only a designated low-risk operator account.

Required account conditions:

- valid AdMate Lens access
- non-admin is acceptable if it can complete the target flow
- no production-sensitive advertiser ownership requirement
- no elevated schema, storage, or environment management privileges
- no privileged auth or user-management role

Recommended account profile:

- internal QA/operator account
- already approved for Lens access
- isolated from sensitive campaign ownership where possible

The QA account must not be created, modified, or permission-escalated inside this gate.

## 4. Safe Fixture Conditions

Authenticated QA should use only approved safe fixture inputs.

Required safe fixture properties:

- no real advertiser-sensitive creative
- no sensitive campaign identifiers
- no personally identifiable data
- no customer-confidential landing URLs
- no unapproved third-party assets
- no fixture that could be mistaken for a final report deliverable

Preferred fixture classes:

- approved representative creative image already cleared for QA
- safe publisher URL already known to be acceptable for validation
- safe metadata sample for UI inspection
- safe capture record previously approved for preview/history validation

If any fixture requires creating new upload objects or new capture objects, that action must be explicitly approved in the execution gate before testing begins.

## 5. Capture Execution Approval Gate

Authenticated QA must be split into two layers.

### 5.1 Layer A: Authenticated Non-Execution QA

Can be planned and reviewed first:

- login shell success path review
- authenticated access to `/`
- authenticated route rendering
- authenticated access checks for protected APIs without running full capture
- preview/history UI behavior using approved existing records
- session expiry and logout UX review

### 5.2 Layer B: Authenticated Execution QA

Must wait for a separate explicit approval gate.

That gate should approve:

- real authenticated login attempt
- real upload request
- real capture request creation
- real capture execution request
- any resulting storage object creation
- any resulting DB row creation

Recommended execution gate name:

```text
Gate Lens-Auth-10 authenticated execution QA
```

## 6. Authenticated API Verification Scope

The following API surfaces should be checked under an authenticated session.

### 6.1 `/api/captures`

Check:

- authenticated `GET` returns operator-visible capture data shape
- authenticated `POST` is allowed only in the approved execution gate
- authenticated `DELETE` remains blocked by product policy unless explicitly enabled

What to verify:

- response no longer fails with `401` when the session is valid
- response shape does not expose secret, token, or raw provider credential data
- history list can render from the authenticated response safely

### 6.2 `/api/captures/execute`

Check:

- endpoint is no longer `401` when called with a valid session
- actual execution request is still deferred to the execution approval gate

What to verify:

- guard opens only after valid auth
- no auth/session regression occurs before execution logic

### 6.3 `/api/upload`

Check:

- endpoint is no longer `401` when called with a valid session
- actual file upload remains deferred to the execution approval gate

What to verify:

- guard opens only after valid auth
- no secret, token, or raw provider data is exposed in the authenticated success/error contract

## 7. Storage/Object Creation Policy

Storage creation must be treated as a controlled side effect.

### 7.1 Not Allowed In This Planning Gate

- creating new upload objects
- creating new capture output objects
- generating signed URLs for new QA uploads
- deleting or cleaning existing storage by ad hoc manual action

### 7.2 Allowed Only In Approved Execution QA

- one or more explicitly approved upload objects for safe fixture validation
- one or more explicitly approved capture result objects tied to the QA run
- object creation only when linked to documented QA evidence

### 7.3 Documentation Requirement

Any future authenticated execution QA must record:

- which safe fixture was used
- whether upload object creation occurred
- whether capture output object creation occurred
- whether resulting records need later manual operator cleanup

## 8. Preview/History UI QA Scope

Authenticated UI QA should confirm the operator can safely use the protected Lens workspace after login.

### 8.1 Capture Form

Confirm:

- authenticated user can reach the form
- auth-expiry banner is absent during a valid session
- logout entry point remains visible from the logged-in product shell
- form does not show false `401`-expired messaging during normal authenticated access

### 8.2 Preview/History Area

Confirm:

- authenticated user can reach the history list
- polling/list refresh does not immediately fall into auth-expired state
- preview workspace loads existing approved safe records correctly
- metadata inspector stays readable and does not expose secret or unsafe raw auth/session data

### 8.3 Existing Actions

Review only with approved safe records:

- download action visibility
- copy/open-original actions
- disabled or empty states where storage path or output URL is absent

This gate does not authorize downloading or externally redistributing any resulting image.

## 9. Session Expiry And Logout UX Scope

Authenticated QA must explicitly include auth-boundary UX review.

### 9.1 Session Expiry

Confirm:

- expired or invalid session causes protected API access to surface the intended product message
- capture form and preview/history area distinguish auth expiry from ordinary errors
- re-login call-to-action points back to Lens using the existing `next` pattern

### 9.2 Logout

Confirm:

- logout entry point is visible in the logged-in Lens shell
- logout calls existing `/api/auth/logout`
- logout returns the user to `/login`
- logout does not expose secret, token, or provider-auth data in the client-visible response

## 10. Connection To Visual QA

Authenticated capture flow QA and visual QA meet at the preview/history workspace and at any future approved execution outputs.

Connection points:

- authenticated preview/history UI must work before visual QA can be trusted
- safe capture record availability is a prerequisite for realistic preview workspace review
- approved representative PNG or approved safe capture output is still required for full visual QA

This means:

- Auth-9 prepares the flow and control rules
- visual QA execution should happen only after both auth flow QA approval and fixture approval exist

## 11. Golden PNG And Asset Rule

Golden PNG and new asset generation remain prohibited in this gate.

Do not:

- add new golden PNG
- update golden PNG
- create new visual baseline assets
- treat ad hoc QA outputs as permanent regression baselines

## 12. Rollback And Cleanup Rule

Authenticated QA planning must avoid casual cleanup assumptions.

Do not assume:

- ad hoc deletion of QA rows
- ad hoc deletion of storage objects
- manual rollback by direct DB or storage edits

If future execution QA creates records or objects, cleanup must be explicitly approved and documented as its own operator-safe step.

## 13. Recommended Execution Sequence

Future authenticated QA should follow this order:

1. confirm approved QA account
2. confirm approved safe fixture set
3. confirm explicit execution approval
4. verify authenticated route access and non-`401` API access
5. run the smallest possible authenticated upload/capture flow
6. inspect preview/history UI with resulting safe records
7. verify session expiry/logout UX
8. hand off to visual QA only if the authenticated flow remains stable

## 14. Blockers Before Execution

Do not start authenticated execution QA until all of the following are true:

- approved QA account exists
- approved safe fixture exists
- product owner explicitly approves real upload/capture side effects
- expected storage/object side effects are acknowledged
- evidence handling rules are documented

## 15. Next Gate Recommendation

Recommended next gate:

```text
Gate Lens-Auth-10 authenticated execution QA
```

Recommended scope for that next gate:

- log in with approved QA account
- verify authenticated `/`, `/api/captures`, `/api/captures/execute`, `/api/upload`
- run one smallest safe upload/capture flow only if explicitly approved
- inspect preview/history UI with resulting safe record
- stop before visual baseline creation
